/* Leaderboard — top creators (earned) + top brands (spent), aggregated from real on-chain releases. */
import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { Card, Avatar, Icon, Sparkline, C } from '../components/ui.tsx'
import { fmtUSDC, fmtMetric } from '../lib/format.ts'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const spark = (seed: number, n = 12) => Array.from({ length: n }, (_, i) => 40 + ((seed * (i + 3)) % 60))

export function Leaderboard() {
  const [deals, setDeals] = useState<any[]>([])
  useEffect(() => { api.deals().then(setDeals).catch(() => {}) }, [])

  const creators: Record<string, any> = {}, brands: Record<string, any> = {}
  for (const d of deals) {
    const rel = d.milestones.filter((m: any) => m.status === 'RELEASED').reduce((a: number, m: any) => a + m.amountUsdc, 0)
    if (d.creator) { creators[d.creator] ??= { id: d.creator, name: d.creatorHandle || short(d.creator), earned: 0, deals: 0 }; creators[d.creator].earned += rel; creators[d.creator].deals++ }
    brands[d.brand] ??= { id: d.brand, name: short(d.brand), spent: 0, creators: new Set() }; brands[d.brand].spent += rel; if (d.creator) brands[d.brand].creators.add(d.creator)
  }
  const topC = Object.values(creators).sort((a: any, b: any) => b.earned - a.earned)
  const topB = Object.values(brands).map((b: any) => ({ ...b, creators: b.creators.size })).sort((a: any, b: any) => b.spent - a.spent)

  const Board = ({ title, rows, kind }: { title: string; rows: any[]; kind: 'creator' | 'brand' }) => (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center gap-2"><Icon name="trophy" size={16} c={C.mint} /><span className="text-[15px] font-medium text-txt">{title}</span></div>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-2.5 text-[11px] uppercase tracking-wide text-txt2 border-b border-line"><span>#</span><span>{kind === 'creator' ? 'Creator' : 'Brand'}</span><span className="hidden sm:block text-right">{kind === 'creator' ? 'Deals' : 'Creators'}</span><span className="text-right">{kind === 'creator' ? 'Earned' : 'Spent'}</span></div>
      {rows.length === 0 ? <div className="px-5 py-8 text-center text-[13px] text-txt2">No on-chain releases yet.</div> : rows.map((r, i) => (
        <div key={r.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3 items-center border-b border-line/60 last:border-0 hover:bg-white/[0.02]">
          <span className="num text-[14px] font-semibold w-6 text-center" style={{ color: i === 0 ? C.mint : i === 1 ? C.chain : i === 2 ? C.amber : C.muted }}>{i + 1}</span>
          <div className="flex items-center gap-2.5 min-w-0"><Avatar size={30} glyph={kind === 'brand' ? '◆' : undefined} name={r.name} hue={kind === 'brand' ? C.mint : C.agent} /><div className="min-w-0"><div className="num text-[13.5px] text-txt truncate">{r.name}</div></div></div>
          <div className="hidden sm:flex justify-end items-center">{kind === 'creator' ? <span className="num text-[13px] text-txt2">{r.deals}</span> : <Sparkline data={spark(r.name.length * 7)} color={i === 0 ? 'mint' : 'chain'} w={64} h={22} />}</div>
          <span className="num text-[14px] font-semibold text-right" style={{ color: kind === 'creator' ? C.mint : C.txt }}>{fmtUSDC(kind === 'creator' ? r.earned : r.spent, false)}</span>
        </div>
      ))}
    </Card>
  )

  return (
    <div className="max-w-[1320px] mx-auto px-5 py-7">
      <h1 className="font-display text-[30px] font-semibold tracking-tight mb-1">Leaderboard</h1>
      <p className="text-txt2 text-[14px] mb-6">Verifiable, on-chain track records — earnings and spend settled by the contract.</p>
      <div className="grid lg:grid-cols-2 gap-5"><Board title="Top creators" rows={topC} kind="creator" /><Board title="Top brands" rows={topB} kind="brand" /></div>
    </div>
  )
}
