/** The AI agent's x402 client: pays per request in tUSDC, gasless via the facilitator's feePayer. */
import algosdk from 'algosdk'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { ExactAvmScheme } from '@x402/avm/exact/client'
import { toClientAvmSigner, ALGORAND_TESTNET_CAIP2 } from '@x402/avm'

export function makeAgentFetch(mnemonic: string): typeof fetch {
  const account = algosdk.mnemonicToSecretKey(mnemonic)
  const signer = toClientAvmSigner(Buffer.from(account.sk).toString('base64'))
  const client = new x402Client().register(ALGORAND_TESTNET_CAIP2, new ExactAvmScheme(signer))
  return wrapFetchWithPayment(fetch, client)
}

/** Pull the on-chain settle txId out of the x402 response headers (for Lora links / receipts). */
export function settleTxFromResponse(res: Response): string | undefined {
  const h = res.headers.get('X-PAYMENT-RESPONSE') ?? res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('payment-response')
  if (!h) return undefined
  try {
    const decoded = JSON.parse(Buffer.from(h, 'base64').toString('utf-8'))
    return decoded.txid ?? decoded.transaction ?? decoded.txId ?? decoded?.settlement?.txid
  } catch {
    return undefined
  }
}
