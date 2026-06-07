/* Brand Studio — 5-step create-deal wizard, ported 1:1 from wizard.jsx. Wired to the real
 * client-signed 3-leg funding group + register. (Eligibility platform removed — set in Brief.) */
import { Fragment, useState, type ReactNode } from 'react'
import { createAndFundDeal } from '../lib/escrow.ts'
import { api } from '../lib/api.ts'
import { Card, Button, Pill, Icon, DataRow, Modal, TxLink, C } from '../components/ui.tsx'
import { fmtUSDC, fmtMetric, fireConfetti } from '../lib/format.ts'
import type { Wallet } from '../lib/web3auth.ts'
import type { Screen } from '../App.tsx'

const STEPS = ['Brief', 'Payout', 'Deadline', 'Eligibility', 'Review']
const METRIC_NUM: Record<string, number> = { posted: 0, likes: 1, views: 2, comments: 3, shares: 4 }
const METRIC_LABEL: Record<string, string> = { posted: 'Just post (delivery)', likes: 'Likes', views: 'Views', comments: 'Comments', shares: 'Shares' }
const inputCls = 'w-full px-3.5 py-2.5 rounded-ctl hair bg-ink/60 text-[13.5px] text-txt placeholder:text-muted focus:border-mint/40 transition-colors'
const TRANCHE_COLORS = [C.mint, C.chain, C.agent, C.amber]

function Stepper({ step, setStep, maxReached }: { step: number; setStep: (i: number) => void; maxReached: number }) {
  return (
    <div className="flex items-center gap-1 mb-7">
      {STEPS.map((s, i) => {
        const done = i < step, cur = i === step, reach = i <= maxReached
        return (
          <Fragment key={s}>
            <button onClick={() => reach && setStep(i)} disabled={!reach} className="flex items-center gap-2" style={{ cursor: reach ? 'pointer' : 'default' }}>
              <span className="grid place-items-center w-7 h-7 rounded-full num text-[12px] font-semibold transition-all" style={cur ? { background: C.mint, color: '#0A0C10' } : done ? { background: C.mint + '22', color: C.mint } : { background: '#14171f', color: C.muted, boxShadow: 'inset 0 0 0 1px #242A35' }}>{done ? '✓' : i + 1}</span>
              <span className="text-[13px] hidden sm:block transition-colors" style={{ color: cur ? C.txt : done ? C.txt2 : C.muted }}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <div className="flex-1 h-px mx-1" style={{ background: i < step ? C.mint + '66' : C.line }} />}
          </Fragment>
        )
      })}
    </div>
  )
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="mb-4"><label className="text-[12.5px] text-txt2 block mb-1.5">{label}</label>{children}{hint && <div className="text-[11.5px] text-muted mt-1.5 text-pretty">{hint}</div>}</div>
}

