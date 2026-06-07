/**
 * PactPay backend HTTP API (Hono).
 *  x402 proof oracle · wallet auth · airdrop · deals (register/accept/submit/run-agent/release)
 *  · admin metric override (Test Console).
 * Run from backend/:  npm run dev
 */
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { setCookie, getCookie } from 'hono/cookie'
import { timingSafeEqual } from 'node:crypto'
import { paymentMiddleware, x402ResourceServer, type Network } from '@x402/hono'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { ExactAvmScheme } from '@x402/avm/exact/server'
import { ALGORAND_TESTNET_CAIP2 } from '@x402/avm'
import { ENV, loraTx } from './lib/env.ts'
import { fetchProof, setMetricOverride } from './lib/proof.ts'
import { makeChallenge, verifyChallenge, signJwt, verifyJwt } from './lib/auth.ts'
import { airdrop } from './lib/dispenser.ts'
import { getEscrow, submitVerdict, releaseMilestone, acct } from './lib/escrow.ts'
import { agentCheck } from './lib/verifyAgent.ts'
import { redisPing } from './lib/store.ts'
import * as repo from './lib/repo.ts'
import { dbPing } from './lib/db.ts'
import { socialRoutes } from './lib/socialOAuth.ts'
import { startWorkers } from './jobs.ts'

const lastTx = (r: any): string | undefined => r?.txIds?.[r.txIds.length - 1]
const CHALLENGE_WINDOW_SECS = Number(process.env.CHALLENGE_WINDOW_SECS ?? '15') // matches the deployed contract

// register the backend's signers (agent attests; admin releases/resolves)
acct(ENV.ADMIN_MNEMONIC); acct(ENV.AGENT_MNEMONIC)

// cross-site cookies so the web app (different Railway subdomain) keeps its session
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as 'Strict' | 'Lax' | 'None') ?? 'None'
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false'

const facilitator = new HTTPFacilitatorClient({ url: ENV.FACILITATOR })
const resourceServer = new x402ResourceServer(facilitator).register(ALGORAND_TESTNET_CAIP2, new ExactAvmScheme())

