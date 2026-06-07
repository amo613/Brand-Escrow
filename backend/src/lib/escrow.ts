/** escrowService — typed wrappers around the on-chain EscrowApp (reused by routes + the agent). */
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { EscrowAppFactory } from '../generated/EscrowClient.ts'
import { ENV } from './env.ts'

export const algorand = AlgorandClient.testNet()
export const acct = (mn: string) => algorand.account.fromMnemonic(mn)

const INNER_FEE = AlgoAmount.MicroAlgo(3000)
const BOX_PAY = AlgoAmount.MicroAlgo(150000)

export async function getEscrow(senderAddr: string) {
  const f = algorand.client.getTypedAppFactory(EscrowAppFactory, { defaultSender: senderAddr })
  return f.getAppClientById({ appId: ENV.ESCROW_APP_ID })
}

/** brand funds a deal: 3-leg atomic group (USDC axfer + ALGO box-rent + appcall) */
export async function createDeal(app: any, brandAddr: string, dealId: bigint, metrics: number[], thresholds: bigint[], amounts: bigint[], deadline: bigint) {
  const total = amounts.reduce((a, b) => a + b, 0n)
  const axfer = await algorand.createTransaction.assetTransfer({ sender: brandAddr, receiver: app.appAddress, assetId: ENV.USDC_ASA, amount: total })
  const boxPay = await algorand.createTransaction.payment({ sender: brandAddr, receiver: app.appAddress, amount: BOX_PAY })
  return app.send.createDeal({ sender: brandAddr, args: { axfer, boxPay, dealId, deadline, metrics, thresholds, amounts }, populateAppCallResources: true, extraFee: INNER_FEE })
}
export const acceptDeal = (app: any, brandAddr: string, dealId: bigint, creatorAddr: string) =>
  app.send.acceptApplication({ sender: brandAddr, args: { dealId, creator: creatorAddr }, populateAppCallResources: true })
export const submitVerdict = (app: any, agentAddr: string, dealId: bigint, index: bigint, pass: boolean, confidence: bigint, observedValue: bigint) =>
  app.send.submitMilestoneVerdict({ sender: agentAddr, args: { dealId, index, pass, confidence, observedValue }, populateAppCallResources: true })
export const releaseMilestone = (app: any, who: string, dealId: bigint, index: bigint) =>
  app.send.releaseMilestone({ sender: who, args: { dealId, index }, populateAppCallResources: true, extraFee: INNER_FEE })
export const refundDeal = (app: any, brandAddr: string, dealId: bigint) =>
  app.send.refund({ sender: brandAddr, args: { dealId }, populateAppCallResources: true, extraFee: INNER_FEE })
