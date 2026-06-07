/**
 * x402 Proof Oracle — the pay-per-call API the AI agent buys verification data from.
 * Gated by @x402/hono: returns the post's metrics/profile only after a settled tUSDC payment.
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { paymentMiddleware, x402ResourceServer, type Network } from '@x402/hono'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { ExactAvmScheme } from '@x402/avm/exact/server'
import { ALGORAND_TESTNET_CAIP2 } from '@x402/avm'
import { ENV } from './lib/env.ts'
import { fetchProof } from './lib/proof.ts'

const facilitator = new HTTPFacilitatorClient({ url: ENV.FACILITATOR })
const resourceServer = new x402ResourceServer(facilitator).register(ALGORAND_TESTNET_CAIP2, new ExactAvmScheme())

// Pay in tUSDC (our self-minted test stablecoin) to the platform treasury.
const routes = {
  'GET /api/proof': {
    accepts: {
      scheme: 'exact' as const,
      network: ALGORAND_TESTNET_CAIP2 as Network,
      payTo: ENV.TREASURY_ADDR,
      price: { amount: ENV.X402_PROOF_PRICE_MICRO, asset: String(ENV.USDC_ASA) },
    },
    description: 'Social-proof oracle — verified post metrics + profile, pay-per-call via x402',
  },
}

export function buildOracle() {
  const app = new Hono()
  app.use(cors({ exposeHeaders: ['PAYMENT-REQUIRED', 'payment-required', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE'] }))
  app.use(paymentMiddleware(routes, resourceServer))
  // Only reached AFTER the facilitator confirms the on-chain payment.
  app.get('/api/proof', async (c) => {
    const platform = c.req.query('platform') ?? 'x'
    const postUrl = c.req.query('postUrl') ?? ''
    const metric = c.req.query('metric') ?? 'likes'
    const proof = await fetchProof(platform, postUrl, metric)
    return c.json(proof)
  })
  return app
}

export function startOracle(port = ENV.ORACLE_PORT) {
  const app = buildOracle()
  const server = serve({ fetch: app.fetch, port })
  console.log(`[oracle] x402 proof oracle on :${port} (pay ${Number(ENV.X402_PROOF_PRICE_MICRO) / 1e6} tUSDC #${ENV.USDC_ASA} → ${ENV.TREASURY_ADDR.slice(0, 8)}…)`)
  return server
}

// run standalone with: npm run oracle
if (import.meta.url === `file://${process.argv[1]}`) startOracle()
