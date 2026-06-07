/** Full HTTP flow integration test (exactly the calls the frontend makes):
 *  brand auth → on-chain createDeal+register → accept → creator submit → run-agent (x402+Gemini) → release.
 *  Run from backend/:  npx tsx scripts/api-flow.ts */
import '../src/server.ts'
import algosdk from 'algosdk'
import { acct, getEscrow, createDeal, acceptDeal } from '../src/lib/escrow.ts'
import { ENV, loraTx } from '../src/lib/env.ts'

const BASE = 'http://localhost:8080'
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))
const algod = new algosdk.Algodv2('', ENV.ALGOD_SERVER, 443)

async function login(mn: string) {
  const a = algosdk.mnemonicToSecretKey(mn); const addr = String(a.addr)
  const { message } = await (await fetch(`${BASE}/api/auth/challenge?address=${addr}`)).json()
  const sig = Buffer.from(algosdk.signBytes(new TextEncoder().encode(message), a.sk)).toString('base64')
  const r = await fetch(`${BASE}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, signature: sig }) })
  const v = await r.json(); const cookies = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return { addr, h: { Cookie: cookies, 'x-csrf-token': v.csrfToken, 'Content-Type': 'application/json' } }
}
const post = (path: string, h: any, body?: any) => fetch(BASE + path, { method: 'POST', headers: h, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json())
async function usdc(addr: string) { const i: any = await algod.accountInformation(addr).do(); const x = (i.assets ?? []).find((a: any) => BigInt(a.assetId ?? a['asset-id']) === ENV.USDC_ASA); return x ? Number(x.amount) / 1e6 : 0 }

async function main() {
  await sleep(0.9)
  const brand = acct(process.env.BRAND_TEST_MNEMONIC!)
  const creator = acct(process.env.CREATOR_TEST_MNEMONIC!)
  const bS = await login(process.env.BRAND_TEST_MNEMONIC!)
  const cS = await login(process.env.CREATOR_TEST_MNEMONIC!)
  console.log('brand + creator authed via HTTP ✓')

  const app = await getEscrow(brand.addr.toString())
  const dealId = String(Date.now())
  const postUrl = `https://x.com/maxfit/status/${dealId}`

  // 1) brand creates+funds on-chain (frontend does this client-signed) → register via API
  const r = await createDeal(app, brand.addr.toString(), BigInt(dealId), [1], [5000n], [2_000_000n], BigInt(Math.floor(Date.now() / 1000) + 3600))
  const fundTx = r.txIds[r.txIds.length - 1]
  await post('/api/deals', bS.h, { onchainId: dealId, title: 'HTTP-flow test deal', brief: 'Post #PactPay + @nike', platform: 'x', milestones: [{ metric: 1, threshold: 5000, amountUsdc: 2 }], fundTx })
  console.log('createDeal + register ✓', loraTx(fundTx))

  // 2) brand accepts (binds creator) on-chain → API
  const at = (await acceptDeal(app, brand.addr.toString(), BigInt(dealId), creator.addr.toString())).txIds.at(-1)!
  await post(`/api/deals/${dealId}/accept`, bS.h, { creator: creator.addr.toString(), acceptTx: at })
  console.log('accept (bind creator) ✓', loraTx(at))

  // 3) creator submits the post link
  await post(`/api/deals/${dealId}/submit`, cS.h, { postUrl })
  console.log('creator submit ✓')
  const c0 = await usdc(creator.addr.toString())

  // 4) run the agent (x402 proof + Gemini verdict + on-chain attest)
  const ra = await post(`/api/deals/${dealId}/run-agent`, cS.h, { index: 0 })
  console.log(`run-agent ✓  verdict pass=${ra.verdict?.pass} conf=${ra.verdict?.confidence}`)
  console.log('  x402   :', ra.x402Tx ? loraTx(ra.x402Tx) : '(none)')
  console.log('  verdict:', ra.verdictTx ? loraTx(ra.verdictTx) : '(none)')
  if (!ra.verdictTx) throw new Error('agent did not attest on-chain')

  // 5) wait the timelock, then release
  console.log('waiting timelock…'); await sleep(18)
  const rel = await post(`/api/deals/${dealId}/release`, cS.h, { index: 0 })
  console.log('release ✓', rel.releaseTx ? loraTx(rel.releaseTx) : rel.error)
  const c1 = await usdc(creator.addr.toString())
  console.log(`\ncreator USDC ${c0} → ${c1} (+${(c1 - c0).toFixed(2)})`)
  if (c1 - c0 !== 2) throw new Error('expected creator +2 USDC')
  console.log('\n✅ FULL HTTP FLOW PASSED — every endpoint the frontend uses works end-to-end')
  process.exit(0)
}
main().catch((e) => { console.error('\n❌ api-flow failed:\n', e?.message ?? e); process.exit(1) })
