/**
 * FULL agentic backend loop on TestNet — everything wired together:
 *   brand creates+funds deal → brand accepts (bind creator) → creator posts (metric override)
 *   → AGENT pays x402 for proof → Gemini verdict → submitMilestoneVerdict on-chain
 *   → timelock → releaseMilestone → creator paid.
 * Run from backend/:  npx tsx scripts/backend-e2e.ts
 */
import algosdk from 'algosdk'
import { ENV, loraTx } from '../src/lib/env.ts'
import { acct, getEscrow, createDeal, acceptDeal, submitVerdict, releaseMilestone } from '../src/lib/escrow.ts'
import { startOracle } from '../src/oracle.ts'
import { setMetricOverride } from '../src/lib/proof.ts'
import { agentCheck } from '../src/lib/verifyAgent.ts'

const algod = new algosdk.Algodv2('', ENV.ALGOD_SERVER, 443)
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))
const owner = acct(ENV.ADMIN_MNEMONIC)
const brand = acct(process.env.BRAND_TEST_MNEMONIC!)
const creator = acct(process.env.CREATOR_TEST_MNEMONIC!)
const agent = acct(ENV.AGENT_MNEMONIC) // register agent signer for submitMilestoneVerdict
void owner

async function usdc(addr: string) {
  const i: any = await algod.accountInformation(addr).do()
  const a = (i.assets ?? []).find((x: any) => BigInt(x.assetId ?? x['asset-id']) === ENV.USDC_ASA)
  return a ? Number(a.amount) / 1e6 : 0
}
const links: Array<[string, string]> = []
const rec = (label: string, id?: string) => { if (id) { links.push([label, id]); console.log(`  ✓ ${label}\n    ${loraTx(id)}`) } }
const tx = (r: any): string | undefined => {
  if (r?.txIds?.length) return r.txIds[r.txIds.length - 1]
  const t = r?.transaction?.txID
  return typeof t === 'function' ? r.transaction.txID() : t
}

async function main() {
  console.log(`Agentic backend loop · EscrowApp ${ENV.ESCROW_APP_ID} · tUSDC ${ENV.USDC_ASA}`)
  const server = startOracle(4021)
  await sleep(0.6)
  const oracleUrl = 'http://localhost:4021'
  const app = await getEscrow(brand.addr.toString())

  const dealId = BigInt(Date.now())
  const postUrl = `https://x.com/maxfit/status/${dealId}`
  const brief = 'Post a Reel featuring #PactPay + @nike'
  const metric = 'likes'
  const threshold = 5000n
  const amount = 2_000_000n
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

  console.log('\n1) brand creates + funds deal')
  rec('createDeal (brand funds 2 tUSDC)', tx(await createDeal(app, brand.addr.toString(), dealId, [1], [threshold], [amount], deadline)))

  console.log('2) brand accepts → binds creator')
  rec('acceptApplication', tx(await acceptDeal(app, brand.addr.toString(), dealId, creator.addr.toString())))
  const c0 = await usdc(creator.addr.toString())

  console.log('3) creator posts the content + submits the link (tracking sees the metric cross the threshold)')
  setMetricOverride(postUrl, metric, 5140)

  console.log('4) AGENT pays x402 for proof + runs the Gemini verdict')
  const { proof, x402Tx, verdict } = await agentCheck({ oracleUrl, platform: 'x', postUrl, metric, threshold: Number(threshold), brief })
  rec('agent x402 proof payment', x402Tx)
  console.log(`    • proof: ${proof.authorHandle} ${proof.metric}=${proof.metricValue} · avatar ${proof.profileImage}`)
  console.log(`    • Gemini verdict: pass=${verdict.pass} confidence=${verdict.confidence} model=${verdict.model}`)
  console.log(`    • reason: "${verdict.reason}"`)

  if (!(verdict.pass && verdict.confidence * 100 >= ENV.MIN_CONFIDENCE)) throw new Error('verdict below threshold/confidence — would not auto-approve')

  console.log('5) agent attests on-chain (contract re-checks oracle + confidence + observed≥threshold)')
  rec('submitMilestoneVerdict (agent → on-chain)', tx(await submitVerdict(app, agent.addr.toString(), dealId, 0n, true, BigInt(Math.round(verdict.confidence * 100)), BigInt(proof.metricValue))))

  console.log('6) timelock challenge window …')
  await sleep(20)
  rec('releaseMilestone (contract → creator)', tx(await releaseMilestone(app, creator.addr.toString(), dealId, 0n)))

  const c1 = await usdc(creator.addr.toString())
  console.log(`\n  creator tUSDC: ${c0} → ${c1}  (+${(c1 - c0).toFixed(2)})`)
  if (c1 - c0 !== 2) throw new Error(`expected creator +2 tUSDC, got +${c1 - c0}`)

  console.log('\n✅ FULL AGENTIC BACKEND LOOP PASSED — x402 proof → AI verdict → on-chain release')
  console.log('\nLora links:')
  for (const [l, id] of links) console.log(`  ${l}\n    ${loraTx(id)}`)
  server.close?.()
  process.exit(0)
}
main().catch((e) => { console.error('\n❌ backend e2e failed:\n', e?.message ?? e); process.exit(1) })
