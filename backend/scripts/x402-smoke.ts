/** x402 smoke test: the AI agent pays tUSDC to the proof oracle and gets the data back.
 *  Proves the full x402 round-trip (402 → sign → settle on TestNet → 200) with our own asset.
 *  Run from backend/:  npx tsx scripts/x402-smoke.ts */
import algosdk from 'algosdk'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ENV, loraTx } from '../src/lib/env.ts'
import { startOracle } from '../src/oracle.ts'
import { makeAgentFetch, settleTxFromResponse } from '../src/lib/x402client.ts'
import { setMetricOverride } from '../src/lib/proof.ts'

const algorand = AlgorandClient.testNet()
const algod = new algosdk.Algodv2('', ENV.ALGOD_SERVER, 443)
const owner = algorand.account.fromMnemonic(ENV.ADMIN_MNEMONIC)
const agent = algorand.account.fromMnemonic(ENV.AGENT_MNEMONIC)

async function info(addr: string) {
  const i: any = await algod.accountInformation(addr).do()
  const a = (i.assets ?? []).find((x: any) => BigInt(x.assetId ?? x['asset-id']) === ENV.USDC_ASA)
  return { algo: Number(i.amount) / 1e6, usdc: a ? Number(a.amount) / 1e6 : 0, optedIn: !!a }
}

async function main() {
  console.log(`tUSDC #${ENV.USDC_ASA} · treasury ${ENV.TREASURY_ADDR.slice(0, 8)}… · agent ${agent.addr.toString().slice(0, 8)}…`)
  const ai = await info(agent.addr.toString())
  if (!ai.optedIn) { await algorand.send.assetOptIn({ sender: agent.addr, assetId: ENV.USDC_ASA }); console.log('agent opted into tUSDC') }
  if ((await info(agent.addr.toString())).usdc < 1) {
    await algorand.send.assetTransfer({ sender: owner.addr, receiver: agent.addr, assetId: ENV.USDC_ASA, amount: 5_000_000n }); console.log('funded agent 5 tUSDC')
  }

  const server = startOracle(4021)
  await new Promise((r) => setTimeout(r, 600))
  setMetricOverride('https://x.com/maxfit/status/1', 'likes', 5140)

  const agentFetch = makeAgentFetch(ENV.AGENT_MNEMONIC)
  console.log('\nagent → x402 proof oracle …')
  const before = await info(agent.addr.toString())
  const res = await agentFetch('http://localhost:4021/api/proof?platform=x&postUrl=https%3A%2F%2Fx.com%2Fmaxfit%2Fstatus%2F1&metric=likes')
  const body: any = await res.json()
  const after = await info(agent.addr.toString())
  const tx = settleTxFromResponse(res)

  console.log('\nstatus     :', res.status)
  console.log('proof      :', JSON.stringify(body))
  console.log('agent USDC :', before.usdc, '→', after.usdc, `(paid ${(before.usdc - after.usdc).toFixed(3)} tUSDC, gasless)`)
  console.log('settle tx  :', tx ? loraTx(tx) : '(no tx id in PAYMENT-RESPONSE header)')

  const ok = res.status === 200 && body.metricValue === 5140
  console.log(ok ? '\n✅ x402 round-trip works with tUSDC' : '\n❌ unexpected result')
  server.close?.()
  process.exit(ok ? 0 : 1)
}
main().catch((e) => { console.error('\n❌ smoke failed:\n', e?.message ?? e); process.exit(1) })
