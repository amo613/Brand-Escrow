/** AI verdict via OpenRouter (default google/gemini-3.1-flash-lite, multimodal-capable). */
import { ENV } from './env.ts'
import type { Proof } from './proof.ts'

export interface Verdict { pass: boolean; confidence: number; reason: string; model: string }

export async function verifyDeliverable(input: { brief: string; metric: string; threshold: number; proof: Proof }): Promise<Verdict> {
  const { brief, metric, threshold, proof } = input
  if (!ENV.OPENROUTER_API_KEY) {
    return { pass: proof.metricValue >= threshold, confidence: 0.9, reason: 'heuristic (no OPENROUTER_API_KEY)', model: 'heuristic' }
  }
  const sys = 'You verify influencer-marketing deliverables for an on-chain escrow. Reply with ONLY compact JSON: {"pass":boolean,"confidence":number,"reason":string}. confidence is 0..1. pass=true only if the post satisfies the brief (required hashtag/mention/media present) AND the observed metric meets the threshold.'
  const user = `Brief: ${brief}\nRequired: ${metric} >= ${threshold}\nObserved post by ${proof.authorHandle} on ${proof.platform}: ${proof.metric}=${proof.metricValue}; content="${proof.content}"; hashtags=${JSON.stringify(proof.hashtags)}; mentions=${JSON.stringify(proof.mentions)}; media=${proof.mediaType}.`
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
    if (!m) return { pass: false, confidence: 0, reason: 'LLM parse failed: ' + (txt || JSON.stringify(j)).slice(0, 160), model: ENV.OPENROUTER_MODEL }
    const p = JSON.parse(m[0])
    return { pass: !!p.pass, confidence: Number(p.confidence) || 0, reason: String(p.reason ?? ''), model: ENV.OPENROUTER_MODEL }
  } catch (e: any) {
    return { pass: false, confidence: 0, reason: 'LLM error: ' + (e?.message ?? String(e)), model: ENV.OPENROUTER_MODEL }
  }
}
