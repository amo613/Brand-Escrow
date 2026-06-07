/* Browse marketplace — filters + featured hero + deal cards. Ported from discover.jsx (BrowsePage). */
import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { Card, Pill, Button, Avatar, Platform, Icon, C } from '../components/ui.tsx'
import { fmtUSDC, fmtMetric } from '../lib/format.ts'
import type { Screen } from '../App.tsx'

const METRIC_LABEL: Record<string, string> = { posted: 'Delivery', likes: 'Likes', views: 'Views', comments: 'Comments', shares: 'Shares' }
const daysUntil = (ms?: number) => (ms ? Math.max(0, Math.ceil((ms - Date.now()) / 864e5)) : null)

function DealCard({ d, onOpen }: { d: any; onOpen: () => void }) {
  const payout = d.milestones.reduce((a: number, m: any) => a + m.amountUsdc, 0)
  const days = daysUntil(d.deadline)
  const metric = d.milestones[0]?.metric ?? 'likes'
  return (
    <Card hover onClick={onOpen} className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Avatar size={32} glyph="◆" hue={C.mint} />
        <div className="leading-tight flex-1 min-w-0"><div className="num text-[12px] text-txt font-medium truncate">{d.brand?.slice(0, 8)}…</div><div className="num text-[11px] text-txt2 flex items-center gap-1"><Platform p={d.platform} c={C.txt2} /> · <Pill status={d.status} size="sm" dot={false} /></div></div>
      </div>
      <div className="text-[14px] text-txt font-medium leading-snug text-pretty min-h-[40px]">{d.title}</div>
      <div className="flex items-center justify-between">
        <div><div className="num text-[18px] font-semibold text-mint">up to {fmtUSDC(payout, false)}</div><div className="text-[11px] text-txt2">{d.milestones.length} milestone{d.milestones.length > 1 ? 's' : ''} · {(METRIC_LABEL[metric] || metric).toLowerCase()}</div></div>
        {days != null && <div className="text-right"><div className="num text-[12.5px]" style={{ color: days < 7 ? C.amber : C.txt2 }}>{days}d left</div><div className="text-[10.5px] text-muted num">{d.creator ? 'taken' : 'open'}</div></div>}
      </div>
    </Card>
  )
}

export function Browse({ nav }: { nav: (n: Screen['name'], id?: string) => void }) {
  const [deals, setDeals] = useState<any[]>([])
  const [platform, setPlatform] = useState('all')
  const [metric, setMetric] = useState('all')
  const [sort, setSort] = useState('reward')
  useEffect(() => { api.deals().then(setDeals).catch(() => {}) }, [])

  let list = deals.filter((d) => (platform === 'all' || d.platform === platform) && (metric === 'all' || d.milestones.some((m: any) => m.metric === metric)))
  const payout = (d: any) => d.milestones.reduce((a: number, m: any) => a + m.amountUsdc, 0)
  list = list.slice().sort((a, b) => (sort === 'reward' ? payout(b) - payout(a) : (a.deadline ?? 0) - (b.deadline ?? 0)))
  const featured = list[0]

  const Seg = ({ value, set, opts }: { value: string; set: (v: string) => void; opts: { v: string; l: string }[] }) => (
    <div className="flex items-center gap-1 p-1 rounded-ctl hair bg-ink/40">
      {opts.map((o) => <button key={o.v} onClick={() => set(o.v)} className="px-2.5 py-1 rounded-[7px] text-[12.5px] transition-all" style={value === o.v ? { background: C.mint + '1c', color: C.mint } : { color: C.txt2 }}>{o.l}</button>)}
    </div>
  )

  return (
    <div className="max-w-[1320px] mx-auto px-5 py-7">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div><h1 className="font-display text-[30px] font-semibold tracking-tight">Browse deals</h1><p className="text-txt2 text-[14px] mt-1">{list.length} campaign{list.length !== 1 ? 's' : ''} · funded escrow, ready to claim.</p></div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Seg value={platform} set={setPlatform} opts={[{ v: 'all', l: 'All' }, { v: 'x', l: 'X' }, { v: 'tiktok', l: 'TikTok' }, { v: 'youtube', l: 'YouTube' }]} />
          <Seg value={metric} set={setMetric} opts={[{ v: 'all', l: 'Any' }, { v: 'likes', l: 'Likes' }, { v: 'views', l: 'Views' }, { v: 'posted', l: 'Delivery' }]} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none pl-3 pr-8 py-2 rounded-ctl hair bg-ink/40 text-[12.5px] text-txt"><option value="reward">Sort: reward</option><option value="newest">Sort: deadline</option></select>
        </div>
      </div>

      {featured && (
        <Card hover onClick={() => nav('deal', featured.id)} glow="mint" className="p-5 mb-5 flex items-center gap-5 flex-wrap">
          <Avatar size={48} glyph="◆" hue={C.mint} />
          <div className="flex-1 min-w-[220px]"><div className="flex items-center gap-2 mb-1"><span className="text-[12px] text-mint uppercase tracking-wide">Featured · live</span><Pill status={featured.status} size="sm" /></div><div className="text-[17px] font-medium text-txt">{featured.title}</div><div className="num text-[12.5px] text-txt2 mt-1">{featured.milestones.length} milestone{featured.milestones.length > 1 ? 's' : ''} · {featured.platform}</div></div>
          <div className="text-right"><div className="num text-[22px] font-semibold text-mint">{fmtUSDC(payout(featured), false)}</div><div className="text-[11px] text-txt2">USDC total</div></div>
          <Button variant="ghost" iconR="arrow">View deal</Button>
        </Card>
      )}

      {list.length === 0 ? <Card className="p-12 text-center text-txt2">No deals yet. A brand needs to create + fund one in Brand Studio.</Card> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{list.map((d) => <DealCard key={d.id} d={d} onOpen={() => nav('deal', d.id)} />)}</div>
      )}
    </div>
  )
}