interface MS { metric: string; threshold: number; amount: number }
export function Studio({ wallet, nav, onDone }: { wallet: Wallet; nav: (n: Screen['name'], id?: string) => void; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [funding, setFunding] = useState(false)
  const [form, setForm] = useState({
    title: 'Post a Reel featuring #LockPay + @nike',
    brief: 'Film a 15–30s reel showing your training routine with our gear visible. Authentic > polished.',
    platform: 'x', hashtag: '#LockPay', mention: '@nike', link: 'nike.com/pactpay', media: 'video',
    mode: 'milestones' as 'full' | 'milestones',
    fullAmount: 2, fullMetric: 'posted', fullThreshold: 50000,
    milestones: [
      { metric: 'likes', threshold: 100, amount: 0.5 },
      { metric: 'likes', threshold: 2000, amount: 1 },
      { metric: 'likes', threshold: 5000, amount: 1.5 },
      { metric: 'likes', threshold: 10000, amount: 2 },
    ] as MS[],
    deadline: '2026-06-30', minFollowers: 50000,
  })
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const go = (i: number) => { setStep(i); setMaxReached((m) => Math.max(m, i)) }
  const total = form.mode === 'milestones' ? form.milestones.reduce((a, m) => a + (+m.amount || 0), 0) : +form.fullAmount || 0
  const fee = +(total * 0.0024 + 0.008).toFixed(3)
  const msValid = form.milestones.every((m, i) => +m.amount > 0 && (m.metric === 'posted' || i === 0 || +m.threshold > +form.milestones[i - 1].threshold))
  const setMs = (i: number, patch: Partial<MS>) => set({ milestones: form.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  const addMs = () => set({ milestones: [...form.milestones, { metric: 'likes', threshold: (form.milestones.at(-1)?.threshold || 0) * 2 || 50000, amount: 1 }] })
  const delMs = (i: number) => set({ milestones: form.milestones.filter((_, j) => j !== i) })

  return (
    <div className="max-w-[860px] mx-auto px-5 py-8">
      <div className="flex items-center gap-2 mb-1"><Icon name="studio" size={16} c={C.mint} /><span className="text-[12px] uppercase tracking-wider text-txt2">Brand Studio</span></div>
      <h1 className="font-display text-[28px] font-semibold tracking-tight mb-6">Create a deal</h1>
      <Stepper step={step} setStep={go} maxReached={maxReached} />

      <Card className="p-6">
        {step === 0 && (
          <div className="anim-fade">
            <Field label="Deal title"><input value={form.title} onChange={(e) => set({ title: e.target.value })} className={inputCls} /></Field>
            <Field label="Brief / description"><textarea rows={3} value={form.brief} onChange={(e) => set({ brief: e.target.value })} className={inputCls + ' resize-none'} /></Field>
            <Field label="Target platform">
              <div className="flex gap-2">{[['x', 'X'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']].map(([v, l]) => (
                <button key={v} onClick={() => set({ platform: v })} className="px-4 py-2 rounded-ctl text-[13px] transition-all" style={form.platform === v ? { background: C.mint + '1c', color: C.mint, boxShadow: `inset 0 0 0 1px ${C.mint}66` } : { background: '#14171f', color: C.txt2 }}>{l}</button>
              ))}</div>
            </Field>
            <Field label="Required elements" hint="What the creator should include. The agent reads the post; the metric threshold is what gates payout.">
              <div className="grid sm:grid-cols-2 gap-2.5">{[['hashtag', 'Hashtag', '#'], ['mention', 'Mention', '@'], ['link', 'Link', '🔗'], ['media', 'Media type', '▦']].map(([k, l, g]) => (
                <div key={k} className="flex items-center gap-2 px-3 rounded-ctl hair bg-ink/60"><span className="num text-muted text-[13px] w-4">{g}</span>
                  {k === 'media' ? <select value={form.media} onChange={(e) => set({ media: e.target.value })} className="bg-transparent flex-1 py-2.5 text-[13px] text-txt"><option value="video">Video</option><option value="image">Image</option><option value="post">Post</option></select>
                    : <input value={(form as any)[k]} onChange={(e) => set({ [k]: e.target.value } as any)} placeholder={l} className="bg-transparent flex-1 py-2.5 text-[13px] text-txt placeholder:text-muted num" />}
                </div>
              ))}</div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="anim-fade">
            <div className="flex gap-2 p-1 rounded-ctl hair bg-ink/40 mb-5 w-max">{[['full', 'Full payment'], ['milestones', 'Milestones']].map(([v, l]) => (
              <button key={v} onClick={() => set({ mode: v as any })} className="px-4 py-2 rounded-[7px] text-[13px] transition-all" style={form.mode === v ? { background: C.mint + '1c', color: C.mint, boxShadow: `inset 0 0 0 1px ${C.mint}66` } : { color: C.txt2 }}>{l}</button>
            ))}</div>
            {form.mode === 'full' ? (
              <div>
                <Field label="Amount (USDC)"><div className="flex items-center gap-2 px-3.5 rounded-ctl hair bg-ink/60"><span className="num text-muted">$</span><input type="number" value={form.fullAmount} onChange={(e) => set({ fullAmount: +e.target.value })} className="bg-transparent flex-1 py-2.5 num text-[14px] text-txt" /><span className="num text-muted text-[12px]">USDC</span></div></Field>
                <Field label="Release condition" hint="A brand can simply require a post — paid on verified delivery, regardless of likes.">
                  <select value={form.fullMetric} onChange={(e) => set({ fullMetric: e.target.value })} className={inputCls}><option value="posted">Just post (delivery only)</option><option value="likes">Likes ≥ threshold</option><option value="views">Views ≥ threshold</option><option value="comments">Comments ≥ threshold</option></select>
                </Field>
                {form.fullMetric !== 'posted' && <Field label="Threshold"><input type="number" value={form.fullThreshold} onChange={(e) => set({ fullThreshold: +e.target.value })} className={inputCls + ' num'} /></Field>}
              </div>
            ) : (
              <div>
                <div className="flex flex-col gap-2.5">{form.milestones.map((m, i) => {
                  // highlight the field that's actually wrong: threshold red ONLY if it doesn't ascend; amount red if ≤ 0
                  const badThreshold = m.metric !== 'posted' && i > 0 && +m.threshold <= +form.milestones[i - 1].threshold
                  const badAmount = !(+m.amount > 0)
                  return (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center">
                      <span className="num text-[12px] text-muted w-5 text-center">{i + 1}</span>
                      <select value={m.metric} onChange={(e) => setMs(i, { metric: e.target.value })} className="w-full appearance-none px-2.5 py-2 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt">{Object.keys(METRIC_NUM).map((o) => <option key={o} value={o}>{o === 'posted' ? 'Delivery' : METRIC_LABEL[o]}</option>)}</select>
                      <input type="number" disabled={m.metric === 'posted'} value={m.metric === 'posted' ? '' : m.threshold} onChange={(e) => setMs(i, { threshold: +e.target.value })} placeholder={m.metric === 'posted' ? '—' : 'threshold'} className="px-2.5 py-2 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt num disabled:opacity-40 placeholder:text-muted" style={badThreshold ? { borderColor: C.coral + '99' } : {}} />
                      <div className="flex items-center gap-1 px-2.5 rounded-ctl hair bg-ink/60" style={badAmount ? { borderColor: C.coral + '99' } : {}}><span className="num text-muted text-[12px]">$</span><input type="number" step="0.5" value={m.amount} onChange={(e) => setMs(i, { amount: +e.target.value })} className="bg-transparent w-full py-2 num text-[12.5px] text-txt" /></div>
                      <button onClick={() => delMs(i)} disabled={form.milestones.length <= 1} className="text-muted hover:text-coral p-1 disabled:opacity-30"><Icon name="x" size={15} /></button>
                    </div>
                  )
                })}</div>
                <button onClick={addMs} className="flex items-center gap-1.5 text-[13px] text-mint mt-3 hover:gap-2.5 transition-all"><Icon name="plus" size={15} c={C.mint} sw={2.4} /> Add milestone</button>
                <div className="mt-5 rounded-ctl p-4 hair bg-ink/40">
                  <div className="flex items-center justify-between mb-2.5"><span className="text-[12px] text-txt2">Tranche distribution</span><span className="num text-[14px] font-semibold text-mint">Total: {fmtUSDC(total)} USDC</span></div>
                  <div className="flex gap-1 h-9 rounded-md overflow-hidden">{form.milestones.map((m, i) => (
                    <div key={i} className="grid place-items-center transition-all duration-500" style={{ flex: +m.amount || 0.01, background: `linear-gradient(180deg, ${TRANCHE_COLORS[i % 4]}cc, ${TRANCHE_COLORS[i % 4]}66)` }}><span className="num text-[10.5px] font-semibold text-ink">{fmtUSDC(+m.amount || 0, false)}</span></div>
                  ))}</div>
                  <div className="flex gap-1 mt-1.5">{form.milestones.map((m, i) => <div key={i} className="num text-[9.5px] text-txt2 text-center" style={{ flex: +m.amount || 0.01 }}>{m.metric === 'posted' ? 'post' : fmtMetric(m.threshold)}</div>)}</div>
                </div>
                {!msValid && <div className="text-[12px] text-coral mt-3 flex items-center gap-1.5"><Icon name="shield" size={13} c={C.coral} /> Thresholds must ascend and every amount must be greater than 0.</div>}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="anim-fade">
            <Field label="Deadline" hint="After this date, any unreached tranche automatically refunds to your wallet."><input type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} className={inputCls + ' num'} /></Field>
            <div className="rounded-ctl p-4 hair mt-2" style={{ background: C.amber + '0d' }}>
              <div className="flex items-start gap-3"><div className="grid place-items-center w-9 h-9 rounded-ctl shrink-0" style={{ background: C.amber + '1c' }}><Icon name="clock" size={17} c={C.amber} /></div>
                <div><div className="text-[13.5px] text-txt font-medium">Refund-on-deadline</div><div className="text-[12.5px] text-txt2 mt-1 text-pretty">Example: if the post reaches <span className="num text-txt">738.2k</span> likes but a <span className="num text-txt">1.0M</span> milestone isn't met by the deadline, that tranche's <span className="num text-mint">2.00 USDC</span> returns to you. You never overpay for unmet results.</div></div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="anim-fade">
            <div className="text-[13px] text-txt2 mb-4">Optional — restrict who can apply. The platform is already set in your Brief.</div>
            <Field label="Minimum followers"><div className="flex items-center gap-2 px-3.5 rounded-ctl hair bg-ink/60"><Icon name="user" size={15} c={C.muted} /><input type="number" value={form.minFollowers} onChange={(e) => set({ minFollowers: +e.target.value })} className="bg-transparent flex-1 py-2.5 num text-[14px] text-txt" /></div></Field>
          </div>
        )}

        {step === 4 && (
          <div className="anim-fade">
            <div className="text-[15px] font-medium text-txt mb-3">Review & fund</div>
            <div className="rounded-ctl hair overflow-hidden">
              <div className="p-4 border-b border-line">
                <div className="text-[14px] text-txt font-medium">{form.title}</div>
                <div className="text-[12.5px] text-txt2 mt-1 text-pretty">{form.brief}</div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">{form.hashtag && <Pill text={form.hashtag} color="chain" size="sm" dot={false} />}{form.mention && <Pill text={form.mention} color="agent" size="sm" dot={false} />}<Pill text={form.platform} color="muted" size="sm" dot={false} /><Pill text={form.media} color="muted" size="sm" dot={false} /></div>
              </div>
              {form.mode === 'milestones' ? (
                <div className="px-4 py-1">{form.milestones.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-line/50 last:border-0 text-[13px]"><span className="text-txt2"><span className="num text-muted mr-2">{i + 1}</span>{m.metric === 'posted' ? 'Delivery' : `${METRIC_LABEL[m.metric]} ≥ ${fmtMetric(m.threshold)}`}</span><span className="num text-txt">{fmtUSDC(m.amount, false)}</span></div>
                ))}</div>
              ) : (
                <div className="px-4 py-3 text-[13px] flex justify-between"><span className="text-txt2">{form.fullMetric === 'posted' ? 'Delivery only' : `${METRIC_LABEL[form.fullMetric]} ≥ ${fmtMetric(form.fullThreshold)}`}</span><span className="num text-txt">{fmtUSDC(form.fullAmount, false)}</span></div>
              )}
              <div className="p-4 bg-ink/40 border-t border-line">
                <DataRow label="Total escrow">{fmtUSDC(total, false)} USDC</DataRow>
                <DataRow label="Network fee (est.)">{fmtUSDC(fee, false)} ALGO</DataRow>
                <DataRow label="Deadline">{new Date(form.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</DataRow>
                <DataRow label="Eligibility">≥{fmtMetric(form.minFollowers)} · {form.platform}</DataRow>
              </div>
            </div>
            <Button variant="primary" full size="lg" className="mt-5" icon="wallet" onClick={() => setFunding(true)} disabled={form.mode === 'milestones' && !msValid}>Connect wallet & fund {fmtUSDC(total, false)}</Button>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mt-5">
        <Button variant="soft" icon="arrowL" onClick={() => (step > 0 ? go(step - 1) : nav('browse'))}>{step > 0 ? 'Back' : 'Cancel'}</Button>
        {step < 4 && <Button variant="primary" iconR="arrow" onClick={() => go(step + 1)} disabled={form.mode === 'milestones' && step === 1 && !msValid}>Continue</Button>}
      </div>

      <FundingModal open={funding} form={form} total={total} wallet={wallet} onClose={() => setFunding(false)} onFunded={(id) => { onDone(); setFunding(false); nav('deal', id) }} />
    </div>
  )
}

function FundingModal({ open, form, total, wallet, onClose, onFunded }: { open: boolean; form: any; total: number; wallet: Wallet; onClose: () => void; onFunded: (id: string) => void }) {
  const [phase, setPhase] = useState<'confirm' | 'signing' | 'done'>('confirm')
  const [tx, setTx] = useState(''); const [dealId, setDealId] = useState(''); const [err, setErr] = useState('')
  const sign = async () => {
    setErr(''); setPhase('signing')
    try {
      const src: MS[] = form.mode === 'milestones' ? form.milestones : [{ metric: form.fullMetric, threshold: form.fullThreshold, amount: form.fullAmount }]
      const milestones = src.map((m) => ({ metric: METRIC_NUM[m.metric] ?? 1, threshold: m.metric === 'posted' ? 1 : Math.round(+m.threshold), amountUsdc: +m.amount }))
      const dl = Math.floor(new Date(form.deadline).getTime() / 1000)
      const r = await createAndFundDeal(wallet, milestones, dl)
      await api.registerDeal({ onchainId: r.dealId, title: form.title, brief: form.brief, platform: form.platform, milestones, fundTx: r.txId, deadlineUnix: dl, required: { hashtag: form.hashtag, mention: form.mention, link: form.link, media: form.media } })
      setTx(r.txId); setDealId(r.dealId); setPhase('done'); fireConfetti()
    } catch (e: any) { setErr(e?.message ?? String(e)); setPhase('confirm') }
  }
  return (
    <Modal open={open} onClose={phase !== 'signing' ? onClose : undefined} width={460} label="Fund escrow">
      <div className="p-6">
        {phase === 'confirm' && (
          <div className="anim-fade">
            <div className="flex items-center gap-2 mb-4"><Icon name="wallet" size={18} c={C.chain} /><span className="text-[16px] font-medium text-txt">Fund escrow</span></div>
            <div className="text-[12.5px] text-txt2 mb-3">Atomic transaction group — all succeed or none do:</div>
            <div className="flex flex-col gap-2">{[[`Transfer ${fmtUSDC(total, false)} USDC → escrow`, 'asset transfer', C.mint], ['Pay ~0.13 ALGO → box rent', 'min-balance payment', C.amber], ['create_deal (app call)', 'application call', C.chain]].map(([t, s, c], i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-ctl hair bg-ink/40"><span className="num text-[11px] w-5 text-center" style={{ color: c as string }}>{i + 1}</span><div className="flex-1"><div className="num text-[13px] text-txt">{t}</div><div className="text-[11px] text-muted">{s}</div></div><Icon name="lock" size={14} c={c as string} /></div>
            ))}</div>
            {err && <div className="text-[12px] text-coral mt-3">{err}</div>}
            <div className="flex gap-2.5 mt-5"><Button variant="ghost" full onClick={onClose}>Cancel</Button><Button variant="primary" full icon="lock" onClick={sign}>Sign &amp; fund</Button></div>
          </div>
        )}
        {phase === 'signing' && (
          <div className="text-center py-8 anim-fade"><div className="w-14 h-14 rounded-full border-2 border-chain/30 border-t-chain spin mx-auto mb-4" /><div className="text-[15px] text-txt font-medium">Submitting atomic group…</div><div className="num text-[12px] text-txt2 mt-1">signing 3 transactions · Algorand TestNet</div></div>
        )}
        {phase === 'done' && (
          <div className="text-center py-6 anim-fade">
            <div className="grid place-items-center w-16 h-16 rounded-full mx-auto mb-4" style={{ background: C.mint + '1c', boxShadow: `0 0 40px -8px ${C.mint}` }}><Icon name="check" size={30} c={C.mint} sw={2.6} /></div>
            <div className="text-[18px] font-semibold text-txt">Escrow funded ✓</div>
            <div className="text-[13px] text-txt2 mt-1.5">{fmtUSDC(total)} locked. Your deal is live in the marketplace.</div>
            <div className="mt-3"><TxLink tx={tx} prefix="funding" /></div>
            <Button variant="primary" full className="mt-5" iconR="arrow" onClick={() => onFunded(dealId)}>View live deal</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
