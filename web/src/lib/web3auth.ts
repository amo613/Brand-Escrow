/** Web3Auth (social → non-custodial Algorand key) + dev-login + challenge signing + USDC opt-in. */
import { Web3Auth } from '@web3auth/modal'
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK, CommonPrivateKeyProvider, type IProvider } from '@web3auth/no-modal'
import nacl from 'tweetnacl'
import algosdk from 'algosdk'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'

const CLIENT_ID = import.meta.env.VITE_WEB3AUTH_CLIENT_ID as string
const USDC_ASA = BigInt(import.meta.env.VITE_USDC_ASA ?? '10458941')
const algorand = AlgorandClient.testNet()

export interface Wallet { address: string; sk: Uint8Array } // sk = 64-byte nacl secret key

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.OTHER,
  chainId: 'algorand:testnet',
  displayName: 'Algorand Testnet',
  ticker: 'ALGO', tickerName: 'Algorand',
  rpcTarget: 'https://testnet-api.algonode.cloud',
  blockExplorerUrl: 'https://lora.algokit.io/testnet',
  logo: '',
}

let web3auth: Web3Auth | null = null
let crashSuppressed = false

function buildWeb3Auth(includeStoredSession = true): Web3Auth {
  const privateKeyProvider = new CommonPrivateKeyProvider({ config: { chain: chainConfig, chains: [chainConfig] } })
  let storedState: Record<string, unknown> = {}
  if (includeStoredSession) {
    try { const raw = localStorage.getItem('Web3Auth-state'); if (raw) storedState = JSON.parse(raw) as Record<string, unknown> } catch { /* ignore */ }
  }
  return new Web3Auth(
    { clientId: CLIENT_ID, web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, privateKeyProvider, chains: [chainConfig] } as any,
    // Force Algorand as the ACTIVE chain so the live provider is the CommonPrivateKeyProvider
    // (which supports `private_key`). Without this, if the Web3Auth project config adds EVM
    // chains, chains[0] becomes EIP155 → an EVM provider → provider.request({method:'private_key'})
    // throws "Method not supported". External wallets stay fully available in the modal.
    { cachedConnector: null, connectedConnectorName: null, idToken: null, ...storedState, currentChainId: 'algorand:testnet' } as any,
  )
}

export async function initWeb3Auth() {
  if (web3auth) return web3auth
  if (!crashSuppressed) {
    // non-EVM session restore can reject async with "loginWithSessionId" after init() resolves
    window.addEventListener('unhandledrejection', (e) => {
      if (String((e.reason as Error)?.message ?? '').includes('loginWithSessionId')) e.preventDefault()
    })
    crashSuppressed = true
  }
  web3auth = buildWeb3Auth(true)
  await web3auth.init().catch(() => {})
  return web3auth
}

function skFromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '')
  const bytes = Uint8Array.from(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
  if (bytes.length === 64) return bytes
  const seed = bytes.slice(0, 32)
  return nacl.sign.keyPair.fromSeed(seed).secretKey
}

export async function connectSocial(): Promise<Wallet> {
  const w3a = await initWeb3Auth()
  const provider = (await w3a.connect()) as IProvider
  if (!provider) throw new Error('Web3Auth: no provider')
  const hex = (await provider.request({ method: 'private_key' })) as string
  const sk = skFromHex(hex)
  return { address: algosdk.encodeAddress(sk.slice(32)), sk }
}
export async function logoutSocial() { try { await web3auth?.logout() } catch { /* noop */ } web3auth = null }

export function devLogin(mnemonic: string): Wallet {
  const a = algosdk.mnemonicToSecretKey(mnemonic.trim())
  return { address: String(a.addr), sk: a.sk }
}

export function signChallenge(w: Wallet, message: string): string {
  return toB64(algosdk.signBytes(new TextEncoder().encode(message), w.sk))
}

export async function getBalances(address: string) {
  try {
    const info: any = await algorand.account.getInformation(address)
    const usdc = info.assets?.find((a: any) => BigInt(a.assetId) === USDC_ASA)
    return { algo: Number(info.balance.microAlgos) / 1e6, usdc: usdc ? Number(usdc.amount) / 1e6 : 0, optedIn: !!usdc }
  } catch {
    return { algo: 0, usdc: 0, optedIn: false }
  }
}

/** an algosdk TransactionSigner backed by the raw 64-byte ed25519 key (Web3Auth-derived). */
export const naclSigner = (sk: Uint8Array): algosdk.TransactionSigner => (txns, idx) => Promise.resolve(idx.map((i) => txns[i].signTxn(sk)))

export async function optInUSDC(w: Wallet) {
  algorand.account.setSigner(w.address, naclSigner(w.sk))
  await algorand.send.assetOptIn({ sender: w.address, assetId: USDC_ASA })
}
