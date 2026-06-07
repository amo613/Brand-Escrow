/** Autonomous workers — the brand never clicks anything:
 *   trackingWorker   : cheap metric peek (no x402); when a milestone's threshold is hit it
 *                      escalates to the paid AI agent (x402 proof + Gemini verdict + on-chain attest).
 *   settlementWorker : auto-releases REACHED_PENDING milestones once the challenge window passes.
 *  Single-flight, per-milestone cooldown (no x402 spam), processes milestones strictly in order.
 *  The manual Run-agent / Release buttons stay for live demos. Toggle with WORKERS_ENABLED=false. */
import * as repo from './lib/repo.ts'
import { fetchProof } from './lib/proof.ts'
import { agentCheck } from './lib/verifyAgent.ts'
import { getEscrow, submitVerdict, releaseMilestone } from './lib/escrow.ts'
import { ENV } from './lib/env.ts'

const WINDOW = Number(process.env.CHALLENGE_WINDOW_SECS ?? '15')
const COOLDOWN_MS = Number(process.env.AGENT_COOLDOWN_MS ?? '90000') // don't re-run the paid agent on the same milestone too often
const lastTx = (r: any) => r?.txIds?.[r.txIds.length - 1] as string | undefined
const lastTry = new Map<string, number>()
let busy = false

async function settle(d: any, ms: any) {
  const app = await getEscrow(ENV.OWNER_ADDR)
  const r = await releaseMilestone(app, ENV.OWNER_ADDR, BigInt(d.id), BigInt(ms.index))
  await repo.pushLog(d.id, `settlement worker: released ${ms.amountUsdc} USDC → creator`, 'release')
  await repo.recordRelease(d.id, ms.index, lastTx(r)!)
  console.log(`[worker] auto-released deal ${d.id} ms ${ms.index}`)
}

async function track(d: any, ms: any, oracleUrl: string) {
  const key = `${d.id}:${ms.index}`
  if (Date.now() - (lastTry.get(key) ?? 0) < COOLDOWN_MS) return
  // cheap peek (no x402); only escalate to the paid agent when the threshold is actually reached
  const peek = await fetchProof(d.platform, d.postUrl, ms.metric)
  if (peek.metricValue < ms.threshold) return
  lastTry.set(key, Date.now())
  await repo.pushLog(d.id, `tracking worker: ${ms.metric}=${peek.metricValue} ≥ ${ms.threshold} — escalating to agent`, 'info')
  const { proof, x402Tx, verdict } = await agentCheck({ oracleUrl, platform: d.platform, postUrl: d.postUrl, metric: ms.metric, threshold: ms.threshold, brief: d.brief })
  if (x402Tx) await repo.pushLog(d.id, `paid 0.01 USDC via x402 for proof  [tx ${x402Tx.slice(0, 6)}… →]`, 'chain')
  await repo.pushLog(d.id, `proof: ${proof.authorHandle} ${proof.metric}=${proof.metricValue}${proof.real ? ' (live)' : ''} ✓`)
  await repo.pushLog(d.id, `LLM verdict: ${verdict.pass ? 'PASS' : 'FAIL'} · confidence ${verdict.confidence}`, 'verdict')
  let verdictTx: string | undefined
  if (verdict.pass && verdict.confidence * 100 >= ENV.MIN_CONFIDENCE) {
    const app = await getEscrow(ENV.OWNER_ADDR)
    const vr = await submitVerdict(app, ENV.AGENT_ORACLE_ADDR, BigInt(d.id), BigInt(ms.index), true, BigInt(Math.round(verdict.confidence * 100)), BigInt(proof.metricValue))
    verdictTx = lastTx(vr)
    await repo.pushLog(d.id, 'submit_milestone_verdict → on-chain ✓ (auto)')
    await repo.pushLog(d.id, `timelock started — auto-releases in ${WINDOW}s`)
  } else { await repo.pushLog(d.id, 'verdict not approved — will retry after cooldown', 'danger') }
  await repo.recordVerdict(d.id, ms.index, { pass: verdict.pass, confidence: verdict.confidence, reason: verdict.reason, model: ENV.OPENROUTER_MODEL, observed: proof, observedValue: proof.metricValue, x402Tx, verdictTx })
  console.log(`[worker] agent ran deal ${d.id} ms ${ms.index} → ${verdict.pass ? 'PASS' : 'FAIL'}`)
}

export async function tick(oracleUrl: string) {
  if (busy) return
  busy = true
  try {
    const deals = await repo.listDeals()
    for (const d of deals) {
      if (!d.creator || !d.postUrl) continue
      const sorted = [...d.milestones].sort((a: any, b: any) => a.index - b.index)
      for (const ms of sorted) {
        if (ms.status === 'REACHED_PENDING' && ms.approvedAt && Math.floor(Date.now() / 1000) - ms.approvedAt >= WINDOW) {
          try { await settle(d, ms) } catch (e: any) { console.warn('[worker] settle failed', d.id, ms.index, e?.message) }
        } else if (ms.status === 'PENDING') {
          // act only on the earliest still-pending milestone (metric milestones unlock in order)
          if (sorted.some((m: any) => m.index < ms.index && m.status === 'PENDING')) break
          try { await track(d, ms, oracleUrl) } catch (e: any) { console.warn('[worker] track failed', d.id, ms.index, e?.message) }
          break
        }
      }
    }
  } finally { busy = false }
}

export function startWorkers(oracleUrl: string, intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? '20000')) {
  if (process.env.WORKERS_ENABLED === 'false') { console.log('[worker] disabled (WORKERS_ENABLED=false)'); return }
  console.log(`[worker] autonomous tracking + settlement every ${intervalMs / 1000}s (window ${WINDOW}s)`)
  setInterval(() => { tick(oracleUrl).catch((e) => console.warn('[worker] tick error', e?.message)) }, intervalMs)
}
