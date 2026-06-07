import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { Card, Button, Pill } from '../components/ui.tsx'

export function Console() {
  const [deals, setDeals] = useState<any[]>([])
  const [sel, setSel] = useState('')
  const [metric, setMetric] = useState('likes')
  const [value, setValue] = useState(10000)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => api.deals().then((ds) => { setDeals(ds); if (!sel && ds[0]) setSel(ds[0].id) })
  useEffect(() => { load() }, [])
  const deal = deals.find((d) => d.id === sel)

  const apply = async () => {
    if (!deal?.postUrl) { setMsg('this deal has no submitted post yet'); return }
    setBusy('o'); try { await api.metricOverride(deal.postUrl, metric, value); setMsg(`override applied — ${metric} = ${value.toLocaleString()} (post still really fetched)`) } catch (e: any) { setMsg(e.message) } setBusy('')
  }
  const runAgent = async () => { setBusy('a'); try { await api.runAgent(sel, 0); setMsg('agent ran — pays x402, Gemini verdict, on-chain attest. Open the deal to release.'); load() } catch (e: any) { setMsg(e.message) } setBusy('') }

  return (
    <div className="max-w-[900px] mx-auto px-5 py-7">
      <Card className="p-4 mb-6 flex items-center gap-3" glow="agent">
        <div className="grid place-items-center w-10 h-10 rounded-ctl" style={{ background: '#7C5CFF22' }}>⚙</div>
        <div className="flex-1"><div className="text-[15px] font-semibold text-txt flex items-center gap-2">Admin Test Console <Pill text="TEST MODE" color="agent" /></div><div className="text-[12.5px] text-txt2">Drive metrics for demos. The post + profile stay really fetched — only the count is simulated.</div></div>
      </Card>
      <Card className="p-5 flex flex-col gap-4">
        <div><label className="text-[12.5px] text-txt2 block mb-1.5">Active deal</label>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full px-3.5 py-2.5 rounded-ctl hair bg-ink/60 text-[13.5px] text-txt">
            {deals.map((d) => <option key={d.id} value={d.id}>{d.title.slice(0, 48)} — {d.status}</option>)}
          </select>
          {deal && <div className="num text-[11.5px] text-txt2 mt-1.5">{deal.postUrl ? '↳ ' + deal.postUrl : 'no post submitted yet'}</div>}
        </div>
        <div><label className="text-[12.5px] text-txt2 block mb-1.5">Metric</label>
          <div className="flex gap-1.5">{['likes', 'views', 'comments', 'shares'].map((m) => <button key={m} onClick={() => setMetric(m)} className="px-3 py-1.5 rounded-ctl text-[12.5px]" style={metric === m ? { background: '#7C5CFF1f', color: '#7C5CFF' } : { background: '#14171f', color: '#9AA4B2' }}>{m}</button>)}</div>
        </div>
        <div>
          <div className="flex items-end justify-between mb-1"><label className="text-[12.5px] text-txt2">Simulated value</label><span className="num text-[20px] font-semibold text-agent">{value.toLocaleString()}</span></div>
          <input type="range" min={0} max={1_200_000} step={1000} value={value} onChange={(e) => setValue(+e.target.value)} className="w-full" style={{ accentColor: '#7C5CFF' }} />
        </div>
        <div className="flex gap-2.5">
          <Button variant="agent" onClick={apply} disabled={!!busy}>{busy === 'o' ? '…' : 'Apply override'}</Button>
          <Button onClick={runAgent} disabled={!!busy || !deal?.postUrl}>{busy === 'a' ? 'Agent running…' : 'Run agent now →'}</Button>
        </div>
        {msg && <div className="text-[12.5px] text-txt2">{msg}</div>}
        <div className="text-[12px] text-muted border-t border-line pt-3">The override feeds the same on-chain re-check every deal uses — test-only, never bypasses the contract.</div>
      </Card>
    </div>
  )
}
