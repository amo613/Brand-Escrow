/**
 * Deploy EscrowApp to Algorand TestNet:
 *   1. create the app (createApplication: admin=OWNER, agentOracle, usdcAsa, challengeWindow, minConfidence)
 *   2. fund the app account (min-balance for the USDC opt-in + future deal boxes)
 *   3. bootstrap() — inner txn opts the app into the USDC ASA
 * Writes ESCROW_APP_ID / ESCROW_APP_ADDRESS back into ../.env and prints a Lora link.
 *
 * Run from contracts/:  npx tsx scripts/deploy.ts
 */
import dotenv from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { EscrowAppFactory } from '../smart_contracts/escrow/EscrowClient'

dotenv.config({ path: '../.env' })

const USDC_ASA = BigInt(process.env.USDC_ASA_ID ?? '10458941')
const CHALLENGE_WINDOW = BigInt(process.env.CHALLENGE_WINDOW_SECS ?? '30')
const MIN_CONFIDENCE = BigInt(process.env.MIN_CONFIDENCE ?? '80')
const LORA = 'https://lora.algokit.io/testnet'

async function main() {
  const algorand = AlgorandClient.testNet()
  const admin = algorand.account.fromMnemonic(process.env.ADMIN_MNEMONIC!)
  const agentOracle = process.env.AGENT_ORACLE_ADDR!
  console.log(`Deployer (admin/owner): ${admin.addr}`)
  console.log(`Agent oracle:           ${agentOracle}`)

  const factory = algorand.client.getTypedAppFactory(EscrowAppFactory, { defaultSender: admin.addr })

  console.log('\n1) creating app …')
  const { appClient, result } = await factory.send.create.createApplication({
    args: { agentOracle, usdcAsa: USDC_ASA, challengeWindow: CHALLENGE_WINDOW, minConfidence: MIN_CONFIDENCE },
  })
  const appId = appClient.appId
  const appAddr = appClient.appAddress.toString()
  console.log(`   appId=${appId}  appAddress=${appAddr}`)
  console.log(`   create tx: ${LORA}/transaction/${result.txIds[0]}`)

  console.log('\n2) funding app account (0.5 ALGO for opt-in + box MBR headroom) …')
  await algorand.send.payment({ sender: admin.addr, receiver: appClient.appAddress, amount: AlgoAmount.Algos(0.5) })

  console.log('\n3) bootstrap — opt app into USDC ASA …')
  const boot = await appClient.send.bootstrap({ args: {}, staticFee: AlgoAmount.MicroAlgo(3000) })
  console.log(`   bootstrap tx: ${LORA}/transaction/${boot.transaction.txID()}`)

  // persist into ../.env
  const envPath = '../.env'
  let env = readFileSync(envPath, 'utf8')
  const set = (k: string, v: string) => {
    const re = new RegExp(`^${k}=.*$`, 'm')
    env = re.test(env) ? env.replace(re, `${k}=${v}`) : env + `\n${k}=${v}`
  }
  set('ESCROW_APP_ID', String(appId))
  set('ESCROW_APP_ADDRESS', appAddr)
  set('NEXT_PUBLIC_ESCROW_APP_ID', String(appId))
  writeFileSync(envPath, env)

  console.log(`\n✅ DEPLOYED`)
  console.log(`   ESCROW_APP_ID=${appId}`)
  console.log(`   App account: ${LORA}/account/${appAddr}`)
  console.log(`   App:         ${LORA}/application/${appId}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
