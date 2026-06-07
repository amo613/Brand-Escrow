/** Client-signed on-chain escrow calls (brand signs createDeal + accept with their Web3Auth key). */
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { EscrowAppFactory } from './EscrowClient.ts'
import { naclSigner, type Wallet } from './web3auth.ts'

const APP_ID = BigInt(import.meta.env.VITE_ESCROW_APP_ID ?? '0')
const USDC = BigInt(import.meta.env.VITE_USDC_ASA ?? '10458941')
const algorand = AlgorandClient.testNet()

function registerSigner(w: Wallet) {
  algorand.account.setSigner(w.address, naclSigner(w.sk))
}
async function appFor(w: Wallet) {
  registerSigner(w)
  const f = algorand.client.getTypedAppFactory(EscrowAppFactory, { defaultSender: w.address })
  return f.getAppClientById({ appId: APP_ID })
}
const lastTx = (r: any) => r?.txIds?.[r.txIds.length - 1]

export interface MilestoneInput { metric: number; threshold: number; amountUsdc: number }

/** brand: create + fund a deal (3-leg atomic group, signed client-side) */
export async function createAndFundDeal(w: Wallet, milestones: MilestoneInput[], deadlineUnix: number) {
  const app = await appFor(w)
  const dealId = BigInt(Date.now())
  const amounts = milestones.map((m) => BigInt(Math.round(m.amountUsdc * 1e6)))
  const total = amounts.reduce((a, b) => a + b, 0n)
  const axfer = await algorand.createTransaction.assetTransfer({ sender: w.address, receiver: app.appAddress, assetId: USDC, amount: total })
  const boxPay = await algorand.createTransaction.payment({ sender: w.address, receiver: app.appAddress, amount: AlgoAmount.MicroAlgo(150000) })
  const r = await app.send.createDeal({
    sender: w.address,
    args: { axfer, boxPay, dealId, deadline: BigInt(deadlineUnix), metrics: milestones.map((m) => m.metric), thresholds: milestones.map((m) => BigInt(m.threshold)), amounts },
    populateAppCallResources: true, extraFee: AlgoAmount.MicroAlgo(3000),
  })
  return { dealId: dealId.toString(), txId: lastTx(r) as string }
}

/** brand: bind the chosen creator on-chain */
export async function acceptOnChain(w: Wallet, dealId: string, creator: string) {
  const app = await appFor(w)
  const r = await app.send.acceptApplication({ sender: w.address, args: { dealId: BigInt(dealId), creator }, populateAppCallResources: true })
  return lastTx(r) as string
}
