/**
 * PactPay EscrowApp — FULL end-to-end on Algorand TestNet.
 * Self-contained + idempotent: mints ONE reusable test-USDC ASA (tUSDC) and deploys ONE
 * reusable e2e EscrowApp (both persisted to .env), then runs every scenario with fresh
 * dealIds each run. No faucet dependency for USDC. Real TestNet, real Lora links.
 *
 * Run from contracts/:  npx tsx scripts/e2e.ts
 *
 * Scenarios:
 *   S1 happy multi-milestone (timelock blocks early release; release ×2; exact amount/recipient)
 *   S2 GUARDRAIL on-chain threshold re-check (observed < threshold does NOT approve)
 *   S3 GUARDRAIL oracle-only verdict (brand rejected, agent accepted)
 *   S4 dispute → admin REFUND (brand made whole; release on disputed deal blocked)
 *   S5 dispute → admin UPHOLD (creator paid)
 *   S6 no-show (refund before deadline blocked; after deadline refunds all unreleased to brand)
 */
import dotenv from 'dotenv'
import algosdk from 'algosdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { EscrowAppFactory } from '../smart_contracts/escrow/EscrowClient'

dotenv.config({ path: '../.env' })
const LORA = 'https://lora.algokit.io/testnet'
const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', 443)
const algorand = AlgorandClient.testNet()
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))

const owner = algorand.account.fromMnemonic(process.env.ADMIN_MNEMONIC!)
const agent = algorand.account.fromMnemonic(process.env.AGENT_MNEMONIC!)
const brand = algorand.account.fromMnemonic(process.env.BRAND_TEST_MNEMONIC!)
const creator = algorand.account.fromMnemonic(process.env.CREATOR_TEST_MNEMONIC!)

const CHALLENGE_WINDOW = 15n // long enough to dispute within, given ~4s/txn confirmation latency
const MIN_CONF = 80n
const BOX_PAY = AlgoAmount.MicroAlgo(150_000)
const INNER_FEE = AlgoAmount.MicroAlgo(3_000)
const WAIT = 20 // seconds to clear the timelock before a release (> CHALLENGE_WINDOW)

