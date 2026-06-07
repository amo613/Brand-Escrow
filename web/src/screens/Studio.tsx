import { useState } from 'react'
import { createAndFundDeal, acceptOnChain } from '../lib/escrow.ts'
import { api } from '../lib/api.ts'
import { Card, Button } from '../components/ui.tsx'
import type { Wallet } from '../lib/web3auth.ts'
import type { Screen } from '../App.tsx'

const METRICS: [number, string][] = [[0, 'Just post (delivery)'], [1, 'Likes'], [2, 'Views'], [3, 'Comments'], [4, 'Shares']]
const inputCls = 'w-full px-3.5 py-2.5 rounded-ctl hair bg-ink/60 text-[13.5px] text-txt placeholder:text-muted'

export function Studio({ wallet, nav, onDone }: { wallet: Wallet; nav: (n: Screen['name'], id?: string) => void; onDone: () => void }) {
  const [title, setTitle] = useState('Post a Reel featuring #PactPay + @nike')
  const [brief, setBrief] = useState('Film a 15–30s reel showing your training with our gear. #PactPay + @nike in the caption. Authentic > polished.')
  const [platform, setPlatform] = useState('x')
  const [creator, setCreator] = useState('')
  const [ms, setMs] = useState([{ metric: 1, threshold: 5000, amountUsdc: 2 }])
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('')
  const total = ms.reduce((a, m) => a + (+m.amountUsdc || 0), 0)
  const setRow = (i: number, p: any) => setMs(ms.map((m, j) => (j === i ? { ...m, ...p } : m)))

  async function fund() {
    setErr(''); setBusy('Signing the funding group…')
    try {
      const dl = Math.floor(new Date(deadline).getTime() / 1000)
      // delivery (metric 0 = "posted") is a boolean → threshold is always 1, never a leftover count
      const milestones = ms.map((m) => ({ metric: m.metric, threshold: m.metric === 0 ? 1 : +m.threshold, amountUsdc: +m.amountUsdc }))
      const { dealId, txId } = await createAndFundDeal(wallet, milestones, dl)
      setBusy('Registering deal…')
      await api.registerDeal({ onchainId: dealId, title, brief, platform, milestones, fundTx: txId })
      if (creator.trim()) { setBusy('Binding creator on-chain…'); const at = await acceptOnChain(wallet, dealId, creator.trim()); await api.accept(dealId, creator.trim(), at) }
      onDone(); nav('deal', dealId)
    } catch (e: any) { setErr(e?.message ?? String(e)); setBusy('') }
  }

  return (
    <div className="max-w-[760px] mx-auto px-5 py-8">
      <h1 className="font-display text-[28px] font-semibold tracking-tight mb-1">Create a deal</h1>
      <p className="text-txt2 text-[14px] mb-6">Fund USDC into the escrow contract with milestones tied to real metrics.</p>
      <Card className="p-6 flex flex-col gap-4">
        <div><label className="text-[12.5px] text-txt2 block mb-1.5">Deal title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></div>
        <div><label className="text-[12.5px] text-txt2 block mb-1.5">Brief</label><textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} className={inputCls + ' resize-none'} /></div>
        <div><label className="text-[12.5px] text-txt2 block mb-1.5">Platform</label>
          <div className="flex gap-2">{['x', 'tiktok', 'youtube'].map((p) => <button key={p} onClick={() => setPlatform(p)} className="px-4 py-2 rounded-ctl text-[13px]" style={platform === p ? { background: '#00E5A81c', color: '#00E5A8', boxShadow: 'inset 0 0 0 1px #00E5A866' } : { background: '#14171f', color: '#9AA4B2' }}>{p.toUpperCase()}</button>)}</div>
        </div>
        <div>
          <label className="text-[12.5px] text-txt2 block mb-1.5">Milestones (metric · threshold · USDC)</label>
          <div className="flex flex-col gap-2">
            {ms.map((m, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_1fr_0.9fr_auto] gap-2 items-center">
                <select value={m.metric} onChange={(e) => setRow(i, { metric: +e.target.value })} className="px-2.5 py-2 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt">{METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input type="number" disabled={m.metric === 0} value={m.metric === 0 ? '' : m.threshold} onChange={(e) => setRow(i, { threshold: +e.target.value })} placeholder={m.metric === 0 ? '—' : 'threshold'} className="px-2.5 py-2 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt num disabled:opacity-40" />
                <div className="flex items-center gap-1 px-2.5 rounded-ctl hair bg-ink/60"><span className="num text-muted text-[12px]">$</span><input type="number" step="0.5" value={m.amountUsdc} onChange={(e) => setRow(i, { amountUsdc: +e.target.value })} className="bg-transparent w-full py-2 num text-[12.5px] text-txt" /></div>
                <button onClick={() => setMs(ms.filter((_, j) => j !== i))} disabled={ms.length <= 1} className="text-muted hover:text-coral px-1 disabled:opacity-30">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setMs([...ms, { metric: 1, threshold: (ms.at(-1)?.threshold || 5000) * 2, amountUsdc: 1 }])} className="text-[13px] text-mint mt-3">+ Add milestone</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="text-[12.5px] text-txt2 block mb-1.5">Deadline</label><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls + ' num'} /></div>
          <div><label className="text-[12.5px] text-txt2 block mb-1.5">Creator address (optional — bind now)</label><input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="ALGO…" className={inputCls + ' num text-[12px]'} /></div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-line">
          <span className="text-[13px] text-txt2">Total escrow: <span className="num text-mint font-semibold">${total.toFixed(2)} USDC</span></span>
          <Button onClick={fund} disabled={!!busy}>{busy || `Connect wallet & fund $${total.toFixed(2)}`}</Button>
        </div>
        {err && <div className="text-[12.5px] text-coral">{err}</div>}
      </Card>
    </div>
  )
}
