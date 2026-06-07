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
import { loadDeals, persistDeal, redisPing } from './lib/store.ts'

const METRICS = ['posted', 'likes', 'views', 'comments', 'shares', 'followers']
const lastTx = (r: any): string | undefined => r?.txIds?.[r.txIds.length - 1]

interface Milestone { index: number; metric: string; threshold: number; amountUsdc: number; status: string; releaseTx?: string }
interface DealMeta {
  id: string; brand: string; creator?: string; title: string; brief: string; platform: string; postUrl?: string
  status: string; milestones: Milestone[]; agentLog: { t: string; text: string; kind: string }[]
  tx: { fund?: string; accept?: string; x402?: string; verdict?: string; release?: string }; createdAt: number
}
const deals = new Map<string, DealMeta>()
const save = (d: DealMeta) => { deals.set(d.id, d); persistDeal(d.id, d) }
// hydrate from Redis on boot (no-op when REDIS_URL is unset)
void loadDeals<DealMeta>().then((ds) => { for (const d of ds) deals.set(d.id, d); if (ds.length) console.log(`[store] hydrated ${ds.length} deals from Redis`) })

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

app.get('/health', async (c) => c.json({ ok: true, escrowApp: String(ENV.ESCROW_APP_ID), usdcAsa: String(ENV.USDC_ASA), network: 'testnet', admin: ENV.OWNER_ADDR, redis: await redisPing() }))
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
app.post('/api/users/airdrop', requireAuth, async (c) => c.json(await airdrop(c.get('wallet') as string)))

app.get('/api/deals', (c) => c.json([...deals.values()].sort((a, b) => b.createdAt - a.createdAt)))
app.get('/api/deals/:id', (c) => { const d = deals.get(c.req.param('id')); return d ? c.json(d) : c.json({ error: 'not found' }, 404) })

/** brand registers a deal they already funded on-chain (client-signed) */
app.post('/api/deals', requireAuth, async (c) => {
  const wallet = c.get('wallet') as string
  const b = await c.req.json()
  const meta: DealMeta = {
    id: String(b.onchainId), brand: wallet, title: b.title, brief: b.brief, platform: b.platform, status: 'FUNDED',
    milestones: (b.milestones ?? []).map((m: any, i: number) => ({ index: i, metric: typeof m.metric === 'number' ? METRICS[m.metric] : m.metric, threshold: Number(m.threshold), amountUsdc: Number(m.amountUsdc), status: 'PENDING' })),
    agentLog: [], tx: { fund: b.fundTx }, createdAt: Date.now(),
  }
  save(meta); return c.json(meta)
})
app.post('/api/deals/:id/accept', requireAuth, async (c) => {
  const d = deals.get(c.req.param('id')); if (!d) return c.json({ error: 'not found' }, 404)
  const { creator, acceptTx } = await c.req.json(); d.creator = creator; d.status = 'ACCEPTED'; d.tx.accept = acceptTx; save(d); return c.json(d)
})
app.post('/api/deals/:id/submit', requireAuth, async (c) => {
  const d = deals.get(c.req.param('id')); if (!d) return c.json({ error: 'not found' }, 404)
  const { postUrl } = await c.req.json(); d.postUrl = postUrl; d.status = 'TRACKING'; save(d); return c.json(d)
})

/** the AI agent: pay x402 for proof → Gemini verdict → submitMilestoneVerdict on-chain */
app.post('/api/deals/:id/run-agent', requireAuth, async (c) => {
  const d = deals.get(c.req.param('id')); if (!d) return c.json({ error: 'not found' }, 404)
  if (!d.postUrl) return c.json({ error: 'no post submitted' }, 400)
  const index = Number((await c.req.json().catch(() => ({}))).index ?? 0)
  const ms = d.milestones[index]; if (!ms) return c.json({ error: 'bad milestone' }, 400)
  const oracleUrl = `http://localhost:${port}`
  const ts = () => new Date().toTimeString().slice(0, 8)
  const log = (text: string, kind = 'info') => d.agentLog.push({ t: ts(), text, kind })
  log(`milestone ${index} check started (${ms.metric} ≥ ${ms.threshold})`)
  const { proof, x402Tx, verdict } = await agentCheck({ oracleUrl, platform: d.platform, postUrl: d.postUrl, metric: ms.metric, threshold: ms.threshold, brief: d.brief })
  if (x402Tx) { d.tx.x402 = x402Tx; log(`paid 0.01 USDC via x402 for proof  [tx ${x402Tx.slice(0, 6)}… →]`, 'chain') }
  log(`proof: ${proof.authorHandle} ${proof.metric}=${proof.metricValue} ✓`)
  log(`LLM verdict: ${verdict.pass ? 'PASS' : 'FAIL'} · confidence ${verdict.confidence}`, 'verdict')
  let verdictTx: string | undefined
  if (verdict.pass && verdict.confidence * 100 >= ENV.MIN_CONFIDENCE) {
    const appClient = await getEscrow(ENV.OWNER_ADDR)
    const vr = await submitVerdict(appClient, ENV.AGENT_ORACLE_ADDR, BigInt(d.id), BigInt(index), true, BigInt(Math.round(verdict.confidence * 100)), BigInt(proof.metricValue))
    verdictTx = lastTx(vr); d.tx.verdict = verdictTx; ms.status = 'REACHED_PENDING'; log('submit_milestone_verdict → on-chain ✓')
    log('timelock started — releasable after the challenge window')
  } else { log('verdict below threshold/confidence — not approved', 'danger') }
  save(d)
  return c.json({ proof, verdict, x402Tx, verdictTx, deal: d })
})

/** release a tranche (permissionless; backend signs with the admin key after the timelock) */
app.post('/api/deals/:id/release', requireAuth, async (c) => {
  const d = deals.get(c.req.param('id')); if (!d) return c.json({ error: 'not found' }, 404)
  const index = Number((await c.req.json().catch(() => ({}))).index ?? 0)
  const ms = d.milestones[index]; if (!ms) return c.json({ error: 'bad milestone' }, 400)
  const appClient = await getEscrow(ENV.OWNER_ADDR)
  const r = await releaseMilestone(appClient, ENV.OWNER_ADDR, BigInt(d.id), BigInt(index))
  const txid = lastTx(r); ms.status = 'RELEASED'; ms.releaseTx = txid; d.tx.release = txid
  d.status = d.milestones.every((m) => m.status === 'RELEASED') ? 'RELEASED' : 'PARTIALLY_RELEASED'
  d.agentLog.push({ t: new Date().toTimeString().slice(0, 8), text: `released ${ms.amountUsdc} USDC → creator`, kind: 'release' })
  save(d)
  return c.json({ releaseTx: txid, deal: d })
})

app.post('/api/admin/metric-override', requireAuth, async (c) => {
  if ((c.get('wallet') as string) !== ENV.OWNER_ADDR) return c.json({ error: 'admin only' }, 403)
  const { postUrl, metric, value } = await c.req.json(); setMetricOverride(postUrl, metric, Number(value)); return c.json({ ok: true })
})

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8080)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`[api] PactPay backend on :${port} — escrowApp ${ENV.ESCROW_APP_ID}, tUSDC ${ENV.USDC_ASA}`)
export { app, port }