let TUSDC = 0n
const txlog: Array<{ label: string; id: string }> = []
function rec(label: string, id?: string) {
  if (id) { txlog.push({ label, id }); console.log(`   ✓ ${label}\n     ${LORA}/transaction/${id}`) }
}
function setEnv(k: string, v: string) {
  let e = readFileSync('../.env', 'utf8')
  const re = new RegExp(`^${k}=.*$`, 'm')
  e = re.test(e) ? e.replace(re, `${k}=${v}`) : e + (e.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`
  writeFileSync('../.env', e); process.env[k] = v
}
async function acctInfo(addr: string) {
  const i: any = await algod.accountInformation(addr).do()
  const a = (i.assets ?? []).find((x: any) => BigInt(x.assetId ?? x['asset-id']) === TUSDC)
  return { algo: Number(i.amount) / 1e6, usdc: a ? Number(a.amount) / 1e6 : 0, optedIn: !!a }
}
const usdcBal = async (a: string) => (await acctInfo(a)).usdc
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log(`   ✔ ${msg}`)
}
async function expectFail(fn: () => Promise<unknown>, label: string) {
  try { await fn() } catch (e: any) {
    if (String(e.message).startsWith('EXPECTED')) throw e
    console.log(`   ✔ correctly rejected: ${label}`); return
  }
  throw new Error(`EXPECTED FAILURE but SUCCEEDED: ${label}`)
}
async function ensureAlgo(addr: any, min: number) {
  const { algo } = await acctInfo(addr.toString())
  if (algo < min) await algorand.send.payment({ sender: owner.addr, receiver: addr, amount: AlgoAmount.Algos(min - algo + 0.05) })
}

async function getTusdc() {
  if (process.env.E2E_TUSDC_ASA) { TUSDC = BigInt(process.env.E2E_TUSDC_ASA); console.log(`reuse tUSDC #${TUSDC}`); return }
  const c = await algorand.send.assetCreate({ sender: owner.addr, total: 10n ** 15n, decimals: 6, assetName: 'PactPay Test USDC', unitName: 'tUSDC', manager: owner.addr, reserve: owner.addr })
  TUSDC = BigInt(c.assetId); setEnv('E2E_TUSDC_ASA', String(TUSDC))
  rec('create tUSDC ASA #' + TUSDC, c.txIds[0]); console.log(`   ${LORA}/asset/${TUSDC}`)
}

async function getApp() {
  const factory = algorand.client.getTypedAppFactory(EscrowAppFactory, { defaultSender: owner.addr })
  if (process.env.E2E_APP_ID) {
    console.log(`reuse EscrowApp #${process.env.E2E_APP_ID}`)
    return factory.getAppClientById({ appId: BigInt(process.env.E2E_APP_ID) })
  }
  const { appClient, result } = await factory.send.create.createApplication({
    args: { agentOracle: agent.addr.toString(), usdcAsa: TUSDC, challengeWindow: CHALLENGE_WINDOW, minConfidence: MIN_CONF },
  })
  rec('create e2e EscrowApp #' + appClient.appId, result.txIds[0])
  await algorand.send.payment({ sender: owner.addr, receiver: appClient.appAddress, amount: AlgoAmount.Algos(0.4) })
  const boot = await appClient.send.bootstrap({ args: {}, staticFee: INNER_FEE })
  rec('bootstrap (app opts into tUSDC)', boot.transaction.txID())
  setEnv('E2E_APP_ID', String(appClient.appId))
  console.log(`   ${LORA}/application/${appClient.appId}`)
  return appClient
}

async function createDeal(app: any, dealId: bigint, metrics: number[], thresholds: bigint[], amounts: bigint[], deadline: bigint) {
  const total = amounts.reduce((a, b) => a + b, 0n)
  const axfer = await algorand.createTransaction.assetTransfer({ sender: brand.addr, receiver: app.appAddress, assetId: TUSDC, amount: total })
  const boxPay = await algorand.createTransaction.payment({ sender: brand.addr, receiver: app.appAddress, amount: BOX_PAY })
  const r = await app.send.createDeal({ sender: brand.addr, args: { axfer, boxPay, dealId, deadline, metrics, thresholds, amounts }, populateAppCallResources: true, extraFee: INNER_FEE })
  rec(`createDeal #${dealId} (fund ${Number(total) / 1e6} tUSDC)`, r.transaction.txID())
}
const accept = (app: any, dealId: bigint) => app.send.acceptApplication({ sender: brand.addr, args: { dealId, creator: creator.addr.toString() }, populateAppCallResources: true })
const verdict = (app: any, dealId: bigint, index: bigint, observed: bigint, who = agent, pass = true, conf = 90n) =>
  app.send.submitMilestoneVerdict({ sender: who.addr, args: { dealId, index, pass, confidence: conf, observedValue: observed }, populateAppCallResources: true })
const release = (app: any, dealId: bigint, index: bigint, who = creator) =>
  app.send.releaseMilestone({ sender: who.addr, args: { dealId, index }, populateAppCallResources: true, extraFee: INNER_FEE })

async function main() {
  console.log('══ SETUP ══')
  await getTusdc()
  // brand + creator opted into tUSDC; brand has tUSDC + ALGO headroom; agent/creator have ALGO
  for (const a of [brand, creator]) if (!(await acctInfo(a.addr.toString())).optedIn) {
    const oi = await algorand.send.assetOptIn({ sender: a.addr, assetId: TUSDC }); rec(`opt-in tUSDC ${a.addr.toString().slice(0, 6)}…`, oi.txIds[0])
  }
  await ensureAlgo(brand.addr, 2.5); await ensureAlgo(creator.addr, 1.0); await ensureAlgo(agent.addr, 0.5)
  if ((await usdcBal(brand.addr.toString())) < 50) {
    const t = await algorand.send.assetTransfer({ sender: owner.addr, receiver: brand.addr, assetId: TUSDC, amount: 1_000_000_000n }); rec('fund brand 1000 tUSDC', t.txIds[0])
  }
  const app = await getApp()
  const base = BigInt(Date.now())
  const far = BigInt(Math.floor(Date.now() / 1000) + 3600)

  // ── S1 ──
  console.log('\n══ S1 — happy multi-milestone (5k→2, 10k→3 tUSDC) ══')
  const d1 = base + 1n
  await createDeal(app, d1, [1, 1], [5000n, 10000n], [2_000_000n, 3_000_000n], far)
  rec('acceptApplication → bind creator', (await accept(app, d1)).transaction.txID())
  const c0 = await usdcBal(creator.addr.toString())
  rec('agent verdict ms0 (5140 ≥ 5000)', (await verdict(app, d1, 0n, 5140n)).transaction.txID())
  await expectFail(() => release(app, d1, 0n), 'release before timelock')
  await sleep(WAIT)
  rec('release ms0 → creator +2', (await release(app, d1, 0n)).transaction.txID())
  assert((await usdcBal(creator.addr.toString())) === c0 + 2, 'creator received exactly 2 tUSDC (amount + recipient bound)')
  rec('agent verdict ms1 (10230 ≥ 10000)', (await verdict(app, d1, 1n, 10230n)).transaction.txID())
  await sleep(WAIT)
  rec('release ms1 → creator +3 (deal RELEASED)', (await release(app, d1, 1n)).transaction.txID())
  assert((await usdcBal(creator.addr.toString())) === c0 + 5, 'creator +5 tUSDC total across 2 tranches')

  // ── S2 ──
  console.log('\n══ S2 — GUARDRAIL: observed < threshold must NOT approve ══')
  const d2 = base + 2n
  await createDeal(app, d2, [1], [10000n], [2_000_000n], far); await accept(app, d2)
  rec('verdict observed=4000 (< 10000) — must NOT approve', (await verdict(app, d2, 0n, 4000n, agent, true, 99n)).transaction.txID())
  await expectFail(() => release(app, d2, 0n), 'release after below-threshold verdict (still PENDING)')
  rec('verdict observed=12000 (≥ 10000) — approves', (await verdict(app, d2, 0n, 12000n)).transaction.txID())
  const c2 = await usdcBal(creator.addr.toString()); await sleep(WAIT)
  rec('release ms0 after real threshold met', (await release(app, d2, 0n)).transaction.txID())
  assert((await usdcBal(creator.addr.toString())) === c2 + 2, 'creator +2 only after the on-chain threshold was met')

  // ── S3 ──
  console.log('\n══ S3 — GUARDRAIL: only the agent oracle may attest ══')
  const d3 = base + 3n
  await createDeal(app, d3, [1], [1000n], [1_000_000n], far); await accept(app, d3)
  await expectFail(() => verdict(app, d3, 0n, 5000n, brand), 'brand (not oracle) submitting a verdict')
  rec('agent verdict accepted', (await verdict(app, d3, 0n, 5000n)).transaction.txID())

  // ── S4 ──
  console.log('\n══ S4 — dispute → admin REFUND ══')
  const d4 = base + 4n
  await createDeal(app, d4, [1], [5000n], [2_000_000n], far); await accept(app, d4)
  await verdict(app, d4, 0n, 5200n)
  const b4 = await usdcBal(brand.addr.toString())
  rec('brand disputes within window', (await app.send.dispute({ sender: brand.addr, args: { dealId: d4, index: 0n }, populateAppCallResources: true })).transaction.txID())
  await expectFail(() => release(app, d4, 0n), 'release on a disputed deal')
  rec('admin resolveDispute(refund) → brand', (await app.send.resolveDispute({ sender: owner.addr, args: { dealId: d4, index: 0n, payCreator: false }, populateAppCallResources: true, extraFee: INNER_FEE })).transaction.txID())
  assert((await usdcBal(brand.addr.toString())) === b4 + 2, 'brand refunded exactly 2 tUSDC')

  // ── S5 ──
  console.log('\n══ S5 — dispute → admin UPHOLD (pay creator) ══')
  const d5 = base + 5n
  await createDeal(app, d5, [1], [5000n], [2_000_000n], far); await accept(app, d5)
  await verdict(app, d5, 0n, 5200n)
  await app.send.dispute({ sender: brand.addr, args: { dealId: d5, index: 0n }, populateAppCallResources: true })
  const c5 = await usdcBal(creator.addr.toString())
  rec('admin resolveDispute(uphold) → creator', (await app.send.resolveDispute({ sender: owner.addr, args: { dealId: d5, index: 0n, payCreator: true }, populateAppCallResources: true, extraFee: INNER_FEE })).transaction.txID())
  assert((await usdcBal(creator.addr.toString())) === c5 + 2, 'creator paid exactly 2 tUSDC on upheld dispute')

  // ── S6 ──
  console.log('\n══ S6 — no-show: refund unreleased after deadline ══')
  const d6 = base + 6n
  const soon = BigInt(Math.floor(Date.now() / 1000) + 25)
  await createDeal(app, d6, [1, 1], [5000n, 10000n], [2_000_000n, 3_000_000n], soon); await accept(app, d6)
  await expectFail(() => app.send.refund({ sender: brand.addr, args: { dealId: d6 }, populateAppCallResources: true, extraFee: INNER_FEE }), 'refund before deadline')
  const b6 = await usdcBal(brand.addr.toString()); await sleep(22)
  rec('refund after deadline → brand +5', (await app.send.refund({ sender: brand.addr, args: { dealId: d6 }, populateAppCallResources: true, extraFee: INNER_FEE })).transaction.txID())
  assert((await usdcBal(brand.addr.toString())) === b6 + 5, 'brand refunded all 5 tUSDC (no milestones met)')

  console.log(`\n══ ALL SCENARIOS PASSED ✅  (${txlog.length} on-chain txns) ══`)
  console.log('\nAll Lora links:')
  for (const t of txlog) console.log(`  ${t.label}\n    ${LORA}/transaction/${t.id}`)
}
main().catch((e) => { console.error('\n❌ E2E FAILED:\n', e?.message ?? e); process.exit(1) })