const app = new Hono()
app.use(cors({ origin: (o) => o ?? '*', credentials: true, exposeHeaders: ['PAYMENT-REQUIRED', 'payment-required', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE'] }))
app.use(paymentMiddleware({
  'GET /api/proof': { accepts: { scheme: 'exact' as const, network: ALGORAND_TESTNET_CAIP2 as Network, payTo: ENV.TREASURY_ADDR, price: { amount: ENV.X402_PROOF_PRICE_MICRO, asset: String(ENV.USDC_ASA) } }, description: 'x402 proof oracle' },
}, resourceServer))

async function requireAuth(c: Context, next: Next) {
  const token = getCookie(c, 'token')
  const wallet = token ? await verifyJwt(token) : null
  if (!wallet) return c.json({ error: 'Authentication required' }, 401)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const a = getCookie(c, 'csrf') ?? '', b = c.req.header('x-csrf-token') ?? ''
    if (!a || !b || a.length !== b.length || !timingSafeEqual(Buffer.from(a), Buffer.from(b))) return c.json({ error: 'Invalid CSRF token' }, 403)
  }
  c.set('wallet', wallet); await next()
}

app.get('/health', async (c) => c.json({ ok: true, escrowApp: String(ENV.ESCROW_APP_ID), usdcAsa: String(ENV.USDC_ASA), network: 'testnet', admin: ENV.OWNER_ADDR, redis: await redisPing(), db: await dbPing() }))
app.get('/api/proof', async (c) => c.json(await fetchProof(c.req.query('platform') ?? 'x', c.req.query('postUrl') ?? '', c.req.query('metric') ?? 'likes')))

app.get('/api/auth/challenge', (c) => { const a = c.req.query('address'); return a ? c.json({ message: makeChallenge(a) }) : c.json({ error: 'address required' }, 400) })
app.post('/api/auth/verify', async (c) => {
  const { address, signature } = await c.req.json()
  if (!address || !signature || !verifyChallenge(address, signature)) return c.json({ error: 'Invalid signature' }, 401)
  const csrf = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  setCookie(c, 'token', await signJwt(address), { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAMESITE, path: '/', maxAge: 604800 })
  setCookie(c, 'csrf', csrf, { httpOnly: false, secure: COOKIE_SECURE, sameSite: COOKIE_SAMESITE, path: '/', maxAge: 604800 })
  return c.json({ ok: true, address, csrfToken: csrf })
})
app.get('/api/auth/me', requireAuth, (c) => c.json({ wallet: c.get('wallet') }))
app.post('/api/users/airdrop', requireAuth, async (c) => {
  const wallet = c.get('wallet') as string
  const { role } = await c.req.json().catch(() => ({}))
  try {
    await repo.upsertUser(wallet, role === 'brand' ? 'BRAND' : role === 'creator' ? 'CREATOR' : undefined)
    const res = await airdrop(wallet)
    await repo.markFunded(wallet)
    return c.json(res)
  } catch (e: any) { return c.json({ error: `airdrop failed: ${e?.message ?? e}` }, 500) }
})
app.get('/api/users/me', requireAuth, async (c) => {
  const wallet = c.get('wallet') as string
  const [user, socials] = await Promise.all([repo.getUser(wallet), repo.getSocials(wallet)])
  return c.json({ wallet, role: user?.role ?? null, fundedTestnet: user?.fundedTestnet ?? false, socials })
})
app.get('/api/users/socials', requireAuth, async (c) => c.json(await repo.getSocials(c.get('wallet') as string)))

app.get('/api/deals', async (c) => c.json(await repo.listDeals()))
app.get('/api/deals/:id', async (c) => { const d = await repo.getDeal(c.req.param('id')); return d ? c.json(d) : c.json({ error: 'not found' }, 404) })

/** brand registers a deal they already funded on-chain (client-signed) */
app.post('/api/deals', requireAuth, async (c) => {
  const wallet = c.get('wallet') as string
  const b = await c.req.json()
  const d = await repo.registerDeal({ onchainId: String(b.onchainId), brandWallet: wallet, title: b.title, brief: b.brief, platform: b.platform, milestones: b.milestones ?? [], fundTx: b.fundTx, deadlineUnix: b.deadlineUnix })
  return c.json(d)
})
/** creator applies to a funded deal (registers interest + their verified @handle) */
app.post('/api/deals/:id/apply', requireAuth, async (c) => {
  const id = c.req.param('id'); const wallet = c.get('wallet') as string
  const d = await repo.getDeal(id); if (!d) return c.json({ error: 'not found' }, 404)
  if (wallet === d.brand) return c.json({ error: 'a brand cannot apply to its own deal' }, 400)
  if (d.creator) return c.json({ error: 'a creator is already bound to this deal' }, 400)
  const { handle } = await c.req.json().catch(() => ({}))
  return c.json(await repo.applyToDeal(id, wallet, handle))
})
/** brand binds the chosen creator on-chain (acceptApplication signed client-side by the brand) */
app.post('/api/deals/:id/accept', requireAuth, async (c) => {
  const id = c.req.param('id'); const d = await repo.getDeal(id); if (!d) return c.json({ error: 'not found' }, 404)
  if ((c.get('wallet') as string) !== d.brand) return c.json({ error: 'only the brand can accept a creator' }, 403)
  const { creator, acceptTx } = await c.req.json()
  if (!creator) return c.json({ error: 'creator address required' }, 400)
  return c.json(await repo.acceptCreator(id, creator, acceptTx))
})
app.post('/api/deals/:id/submit', requireAuth, async (c) => {
  const id = c.req.param('id'); const wallet = c.get('wallet') as string
  const d = await repo.getDeal(id); if (!d) return c.json({ error: 'not found' }, 404)
  if (!d.creator) return c.json({ error: 'no creator bound yet — the brand must accept you first' }, 400)
  if (wallet !== d.creator) return c.json({ error: 'only the bound creator can submit the post' }, 403)
  const { postUrl } = await c.req.json()
  return c.json(await repo.submitPost(id, postUrl))
})

/** the AI agent: pay x402 for proof → Gemini verdict → submitMilestoneVerdict on-chain */
app.post('/api/deals/:id/run-agent', requireAuth, async (c) => {
  const id = c.req.param('id'); const d = await repo.getDeal(id); if (!d) return c.json({ error: 'not found' }, 404)
  if (!d.creator) return c.json({ error: 'no creator bound yet — accept a creator before running the agent' }, 400)
  if (!d.postUrl) return c.json({ error: 'no post submitted yet' }, 400)
  const index = Number((await c.req.json().catch(() => ({}))).index ?? 0)
  const ms = d.milestones[index]; if (!ms) return c.json({ error: 'bad milestone' }, 400)
  if (ms.status === 'RELEASED') return c.json({ error: 'milestone already released' }, 400)
  try {
    const oracleUrl = `http://localhost:${port}`
    await repo.pushLog(id, `milestone ${index} check started (${ms.metric} ≥ ${ms.threshold})`)
    const { proof, x402Tx, verdict } = await agentCheck({ oracleUrl, platform: d.platform, postUrl: d.postUrl, metric: ms.metric, threshold: ms.threshold, brief: d.brief })
    if (x402Tx) await repo.pushLog(id, `paid 0.01 USDC via x402 for proof  [tx ${x402Tx.slice(0, 6)}… →]`, 'chain')
    await repo.pushLog(id, `proof: ${proof.authorHandle} ${proof.metric}=${proof.metricValue}${proof.real ? ' (live)' : ''} ✓`)
    await repo.pushLog(id, `LLM verdict: ${verdict.pass ? 'PASS' : 'FAIL'} · confidence ${verdict.confidence}`, 'verdict')
    let verdictTx: string | undefined
    if (verdict.pass && verdict.confidence * 100 >= ENV.MIN_CONFIDENCE) {
      const appClient = await getEscrow(ENV.OWNER_ADDR)
      const vr = await submitVerdict(appClient, ENV.AGENT_ORACLE_ADDR, BigInt(id), BigInt(index), true, BigInt(Math.round(verdict.confidence * 100)), BigInt(proof.metricValue))
      verdictTx = lastTx(vr)
      await repo.pushLog(id, 'submit_milestone_verdict → on-chain ✓')
      await repo.pushLog(id, `timelock started — releasable in ${CHALLENGE_WINDOW_SECS}s (challenge window)`)
    } else { await repo.pushLog(id, 'verdict below threshold/confidence — not approved', 'danger') }
    const deal = await repo.recordVerdict(id, index, { pass: verdict.pass, confidence: verdict.confidence, reason: verdict.reason, model: ENV.OPENROUTER_MODEL, observed: proof, observedValue: proof.metricValue, x402Tx, verdictTx })
    return c.json({ proof, verdict, x402Tx, verdictTx, deal })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    await repo.pushLog(id, `agent error: ${msg}`, 'danger')
    return c.json({ error: `agent failed: ${msg}` }, 500)
  }
})

/** release a tranche (permissionless; backend signs with the admin key after the timelock) */
app.post('/api/deals/:id/release', requireAuth, async (c) => {
  const id = c.req.param('id'); const d = await repo.getDeal(id); if (!d) return c.json({ error: 'not found' }, 404)
  if (!d.creator) return c.json({ error: 'no creator bound — nothing to release to' }, 400)
  const index = Number((await c.req.json().catch(() => ({}))).index ?? 0)
  const ms = d.milestones[index]; if (!ms) return c.json({ error: 'bad milestone' }, 400)
  if (ms.status === 'RELEASED') return c.json({ error: 'this tranche was already released' }, 400)
  if (ms.status !== 'REACHED_PENDING') return c.json({ error: 'milestone not approved by the agent yet' }, 400)
  const elapsed = Math.floor(Date.now() / 1000) - (ms.approvedAt ?? 0)
  if (ms.approvedAt && elapsed < CHALLENGE_WINDOW_SECS) return c.json({ error: `challenge window still active — releasable in ${CHALLENGE_WINDOW_SECS - elapsed}s` }, 425)
  try {
    const appClient = await getEscrow(ENV.OWNER_ADDR)
    const r = await releaseMilestone(appClient, ENV.OWNER_ADDR, BigInt(id), BigInt(index))
    const txid = lastTx(r)!
    await repo.pushLog(id, `released ${ms.amountUsdc} USDC → creator`, 'release')
    const deal = await repo.recordRelease(id, index, txid)
    return c.json({ releaseTx: txid, deal })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    return c.json({ error: msg.toLowerCase().includes('assert') ? 'contract rejected the release (timelock or already released)' : `release failed: ${msg}` }, 400)
  }
})

// social-account OAuth verification (X / YouTube / TikTok) → SocialAccount with AES tokens
socialRoutes(app, requireAuth)

app.post('/api/admin/metric-override', requireAuth, async (c) => {
  if ((c.get('wallet') as string) !== ENV.OWNER_ADDR) return c.json({ error: 'admin only' }, 403)
  const { postUrl, metric, value } = await c.req.json(); setMetricOverride(postUrl, metric, Number(value)); return c.json({ ok: true })
})

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8080)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`[api] PactPay backend on :${port} — escrowApp ${ENV.ESCROW_APP_ID}, tUSDC ${ENV.USDC_ASA}`)

// autonomous loop: track metrics → run agent at threshold → auto-release after the window
startWorkers(`http://localhost:${port}`)
export { app, port }
