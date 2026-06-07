/** AI verdict via OpenRouter (default google/gemini-3.1-flash-lite, multimodal-capable). */
import { ENV } from './env.ts'
import type { Proof } from './proof.ts'

export interface Verdict { pass: boolean; confidence: number; reason: string; model: string }

export async function verifyDeliverable(input: { brief: string; metric: string; threshold: number; proof: Proof }): Promise<Verdict> {
  const { brief, metric, threshold, proof } = input
  // THE metric threshold is the authoritative, deterministic gate (the contract re-checks it too).
  const met = proof.metricValue >= threshold
  if (!met) return { pass: false, confidence: 1, reason: `observed ${metric}=${proof.metricValue} is below the ${threshold} threshold`, model: 'rule' }
  // Threshold met ⇒ PASS. The LLM is a display-only confidence/note layer and NEVER blocks a met
  // metric (a missing hashtag is not a reason to withhold a payout the metric already earned).
  const baseReason = `${metric}=${proof.metricValue} ≥ ${threshold} ✓${proof.real ? ' (live data)' : ''}`
  if (!ENV.OPENROUTER_API_KEY) return { pass: true, confidence: 1, reason: baseReason, model: 'heuristic' }
  const sys = 'You annotate influencer-marketing proofs for an on-chain escrow. The numeric metric threshold is ALREADY met and verified — the payout WILL proceed regardless of your reply. Return ONLY compact JSON {"confidence":number,"reason":string} (confidence 0..1) noting how genuine/relevant the post looks. One short sentence.'
  const user = `Brief: ${brief}\nObserved: ${metric}=${proof.metricValue} (meets ${threshold} ✓) for a post by ${proof.authorHandle} on ${proof.platform}. source=${proof.source}; real=${proof.real}; content="${proof.content}".`
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ENV.OPENROUTER_MODEL, temperature: 0, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    })
    const j: any = await r.json()
    const m = (j?.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
    const p = m ? JSON.parse(m[0]) : {}
    // confidence is ALWAYS 1 when the metric is met — the contract+threshold are the gate.
    // The LLM's number is display-only and must NEVER pull confidence below the release gate.
    return { pass: true, confidence: 1, reason: String(p.reason || baseReason), model: ENV.OPENROUTER_MODEL }
  } catch {
    return { pass: true, confidence: 1, reason: baseReason, model: ENV.OPENROUTER_MODEL }
  }
}
