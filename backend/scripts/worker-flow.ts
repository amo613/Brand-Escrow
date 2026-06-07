/** Proves the autonomous loop: brand funds + accepts + creator submits, then NOBODY clicks —
 *  the trackingWorker runs the agent and the settlementWorker releases. Run from backend/:
 *  WORKER_INTERVAL_MS=4000 npx tsx scripts/worker-flow.ts */
process.env.WORKER_INTERVAL_MS ??= '4000'
import '../src/server.ts'
import algosdk from 'algosdk'
import { acct, getEscrow, createDeal, acceptDeal } from '../src/lib/escrow.ts'
import { ENV } from '../src/lib/env.ts'

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
const post = (p: string, h: any, b?: any) => fetch(BASE + p, { method: 'POST', headers: h, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json())
async function usdc(addr: string) { const i: any = await algod.accountInformation(addr).do(); const x = (i.assets ?? []).find((a: any) => BigInt(a.assetId ?? a['asset-id']) === ENV.USDC_ASA); return x ? Number(x.amount) / 1e6 : 0 }

async function main() {
  await sleep(1)
  const brand = acct(process.env.BRAND_TEST_MNEMONIC!); const creator = acct(process.env.CREATOR_TEST_MNEMONIC!)
  const bS = await login(process.env.BRAND_TEST_MNEMONIC!); const cS = await login(process.env.CREATOR_TEST_MNEMONIC!)
  const app = await getEscrow(brand.addr.toString())
  const dealId = String(Date.now())
  const r = await createDeal(app, brand.addr.toString(), BigInt(dealId), [1], [5000n], [2_000_000n], BigInt(Math.floor(Date.now() / 1000) + 3600))
  await post('/api/deals', bS.h, { onchainId: dealId, title: 'Worker autonomy test', brief: 'Post #PactPay + @nike', platform: 'x', milestones: [{ metric: 1, threshold: 5000, amountUsdc: 2 }], fundTx: r.txIds.at(-1) })
  await acceptDeal(app, brand.addr.toString(), BigInt(dealId), creator.addr.toString())
  await post(`/api/deals/${dealId}/accept`, bS.h, { creator: creator.addr.toString(), acceptTx: 'x' })
  await post(`/api/deals/${dealId}/submit`, cS.h, { postUrl: `https://x.com/maxfit/status/${dealId}` })
  const c0 = await usdc(creator.addr.toString())
  console.log('setup done — NO manual run-agent / release. Waiting for the workers…')

  for (let i = 0; i < 30; i++) {
    await sleep(4)
    const d = await (await fetch(`${BASE}/api/deals/${dealId}`)).json()
    const ms = d.milestones[0]
    process.stdout.write(`  t+${(i + 1) * 4}s  milestone=${ms.status}\n`)
    if (ms.status === 'RELEASED') {
      const c1 = await usdc(creator.addr.toString())
      console.log(`\ncreator USDC ${c0} → ${c1} (+${(c1 - c0).toFixed(2)})`)
      if (c1 - c0 !== 2) throw new Error('expected +2 USDC')
      console.log('✅ AUTONOMOUS LOOP PASSED — workers ran the agent + released, zero manual clicks')
      process.exit(0)
    }
  }
  throw new Error('timeout — workers did not release')
}
main().catch((e) => { console.error('❌ worker-flow failed:', e?.message ?? e); process.exit(1) })
