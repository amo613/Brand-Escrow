import dotenv from 'dotenv'
import { resolve } from 'node:path'

// backend scripts run with cwd=backend/, so ../.env is the repo-root secrets file
dotenv.config({ path: resolve(process.cwd(), '../.env') })

const req = (k: string): string => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}

export const ENV = {
  ALGOD_SERVER: process.env.ALGOD_SERVER ?? 'https://testnet-api.algonode.cloud',
  FACILITATOR: process.env.FACILITATOR_BASE ?? 'https://facilitator.goplausible.xyz',
  // tUSDC = the self-minted unlimited test stablecoin used for the autonomous demo/tests
  USDC_ASA: BigInt(process.env.E2E_TUSDC_ASA ?? process.env.USDC_ASA_ID ?? '10458941'),
  ESCROW_APP_ID: BigInt(process.env.E2E_APP_ID ?? process.env.ESCROW_APP_ID ?? '0'),
  OWNER_ADDR: req('OWNER_ADDR'),
  TREASURY_ADDR: process.env.PLATFORM_TREASURY_ADDR ?? req('OWNER_ADDR'),
  AGENT_ORACLE_ADDR: req('AGENT_ORACLE_ADDR'),
  ADMIN_MNEMONIC: req('ADMIN_MNEMONIC'),
  AGENT_MNEMONIC: req('AGENT_MNEMONIC'),
  X402_PROOF_PRICE_MICRO: process.env.X402_PROOF_PRICE_MICRO ?? '10000', // 0.01 (6dp)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? 'google/gemini-3.1-flash-lite',
  MIN_CONFIDENCE: Number(process.env.MIN_CONFIDENCE ?? '80'),
  ORACLE_PORT: Number(process.env.ORACLE_PORT ?? '4021'),
}
export const LORA = 'https://lora.algokit.io/testnet'
export const loraTx = (id: string) => `${LORA}/transaction/${id}`
