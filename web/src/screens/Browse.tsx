import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { Card, Pill } from '../components/ui.tsx'
import type { Screen } from '../App.tsx'

export function Browse({ nav }: { nav: (n: Screen['name'], id?: string) => void }) {
  const [deals, setDeals] = useState<any[]>([])
  useEffect(() => { api.deals().then(setDeals).catch(() => {}) }, [])
  return (
    <div className="max-w-[1280px] mx-auto px-5 py-7">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Browse deals</h1>
      <p className="text-txt2 text-[14px] mt-1 mb-6">{deals.length} funded campaign{deals.length !== 1 ? 's' : ''} · escrow ready, released on verified metrics.</p>
      {deals.length === 0 ? <Card className="p-12 text-center text-txt2">No deals yet. A brand needs to create + fund one in Brand Studio.</Card> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deals.map((d) => {
            const total = d.milestones.reduce((a: number, m: any) => a + m.amountUsdc, 0)
            return (
              <Card key={d.id} className="p-4 cursor-pointer hover:border-white/15" glow={d.status === 'TRACKING' ? 'amber' : undefined}>
                <div onClick={() => nav('deal', d.id)}>
                  <div className="flex items-center justify-between mb-2"><span className="num text-[11.5px] text-txt2">{d.platform}</span><Pill text={d.status} color={d.status === 'RELEASED' ? 'mint' : d.status === 'TRACKING' ? 'amber' : 'chain'} /></div>
                  <div className="text-[14px] text-txt font-medium leading-snug min-h-[40px]">{d.title}</div>
                  <div className="flex items-center justify-between mt-3">
                    <div><div className="num text-[18px] font-semibold text-mint">up to ${total.toFixed(2)}</div><div className="text-[11px] text-txt2">{d.milestones.length} milestone{d.milestones.length > 1 ? 's' : ''}</div></div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
