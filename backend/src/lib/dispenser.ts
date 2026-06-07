/** New-user airdrop: fund a wallet with test ALGO + tUSDC (drives the login animation for real). */
import algosdk from 'algosdk'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { algorand, acct } from './escrow.ts'
import { ENV, loraTx } from './env.ts'

const algod = new algosdk.Algodv2('', ENV.ALGOD_SERVER, 443)
const AIRDROP_ALGO = Number(process.env.AIRDROP_ALGO_MICRO ?? '5000000') / 1e6
const AIRDROP_USDC = BigInt(process.env.AIRDROP_USDC_MICRO ?? '50000000')
// owner holds the tUSDC supply + ALGO → it's the funder for the demo dispenser
const funder = acct(ENV.ADMIN_MNEMONIC)

export async function airdrop(address: string) {
  const info: any = await algod.accountInformation(address).do()
  const usdc = (info.assets ?? []).find((a: any) => BigInt(a.assetId ?? a['asset-id']) === ENV.USDC_ASA)
  const optedIn = !!usdc
  const txs: { kind: string; link: string }[] = []

  if (Number(info.amount) / 1e6 < AIRDROP_ALGO) {
    const r = await algorand.send.payment({ sender: funder.addr, receiver: address, amount: AlgoAmount.Algos(AIRDROP_ALGO) })
    txs.push({ kind: 'algo', link: loraTx(r.txIds[0]) })
  }
  if (optedIn && Number(usdc.amount) < Number(AIRDROP_USDC)) {
    const r = await algorand.send.assetTransfer({ sender: funder.addr, receiver: address, assetId: ENV.USDC_ASA, amount: AIRDROP_USDC })
    txs.push({ kind: 'usdc', link: loraTx(r.txIds[0]) })
  }
  // The USDC opt-in itself must be signed by the user (client-side, with their Web3Auth key).
  return { funded: true, optedIn, needsOptIn: !optedIn, asaId: String(ENV.USDC_ASA), txs }
}
