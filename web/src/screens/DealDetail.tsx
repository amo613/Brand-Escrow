import { useEffect, useState } from 'react'
import { api, LORA } from '../lib/api.ts'
import { Card, Button, Pill, TxLink } from '../components/ui.tsx'
import type { Wallet } from '../lib/web3auth.ts'

const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n))
const statusColor: Record<string, string> = { PENDING: 'muted', REACHED_PENDING: 'amber', RELEASED: 'mint', REFUNDED: 'muted', FUNDED: 'chain', ACCEPTED: 'txt2', TRACKING: 'amber', PARTIALLY_RELEASED: 'mint', DISPUTED: 'coral' }

export function DealDetail({ id, wallet, role, onBalances }: { id: string; wallet: Wallet; role: 'brand' | 'creator'; onBalances: () => void }) {
  const [d, setD] = useState<any>(null)
  const [postUrl, setPostUrl] = useState('')
  const [busy, setBusy] = useState('')
  const load = () => api.deal(id).then(setD).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [id])
  if (!d) return <div className="p-16 text-center text-txt2">Loading deal…</div>

  const run = async (fn: () => Promise<any>, tag: string) => { setBusy(tag); try { await fn() } catch (e: any) { alert(e?.message ?? e) } await load(); setBusy('') }
  const submit = () => run(() => api.submit(id, postUrl), 'submit')
  const runAgent = (i: number) => run(() => api.runAgent(id, i), 'agent')
  const release = (i: number) => run(async () => { await api.release(id, i); onBalances() }, 'release')

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-7 grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2"><Pill text={d.status} color={statusColor[d.status] ?? 'txt2'} /><span className="num text-[11.5px] text-txt2">{d.platform}</span></div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight">{d.title}</h1>
          <p className="text-[13.5px] text-txt2 mt-1.5">{d.brief}</p>
          <div className="num text-[11.5px] text-txt2 mt-3 flex flex-wrap gap-x-3 gap-y-1">
            <span>brand {d.brand.slice(0, 6)}…</span>{d.creator && <span>→ creator {d.creator.slice(0, 6)}…</span>}
            {d.tx.fund && <TxLink tx={d.tx.fund} label="funded" lora={LORA} />}
          </div>
          {/* creator submits the post link */}
          {(!d.postUrl) && (role === 'creator' || d.creator === wallet.address) && (
            <div className="flex gap-2 mt-4"><input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="Paste your post link…" className="flex-1 px-3 py-2 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt num" /><Button onClick={submit} disabled={busy === 'submit' || !postUrl}>{busy === 'submit' ? '…' : 'Submit'}</Button></div>
          )}
          {d.postUrl && <div className="num text-[11.5px] text-chain mt-3 truncate">↳ post: {d.postUrl}</div>}
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-medium text-txt mb-4">Milestones</h2>
          <div className="flex flex-col gap-4">
            {d.milestones.map((m: any) => (
              <div key={m.index} className="flex items-start gap-3">
                <div className="grid place-items-center w-8 h-8 rounded-full shrink-0 num text-[12px]" style={{ background: '#14171f', color: '#9AA4B2' }}>{m.index + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[14px] text-txt">{m.metric === 'posted' ? 'Delivery — post the video' : `${m.metric} ≥ ${fmt(m.threshold)}`}</span>
                    <span className="num text-[14px] font-semibold" style={{ color: m.status === 'RELEASED' ? '#00E5A8' : '#EDF0F4' }}>${m.amountUsdc.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Pill text={m.status} color={statusColor[m.status] ?? 'txt2'} />
                    {d.postUrl && m.status === 'PENDING' && <Button variant="agent" onClick={() => runAgent(m.index)} disabled={!!busy}>{busy === 'agent' ? 'Agent working…' : 'Run AI agent (x402)'}</Button>}
                    {m.status === 'REACHED_PENDING' && <Button onClick={() => release(m.index)} disabled={!!busy}>{busy === 'release' ? 'Releasing…' : 'Release tranche'}</Button>}
                    {m.releaseTx && <TxLink tx={m.releaseTx} label="release" lora={LORA} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-[76px]">
        <Card className="p-4" glow="agent">
          <div className="flex items-center gap-2.5 mb-3"><div className="grid place-items-center w-8 h-8 rounded-ctl" style={{ background: '#7C5CFF1c' }}>✦</div><div className="leading-tight flex-1"><div className="text-[14px] font-medium text-txt">Autonomous agent</div><div className="text-[11.5px] text-txt2">judges proof · bounded by contract</div></div><Pill text="online" color="agent" pulse /></div>
          <div className="rounded-card overflow-hidden hair" style={{ background: '#0B0E13' }}>
            <div className="num text-[12px] leading-[1.8] px-3 py-2.5 max-h-[230px] overflow-y-auto">
              {d.agentLog.length === 0 ? <div className="text-muted">no activity yet — submit a post + run the agent</div> : d.agentLog.map((l: any, i: number) => (
                <div key={i} className="flex gap-2"><span className="text-muted shrink-0">{l.t}</span><span style={{ color: { chain: '#34D2FF', verdict: '#7C5CFF', release: '#00E5A8', danger: '#FF5A6E' }[l.kind] ?? '#9AA4B2' }}>{l.text}</span></div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] uppercase tracking-wider text-txt2 mb-3">🔒 Live guardrails</div>
          {[['Recipient bound', d.creator ? d.creator.slice(0, 10) + '…' : 'on accept'], ['Amount bound', 'per milestone'], ['Metric re-checked on-chain', '≥ threshold'], ['Oracle-only attestation', 'PactPay agent'], ['Refund on deadline', 'to brand']].map(([t, v], i) => (
            <div key={i} className="flex items-start gap-2.5 mb-2"><span className="text-mint mt-0.5">✓</span><div><div className="text-[12.5px] text-txt">{t}</div><div className="num text-[11.5px] text-txt2">{v}</div></div></div>
          ))}
        </Card>
        {(d.tx.x402 || d.tx.verdict) && (
          <Card className="p-4">
            <div className="text-[12px] uppercase tracking-wider text-txt2 mb-2">x402 + verdict receipts</div>
            <div className="flex flex-col gap-1.5">{d.tx.x402 && <div className="text-[12px]"><span className="num text-chain">0.01 USDC</span> proof · <TxLink tx={d.tx.x402} lora={LORA} /></div>}{d.tx.verdict && <div className="text-[12px]">verdict · <TxLink tx={d.tx.verdict} lora={LORA} /></div>}</div>
          </Card>
        )}
      </div>
    </div>
  )
}
