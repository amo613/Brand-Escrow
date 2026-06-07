/* Deal detail — HERO screen: header (brand↔creator), apply/accept/submit actions, post preview,
 * milestone timeline (TimelockRing), trust panel (agent log + guardrails + x402). Ported from dealDetail.jsx. */
import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { acceptOnChain } from '../lib/escrow.ts'
import { verifySocial } from '../lib/social.ts'
import { Card, Button, Pill, TxLink, Icon, Avatar, Platform, ProgressBar, TimelockRing, C } from '../components/ui.tsx'
import { fmtUSDC, fmtMetric } from '../lib/format.ts'
import type { Wallet } from '../lib/web3auth.ts'
import type { Screen } from '../App.tsx'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const PLAT_LABEL: Record<string, string> = { x: 'X', youtube: 'YouTube', tiktok: 'TikTok' }
const METRIC_LABEL: Record<string, string> = { posted: 'Delivery', likes: 'Likes', views: 'Views', comments: 'Comments', shares: 'Shares', followers: 'Followers' }
const WINDOW = Number(import.meta.env.VITE_CHALLENGE_WINDOW ?? '15')
const pct = (cur: number, t: number) => Math.min(100, Math.max(0, (cur / (t || 1)) * 100))
const msColor = (s: string) => (s === 'RELEASED' ? C.mint : s === 'REACHED_PENDING' ? C.amber : C.txt2)

