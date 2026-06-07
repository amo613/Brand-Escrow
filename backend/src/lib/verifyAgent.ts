/** The AI Verify-Agent: pays x402 for the proof, then runs the LLM verdict. */
import { makeAgentFetch, settleTxFromResponse } from './x402client.ts'
import { verifyDeliverable, type Verdict } from './openrouter.ts'
import { ENV } from './env.ts'
import type { Proof } from './proof.ts'

const agentFetch = makeAgentFetch(ENV.AGENT_MNEMONIC)

export async function agentCheck(input: { oracleUrl: string; platform: string; postUrl: string; metric: string; threshold: number; brief: string }): Promise<{ proof: Proof; x402Tx?: string; verdict: Verdict }> {
  const { oracleUrl, platform, postUrl, metric, threshold, brief } = input
  const res = await agentFetch(`${oracleUrl}/api/proof?platform=${platform}&postUrl=${encodeURIComponent(postUrl)}&metric=${metric}`)
  if (res.status !== 200) throw new Error(`proof oracle returned ${res.status}`)
  const proof = (await res.json()) as Proof
  const x402Tx = settleTxFromResponse(res)
  const verdict = await verifyDeliverable({ brief, metric, threshold, proof })
  return { proof, x402Tx, verdict }
}
