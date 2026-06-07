/**
 * Idempotent TestNet prep for the e2e actors. Run from contracts/:  npx tsx scripts/setup-actors.ts
 *   - OWNER opts into USDC
 *   - agent / dispenser / brand / creator each: topped up with ALGO (from OWNER) + opted into USDC
 *   - if OWNER holds USDC, top the BRAND up to 10 USDC so it can fund escrow
 * Prints balances + the USDC faucet ask if OWNER has no USDC yet.
 */
import dotenv from 'dotenv'
import algosdk from 'algosdk'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'

dotenv.config({ path: '../.env' })
const USDC = BigInt(process.env.USDC_ASA_ID ?? '10458941')
const LORA = 'https://lora.algokit.io/testnet'
const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', 443)

const algorand = AlgorandClient.testNet()
const owner = algorand.account.fromMnemonic(process.env.ADMIN_MNEMONIC!)
const actors = {
  agent: algorand.account.fromMnemonic(process.env.AGENT_MNEMONIC!),
  dispenser: algorand.account.fromMnemonic(process.env.DISPENSER_MNEMONIC!),
  brand: algorand.account.fromMnemonic(process.env.BRAND_TEST_MNEMONIC!),
  creator: algorand.account.fromMnemonic(process.env.CREATOR_TEST_MNEMONIC!),
}

async function info(addr: string) {
  const i: any = await algod.accountInformation(addr).do()
  const usdc = (i.assets ?? []).find((a: any) => BigInt(a.assetId ?? a['asset-id']) === USDC)
  return { algo: Number(i.amount) / 1e6, usdc: usdc ? Number(usdc.amount) / 1e6 : 0, optedIn: !!usdc }
}
async function ensureOptedIn(acct: { addr: any }) {
  const { optedIn } = await info(acct.addr.toString())
  if (!optedIn) {
    await algorand.send.assetOptIn({ sender: acct.addr, assetId: USDC })
    console.log(`   opted ${acct.addr.toString().slice(0, 8)}… into USDC`)
  }
}
async function ensureAlgo(addr: any, minAlgo: number) {
  const { algo } = await info(addr.toString())
  if (algo < minAlgo) {
    await algorand.send.payment({ sender: owner.addr, receiver: addr, amount: AlgoAmount.Algos(minAlgo - algo + 0.05) })
    console.log(`   funded ${addr.toString().slice(0, 8)}… → ~${minAlgo} ALGO`)
  }
}

async function main() {
  console.log('OWNER:', owner.addr.toString())
  await ensureOptedIn(owner)
  for (const [name, acct] of Object.entries(actors)) {
    await ensureAlgo(acct.addr, 1.0)
    await ensureOptedIn(acct)
    void name
  }

  const o = await info(owner.addr.toString())
  if (o.usdc >= 10) {
    const b = await info(actors.brand.addr.toString())
    if (b.usdc < 10) {
      const need = BigInt(Math.round((10 - b.usdc) * 1e6))
      await algorand.send.assetTransfer({ sender: owner.addr, receiver: actors.brand.addr, assetId: USDC, amount: need })
      console.log(`   sent ${Number(need) / 1e6} USDC → BRAND`)
    }
  }

  console.log('\n── balances ──')
  for (const [n, a] of [['OWNER', owner.addr.toString()], ['agent', actors.agent.addr.toString()], ['dispenser', actors.dispenser.addr.toString()], ['brand', actors.brand.addr.toString()], ['creator', actors.creator.addr.toString()]] as const) {
    const x = await info(a)
    console.log(`  ${n.padEnd(10)} ${x.algo.toFixed(2)} ALGO · ${x.usdc.toFixed(2)} USDC · optedIn=${x.optedIn}`)
  }
  if (o.usdc < 10) {
    console.log(`\n⚠️  OWNER has ${o.usdc} test USDC. Get some, then re-run this script to fund the brand:`)
    console.log(`    Circle faucet → ${owner.addr.toString()}  (https://faucet.circle.com, pick "Algorand Testnet")`)
    console.log(`    OWNER is now opted into USDC ASA ${USDC}, so the faucet delivery will land.`)
  } else {
    console.log(`\n✅ actors ready — brand holds test USDC, all opted in. Run the e2e: npx tsx scripts/e2e.ts`)
  }
  console.log(`\n  OWNER: ${LORA}/account/${owner.addr.toString()}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