export function DealDetail({ id, wallet, role, onBalances, nav }: { id: string; wallet: Wallet; role: 'brand' | 'creator'; onBalances: () => void; nav: (n: Screen['name'], id?: string) => void }) {
  const [d, setD] = useState<any>(null)
  const [postUrl, setPostUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [socials, setSocials] = useState<any[]>([])
  const [busy, setBusy] = useState('')
  const load = () => api.deal(id).then(setD).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [id])
  useEffect(() => { api.socials().then(setSocials).catch(() => {}) }, [])
  if (!d) return <div className="p-16 text-center text-txt2">Loading deal…</div>

  const verified = socials.find((s: any) => s.platform === d.platform)
  const run = async (fn: () => Promise<any>, tag: string) => { setBusy(tag); try { await fn() } catch (e: any) { alert(e?.message ?? e) } await load(); setBusy('') }
  const submit = () => run(() => api.submit(id, postUrl), 'submit')
  const runAgent = (i: number) => run(() => api.runAgent(id, i), 'agent')
  const release = (i: number) => run(async () => { await api.release(id, i); onBalances() }, 'release')
  const applyToDeal = () => run(() => api.apply(id, (verified?.handle ?? handle).trim()), 'apply')
  const accept = (addr: string) => run(async () => { const tx = await acceptOnChain(wallet, id, addr); await api.accept(id, addr, tx) }, 'accept-' + addr)
  const verify = (platform: string) => run(async () => { const r = await verifySocial(platform as any); if (!r.ok) throw new Error(r.error || 'verification failed'); setSocials(await api.socials()) }, 'verify')

  const isBrand = wallet.address === d.brand
  const isBoundCreator = d.creator === wallet.address
  const applied = (d.applicants ?? []).some((a: any) => a.address === wallet.address)
  const canApply = role === 'creator' && !isBrand && !d.creator && !applied
  const total = d.milestones.reduce((a: number, m: any) => a + m.amountUsdc, 0)
  const released = d.milestones.filter((m: any) => m.status === 'RELEASED').reduce((a: number, m: any) => a + m.amountUsdc, 0)
  const log: { t: string; text: string; kind: string }[] = d.agentLog ?? []
  // last observed value for a metric, parsed from the agent log ("… metric=NUMBER …")
  const lastObserved = (metric: string) => { for (let i = log.length - 1; i >= 0; i--) { const m = log[i].text.match(new RegExp(metric + '=(\\d+)')); if (m) return Number(m[1]) } return 0 }

  return (
    <div className="max-w-[1320px] mx-auto px-5 py-7">
      <button onClick={() => nav(role === 'brand' ? 'home' : 'browse')} className="flex items-center gap-1.5 text-[13px] text-txt2 hover:text-txt mb-5 transition-colors"><Icon name="arrowL" size={15} /> Back to deals</button>

      {/* header */}
      <Card className="p-5 mb-5 anim-rise">
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-3 mb-3">
              <Avatar size={38} glyph="◆" hue={C.mint} />
              <Icon name="arrow" size={16} c={C.muted} />
              <Avatar size={38} name={d.creatorHandle || d.creator || '—'} hue={C.agent} ring img={d.creatorStats?.avatarUrl} />
              <Pill status={d.status} />
            </div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight leading-tight text-balance">{d.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-[12.5px] num text-txt2 flex-wrap">
              <span className="text-txt">brand</span><span className="text-muted">{short(d.brand)}</span><span className="text-muted">→</span>
              {d.creator ? <><span className="text-txt">{d.creatorHandle || 'creator'}</span><span className="text-muted">{short(d.creator)}</span></> : <span className="text-muted">no creator bound</span>}
              <span className="text-muted">·</span><Platform p={d.platform} c={C.txt2} />
            </div>
          </div>
          <div className="flex gap-6">
            <div className="text-right"><div className="text-[11.5px] uppercase tracking-wide text-txt2">Total escrowed</div><div className="num text-[28px] font-semibold text-txt leading-tight mt-1">{fmtUSDC(total, false)}</div><div className="num text-[11.5px] text-mint mt-0.5">{fmtUSDC(released, false)} released</div></div>
            {d.tx?.fund && <div className="text-right"><div className="text-[11.5px] uppercase tracking-wide text-txt2">Funding</div><div className="mt-2"><TxLink tx={d.tx.fund} prefix="funded" /></div></div>}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5 items-start">
        {/* LEFT */}
        <div className="flex flex-col gap-5">
          {/* action card: apply / accept / submit */}
          {(canApply || (role === 'creator' && !isBrand && applied && !isBoundCreator) || (isBrand && !d.creator) || (isBoundCreator && !d.postUrl)) && (
            <Card className="p-5" glow="agent">
              {canApply && (verified ? (
                <>
                  <div className="text-[12.5px] text-txt mb-2.5">Verified as <span className="num text-mint">{verified.handle}</span> on {PLAT_LABEL[d.platform] ?? d.platform} ✓</div>
                  <Button onClick={applyToDeal} disabled={busy === 'apply'}>{busy === 'apply' ? '…' : 'Apply to deliver this deal'}</Button>
                </>
              ) : (
                <>
                  <div className="text-[14px] font-medium text-txt">Verify your {PLAT_LABEL[d.platform] ?? d.platform} account to apply</div>
                  <div className="text-[12px] text-txt2 mt-0.5 mb-3">Proves the @handle of the post we'll track — OAuth, we never see your password.</div>
                  <Button variant="agent" icon="user" onClick={() => verify(d.platform)} disabled={busy === 'verify'}>{busy === 'verify' ? 'Opening…' : `Verify @handle on ${PLAT_LABEL[d.platform] ?? d.platform}`}</Button>
                  <div className="flex gap-2 mt-3"><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="or apply with @handle manually" className="flex-1 px-3 py-2 rounded-ctl hair bg-ink/60 text-[12px] text-txt num" /><Button variant="ghost" onClick={applyToDeal} disabled={busy === 'apply' || !handle.trim()}>{busy === 'apply' ? '…' : 'Apply'}</Button></div>
                </>
              ))}
              {role === 'creator' && !isBrand && applied && !isBoundCreator && <div className="text-[13px] text-amber flex items-center gap-2"><Icon name="clock" size={15} c={C.amber} /> Applied — waiting for the brand to accept you.</div>}
              {isBrand && !d.creator && (
                <>
                  <div className="text-[12.5px] text-txt2 mb-3 flex items-start gap-2"><Icon name="user" size={14} c={C.mint} className="mt-0.5 shrink-0" /><span>You funded this deal — accept a creator below. <span className="text-muted">To apply as a creator instead, open it from a different wallet.</span></span></div>
                  <div className="text-[12px] uppercase tracking-wider text-txt2 mb-3">Applicants {(d.applicants ?? []).length > 0 && `(${d.applicants.length})`}</div>
                  {(d.applicants ?? []).length === 0 ? <div className="text-[12.5px] text-muted">No applicants yet — a creator needs to apply.</div> : (
                    <div className="flex flex-col gap-2.5">{d.applicants.map((a: any) => (
                      <div key={a.address} className="flex items-center gap-3"><Avatar size={40} name={a.handle || a.address} hue={C.agent} img={a.avatarUrl} ring />
                        <div className="flex-1 min-w-0"><div className="text-[13.5px] text-txt flex items-center gap-1.5">{a.handle || 'creator'} {a.verified && <Icon name="check" size={12} c={C.mint} sw={3} />}</div><div className="num text-[11px] text-txt2 truncate">{a.followers != null ? `${fmtMetric(a.followers)} followers${a.engagement != null ? ` · ${a.engagement}% eng` : ''} · ${short(a.address)}` : short(a.address)}</div></div>
                        <Button size="sm" variant="primary" icon="check" onClick={() => accept(a.address)} disabled={busy.startsWith('accept')}>{busy === 'accept-' + a.address ? 'Binding…' : 'Accept'}</Button>
                      </div>
                    ))}</div>
                  )}
                </>
              )}
              {isBoundCreator && !d.postUrl && (
                <>
                  <div className="text-[14px] font-medium text-txt mb-2">Submit your post link</div>
                  <div className="flex gap-2"><input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://x.com/you/status/…" className="flex-1 px-3 py-2 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt num" /><Button onClick={submit} disabled={busy === 'submit' || !postUrl}>{busy === 'submit' ? '…' : 'Submit'}</Button></div>
                </>
              )}
            </Card>
          )}

          {/* post preview */}
          <Card className={d.postUrl ? 'overflow-hidden' : 'p-6 border-dashed'}>
            {d.postUrl ? (
              <>
                <div className="p-4 flex items-center gap-3 border-b border-line">
                  <Avatar size={40} name={d.creatorHandle || d.creator || '—'} hue={C.agent} ring img={d.creatorStats?.avatarUrl} />
                  <div className="leading-tight flex-1 min-w-0"><div className="text-[14px] font-medium text-txt flex items-center gap-1.5">{d.creatorHandle || short(d.creator)} {d.creator && <Icon name="check" size={12} c={C.mint} sw={3} />}</div><div className="num text-[11.5px] text-txt2"><Platform p={d.platform} c={C.txt2} /> · tracked post</div></div>
                  <a href={d.postUrl} target="_blank" rel="noreferrer" className="num text-[12px] text-chain hover:underline inline-flex items-center gap-1">open post <Icon name="ext" size={11} c={C.chain} sw={2} /></a>
                </div>
                <div className="p-4"><div className="num text-[12px] text-chain truncate">↳ {d.postUrl}</div></div>
              </>
            ) : (
              <div className="flex items-center gap-3 text-txt2"><div className="grid place-items-center w-10 h-10 rounded-ctl bg-white/[0.03]"><Icon name="studio" size={18} c={C.muted} /></div><div><div className="text-[14px] text-txt">No post submitted yet</div><div className="text-[12.5px] text-muted">Tracking starts when the bound creator submits the link.</div></div></div>
            )}
          </Card>

          {/* milestone timeline */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-medium text-txt flex items-center gap-2"><Icon name="pulse" size={16} c={C.amber} /> Milestone timeline</h2>
              <span className="text-[12px] num text-txt2">{d.milestones.filter((m: any) => m.status === 'RELEASED').length}/{d.milestones.length} released</span>
            </div>
            {d.milestones.map((m: any, i: number) => {
              const col = msColor(m.status); const last = i === d.milestones.length - 1
              const cur = m.metric === 'posted' ? (m.status !== 'PENDING' ? 1 : 0) : lastObserved(m.metric)
              const p = pct(cur, m.threshold)
              const endsAt = (m.approvedAt ? m.approvedAt + WINDOW : 0) * 1000
              return (
                <div key={i} className="flex gap-4 relative">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="grid place-items-center w-9 h-9 rounded-full shrink-0 z-10 transition-all" style={{ background: col + '1c', boxShadow: m.status === 'REACHED_PENDING' ? `0 0 0 1px ${col}, 0 0 18px -2px ${col}` : `inset 0 0 0 1px ${col}55`, animation: m.status === 'REACHED_PENDING' ? 'pulseGlow 1.8s ease-in-out infinite' : 'none' }}>
                      {m.status === 'RELEASED' ? <Icon name="check" size={16} c={col} sw={2.6} /> : <span className="num text-[12px] font-semibold" style={{ color: col }}>{i + 1}</span>}
                    </div>
                    {!last && <div className="w-px flex-1 my-1" style={{ background: m.status === 'RELEASED' ? C.mint + '66' : C.line }} />}
                  </div>
                  <div className="flex-1 pb-6 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="text-[14.5px] font-medium text-txt">{m.metric === 'posted' ? 'Delivery — post the video' : `${METRIC_LABEL[m.metric]} ≥ ${fmtMetric(m.threshold)}`}</span><Pill status={m.status} size="sm" /></div>
                        {m.metric !== 'posted' && cur > 0 && <div className="num text-[12px] text-txt2 mt-1"><span style={{ color: col }}>{fmtMetric(cur)}</span> / {fmtMetric(m.threshold)} {(METRIC_LABEL[m.metric] || '').toLowerCase()} <span className="text-muted">({Math.round(p)}%)</span></div>}
                      </div>
                      <div className="num text-[16px] font-semibold shrink-0" style={{ color: m.status === 'RELEASED' ? C.mint : C.txt }}>{fmtUSDC(m.amountUsdc, false)}</div>
                    </div>
                    {m.metric !== 'posted' && m.status === 'PENDING' && cur > 0 && <div className="mt-2.5"><ProgressBar value={p} color="amber" height={7} /></div>}
                    {m.status === 'PENDING' && d.postUrl && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap"><span className="text-[12px] text-txt2">Tracked automatically by the agent.</span><Button size="sm" variant="agent" onClick={() => runAgent(i)} disabled={!!busy}>{busy === 'agent' ? 'Agent working…' : 'Run agent now'}</Button></div>
                    )}
                    {m.status === 'REACHED_PENDING' && (
                      <div className="mt-3 flex items-center gap-4 rounded-ctl p-3 hair" style={{ background: C.amber + '0d' }}>
                        {endsAt > Date.now() ? <TimelockRing endsAt={endsAt} total={WINDOW} size={58} /> : <div className="grid place-items-center w-[58px] h-[58px]"><Icon name="check" size={24} c={C.mint} sw={2.4} /></div>}
                        <div className="flex-1 min-w-0 leading-snug"><div className="text-[13px] text-txt flex items-center gap-1.5"><Icon name="spark" size={13} c={C.agent} /> AI verified — auto-releasing</div><div className="text-[12px] text-txt2 mt-1">The settlement worker releases after the window.</div></div>
                        <Button size="sm" variant="ghost" onClick={() => release(i)} disabled={!!busy}>{busy === 'release' ? '…' : 'Release now'}</Button>
                      </div>
                    )}
                    {m.status === 'RELEASED' && <div className="num text-[12px] text-mint mt-2 flex items-center gap-2 flex-wrap"><Icon name="coin" size={13} c={C.mint} /> Paid {fmtUSDC(m.amountUsdc, false)} USDC {m.releaseTx && <><span className="text-muted">·</span><TxLink tx={m.releaseTx} prefix="release" /></>}</div>}
                  </div>
                </div>
              )
            })}
          </Card>

          {/* brief */}
          <Card className="p-5">
            <div className="text-[12px] uppercase tracking-wider text-txt2 mb-2">The brief</div>
            <p className="text-[13.5px] text-txt2 leading-relaxed text-pretty">{d.brief}</p>
            {d.required && (d.required.hashtag || d.required.mention || d.required.link || d.required.media) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {d.required.hashtag && <Pill text={d.required.hashtag} color="chain" size="sm" dot={false} />}
                {d.required.mention && <Pill text={d.required.mention} color="agent" size="sm" dot={false} />}
                {d.required.link && <Pill text={'🔗 ' + d.required.link} color="muted" size="sm" dot={false} />}
                {d.required.media && <Pill text={d.required.media} color="muted" size="sm" dot={false} />}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT — trust panel */}
        <div className="lg:sticky lg:top-[76px] flex flex-col gap-4">
          <Card className="p-4" glow="agent">
            <div className="flex items-center gap-2.5"><div className="grid place-items-center w-9 h-9 rounded-ctl" style={{ background: C.agent + '1c' }}><Icon name="spark" size={18} c={C.agent} /></div><div className="leading-tight flex-1"><div className="text-[14px] font-medium text-txt">Autonomous agent</div><div className="text-[11.5px] text-txt2">judges proof · bounded by contract</div></div><Pill text="online" color="agent" size="sm" pulse /></div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center gap-2"><span className="num text-[11px] text-muted">agent.log</span></div>
            <div className="num text-[12px] leading-[1.8] px-3 py-2.5 max-h-[234px] overflow-y-auto" style={{ background: '#0B0E13' }}>
              {log.length === 0 ? <div className="text-muted">no activity yet — agent tracks the post automatically</div> : log.map((l, i) => (
                <div key={i} className="flex gap-2"><span className="text-muted shrink-0">{l.t}</span><span style={{ color: ({ chain: C.chain, verdict: C.agent, release: C.mint, danger: C.coral } as any)[l.kind] ?? C.txt2 }}>{l.text}</span></div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3"><Icon name="lock" size={15} c={C.mint} /><span className="text-[12px] uppercase tracking-wider text-txt2">Live guardrails</span></div>
            <div className="flex flex-col gap-2">
              {([['Recipient locked', d.creator ? short(d.creator) : 'on accept', !!d.creator], ['Amount locked', 'per milestone', true], ['Metric re-checked on-chain', '≥ threshold', true], ['Oracle-only attestation', 'LockPay oracle', true], ['Challenge window', `${WINDOW}s timelock`, true], ['Refund to brand', 'after deadline', true]] as [string, string, boolean][]).map(([t, v, ok], i) => (
                <div key={i} className="flex items-start gap-2.5"><Icon name={ok ? 'check' : 'clock'} size={14} c={ok ? C.mint : C.amber} sw={2.6} className="mt-0.5 shrink-0" /><div className="flex-1 min-w-0"><div className="text-[12.5px] text-txt">{t}</div><div className="num text-[11.5px] text-txt2 truncate">{v}</div></div></div>
              ))}
            </div>
          </Card>

          {(d.tx?.x402 || d.tx?.verdict) && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3"><Icon name="bolt" size={15} c={C.chain} /><span className="text-[12px] uppercase tracking-wider text-txt2">x402 proof receipts</span></div>
              <div className="flex flex-col gap-1.5">
                {d.tx.x402 && <div className="flex items-center gap-2 text-[12px]"><span className="num text-chain">{fmtUSDC(0.01, false)}</span><span className="text-muted">proof</span><span className="ml-auto"><TxLink tx={d.tx.x402} /></span></div>}
                {d.tx.verdict && <div className="flex items-center gap-2 text-[12px]"><span className="num text-agent">verdict</span><span className="text-muted">on-chain attest</span><span className="ml-auto"><TxLink tx={d.tx.verdict} /></span></div>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
