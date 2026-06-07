/** Wallet-signature auth (ed25519) → JWT in an httpOnly cookie. Works for Web3Auth-derived
 *  keys and external wallets alike (Algorand addresses are ed25519 pubkeys). */
import { SignJWT, jwtVerify } from 'jose'
import algosdk from 'algosdk'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me')
const challenges = new Map<string, { msg: string; exp: number }>()

export function makeChallenge(address: string): string {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const msg = `LockPay login\nAddress: ${address}\nNonce: ${nonce}\nIssued: ${Date.now()}`
  challenges.set(address, { msg, exp: Date.now() + 300_000 })
  return msg
}

export function verifyChallenge(address: string, signatureB64: string): boolean {
  const c = challenges.get(address)
  if (!c || Date.now() > c.exp) return false
  challenges.delete(address) // single-use
  try {
    const sig = new Uint8Array(Buffer.from(signatureB64, 'base64'))
    return algosdk.verifyBytes(new TextEncoder().encode(c.msg), sig, address)
  } catch {
    return false
  }
}

export const signJwt = (address: string) =>
  new SignJWT({ wallet: address }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret)

export async function verifyJwt(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return (payload.wallet as string) ?? null
  } catch {
    return null
  }
}
