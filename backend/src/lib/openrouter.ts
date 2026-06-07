/** AI verdict via OpenRouter (default google/gemini-3.1-flash-lite, multimodal-capable). */
import { ENV } from './env.ts'
import type { Proof } from './proof.ts'

export interface Verdict { pass: boolean; confidence: number; reason: string; model: string }

export async function verifyDeliverable(input: { brief: string; metric: string; threshold: number; proof: Proof }): Promise<Verdict> {
  const { brief, metric, threshold, proof } = input
  // 1) THE metric threshold is the authoritative gate (the contract re-checks this too).
  const met = proof.metricValue >= threshold
  if (!met) return { pass: false, confidence: 1, reason: `observed ${metric}=${proof.metricValue} is below the ${threshold} threshold`, model: 'rule' }
  // 2) threshold met → the LLM only confirms the proof looks like a GENUINE post (anti-fraud),
  //    and is lenient: a missing hashtag/mention is NOT a reason to fail.
  if (!ENV.OPENROUTER_API_KEY) return { pass: true, confidence: 0.9, reason: `threshold met (${metric}=${proof.metricValue} ≥ ${threshold})`, model: 'heuristic' }
  const sys = 'You audit influencer-marketing proofs for an on-chain escrow. The numeric metric threshold is ALREADY met and independently verified — do NOT re-judge the number. Your ONLY job: decide whether the proof looks like a genuine post by this creator (not fabricated/unrelated spam). BE LENIENT: a missing hashtag, mention or slightly off caption is NOT a reason to fail. Reply with ONLY compact JSON {"pass":boolean,"confidence":number,"reason":string}, confidence 0..1. pass=false ONLY if the proof looks fake or completely unrelated to a social post.'
  const user = `Brief: ${brief}\nObserved: ${metric}=${proof.metricValue} (meets the ${threshold} threshold ✓) for a post by ${proof.authorHandle} on ${proof.platform}.\nProof source: ${proof.source} (real=${proof.real}); content="${proof.content}".`
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ENV.OPENROUTER_MODEL, temperature: 0, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    })
    const j: any = await r.json()
    const txt: string = j?.choices?.[0]?.message?.content ?? ''
    const m = txt.match(/\{[\s\S]*\}/)
    // metric is met; if the LLM is unreachable/unparseable we still pass (it's only the anti-fraud layer).
    if (!m) return { pass: true, confidence: 0.75, reason: 'threshold met; LLM unparseable, passed on metric', model: ENV.OPENROUTER_MODEL }
    const p = JSON.parse(m[0])
    return { pass: !!p.pass, confidence: Number(p.confidence) || 0.8, reason: String(p.reason ?? `threshold met (${metric}=${proof.metricValue})`), model: ENV.OPENROUTER_MODEL }
  } catch (e: any) {
    return { pass: true, confidence: 0.7, reason: `threshold met; LLM error (${e?.message ?? e}), passed on metric`, model: ENV.OPENROUTER_MODEL }
  }
}
