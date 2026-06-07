/* Role-aware dashboard — Brand (Campaigns / Applicants / Spend) · Creator (Active / Payouts).
 * No role switcher: the role comes from the session. Ported from wizard.jsx + discover.jsx dashboards. */
import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { getBalances, type Wallet } from '../lib/web3auth.ts'
import { Card, Button, StatCard, Pill, Avatar, Icon, ProgressBar, TxLink, Platform, C } from '../components/ui.tsx'
import { fmtUSDC, fmtMetric } from '../lib/format.ts'
import type { Screen } from '../App.tsx'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const METRIC_LABEL: Record<string, string> = { posted: 'Delivery', likes: 'Likes', views: 'Views', comments: 'Comments', shares: 'Shares' }

export function Dashboard({ wallet, role, balances, onBalances, health, nav }: { wallet: Wallet; role: 'brand' | 'creator'; balances: any; onBalances: (b: any) => void; health: any; nav: (n: Screen['name'], id?: string) => void }) {
  const [deals, setDeals] = useState<any[]>([])
  const [tab, setTab] = useState(role === 'brand' ? 'campaigns' : 'active')
  const refresh = () => { api.deals().then(setDeals).catch(() => {}); getBalances(wallet.address).then(onBalances) }
  useEffect(() => { refresh(); const t = setInterval(() => api.deals().then(setDeals).catch(() => {}), 5000); return () => clearInterval(t) }, [])

  const mine = deals.filter((d) => (role === 'brand' ? d.brand === wallet.address : d.creator === wallet.address))
  const releasedToMe = mine.flatMap((d) => d.milestones.filter((m: any) => m.status === 'RELEASED').map((m: any) => ({ ...m, deal: d })))
  const earned = releasedToMe.reduce((a, m) => a + m.amountUsdc, 0)
  const inEscrow = mine.reduce((a, d) => a + d.milestones.filter((m: any) => m.status !== 'RELEASED').reduce((x: number, m: any) => x + m.amountUsdc, 0), 0)
  const applicants = role === 'brand' ? deals.filter((d) => d.brand === wallet.address && !d.creator).flatMap((d) => (d.applicants ?? []).map((a: any) => ({ ...a, deal: d }))) : []
  const tabs = role === 'brand' ? [['campaigns', 'Campaigns'], ['applicants', `Applicants${applicants.length ? ` (${applicants.length})` : ''}`], ['spend', 'Spend']] : [['active', 'Active Deals'], ['payouts', 'Payouts']]

  const MilestoneRow = ({ d }: { d: any }) => (
    <div className="flex flex-col gap-2.5">{d.milestones.map((m: any, i: number) => (
      <div key={i}><div className="flex items-center justify-between text-[12px] mb-1"><span className="num" style={{ color: m.status === 'RELEASED' ? C.mint : m.status === 'REACHED_PENDING' ? C.amber : C.muted }}>{m.metric === 'posted' ? 'Delivery' : `${METRIC_LABEL[m.metric]} ≥ ${fmtMetric(m.threshold)}`}</span><span className="num text-txt2">{fmtUSDC(m.amountUsdc, false)}</span></div>{m.metric !== 'posted' && <ProgressBar value={m.status === 'RELEASED' ? 100 : m.status === 'REACHED_PENDING' ? 100 : 4} color={m.status === 'RELEASED' ? 'mint' : 'amber'} height={5} />}</div>
    ))}</div>
  )

  return (
    <div className="max-w-[1320px] mx-auto px-5 py-7">
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <Avatar size={48} glyph={role === 'brand' ? '◆' : undefined} name={wallet.address} hue={role === 'brand' ? C.mint : C.agent} ring />
        <div className="min-w-0"><h1 className="font-display text-[24px] font-semibold tracking-tight flex items-center gap-2 capitalize">{role} <Pill text={role} color={role === 'brand' ? 'mint' : 'agent'} size="sm" dot={false} /></h1><div className="num text-[12.5px] text-txt2">{short(wallet.address)} · Algorand TestNet</div></div>
        <div className="ml-auto flex items-center gap-2.5">
          {role === 'creator' && <Button variant="ghost" icon="user" onClick={() => nav('verify')}>Social verification</Button>}
          <Button variant="ghost" icon="trophy" onClick={() => nav('leaderboard')}>Leaderboard</Button>
          {role === 'brand' ? <Button variant="primary" icon="plus" onClick={() => nav('studio')}>New deal</Button> : <Button variant="primary" icon="browse" onClick={() => nav('browse')}>Browse deals</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {role === 'brand' ? <>
          <StatCard label="In escrow" value={fmtUSDC(inEscrow, false)} sub="locked across deals" color="chain" icon="lock" />
          <StatCard label="Released" value={fmtUSDC(earned, false)} sub={`${releasedToMe.length} tranches paid`} color="mint" icon="coin" />
          <StatCard label="Campaigns" value={mine.length} sub="funded deals" color="txt" icon="studio" />
          <StatCard label="Applicants" value={applicants.length} sub="awaiting review" color="amber" icon="user" />
        </> : <>
          <StatCard label="Total earned" value={fmtUSDC(earned, false)} sub={`${releasedToMe.length} tranches`} color="mint" icon="coin" />
          <StatCard label="Active deals" value={mine.length} sub="bound to you" color="chain" icon="pulse" />
          <StatCard label="ALGO" value={balances.algo.toFixed(2)} sub="gas" color="chain" />
          <StatCard label="USDC" value={balances.usdc.toFixed(2)} sub="balance" color="mint" />
        </>}
      </div>

      <div className="flex items-center gap-1 border-b border-line mb-5 overflow-x-auto">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="px-4 py-2.5 text-[13.5px] whitespace-nowrap relative transition-colors" style={{ color: tab === id ? C.txt : C.txt2 }}>{label}{tab === id && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded" style={{ background: C.mint }} />}</button>
        ))}
      </div>

      {/* CAMPAIGNS / ACTIVE */}
      {(tab === 'campaigns' || tab === 'active') && (
        mine.length === 0 ? (
          <Card className="p-12 text-center"><div className="text-[15px] text-txt">{role === 'brand' ? 'No campaigns yet' : 'No active deals yet'}</div><div className="text-[13px] text-txt2 mt-1">{role === 'brand' ? 'Create + fund a metric-milestone deal.' : 'Browse funded deals to deliver on.'}</div><Button variant="primary" className="mt-4" onClick={() => nav(role === 'brand' ? 'studio' : 'browse')}>{role === 'brand' ? '+ New deal' : 'Browse deals'}</Button></Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">{mine.map((d) => {
            const rel = d.milestones.filter((m: any) => m.status === 'RELEASED').reduce((a: number, m: any) => a + m.amountUsdc, 0)
            const total = d.milestones.reduce((a: number, m: any) => a + m.amountUsdc, 0)
            const pending = d.milestones.find((m: any) => m.status === 'REACHED_PENDING')
            return (
              <Card key={d.id} hover onClick={() => nav('deal', d.id)} className="p-5" glow={pending ? 'amber' : undefined}>
                <div className="flex items-center gap-3 mb-3"><Avatar size={34} name={d.creatorHandle || d.creator || d.brand} hue={role === 'brand' ? C.agent : C.mint} ring /><div className="flex-1 min-w-0"><div className="text-[14px] text-txt font-medium truncate">{d.title}</div><div className="num text-[11.5px] text-txt2">{role === 'brand' ? (d.creator ? `bound ${d.creatorHandle || short(d.creator)}` : 'no creator yet') : `brand ${short(d.brand)}`}</div></div><Pill status={d.status} size="sm" /></div>
                {!d.postUrl && d.creator && <div className="num text-[11.5px] text-amber mb-3">awaiting post submission</div>}
                {d.postUrl && <div className="num text-[11.5px] text-chain truncate mb-3">↳ post submitted ✓</div>}
                <MilestoneRow d={d} />
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-line"><span className="num text-[12px] text-txt2">{fmtUSDC(rel, false)} / {fmtUSDC(total, false)} released</span><span className="num text-[12px] text-chain flex items-center gap-1">open <Icon name="arrow" size={12} c={C.chain} /></span></div>
              </Card>
            )
          })}</div>
        )
      )}

      {/* APPLICANTS (brand) */}
      {tab === 'applicants' && (
        applicants.length === 0 ? <Card className="p-12 text-center text-txt2">No applicants yet. Share your funded deals with creators.</Card> : (
          <div className="flex flex-col gap-3">{applicants.map((a, i) => (
            <Card key={i} hover onClick={() => nav('deal', a.deal.id)} className="p-4 flex items-center gap-4 flex-wrap">
              <Avatar size={42} name={a.handle || a.address} hue={C.agent} ring img={a.avatarUrl} />
              <div className="flex-1 min-w-[220px]"><div className="flex items-center gap-2 flex-wrap"><span className="text-[14px] text-txt font-medium">{a.handle || 'creator'}</span>{a.verified && <Icon name="check" size={12} c={C.mint} sw={3} />}{a.followers && <span className="num text-[11.5px] text-txt2">{fmtMetric(a.followers)} followers</span>}</div><div className="text-[12px] text-mint mt-0.5">applied to · {a.deal.title.slice(0, 40)}</div></div>
              <Button size="sm" variant="primary" iconR="arrow">Review &amp; accept</Button>
            </Card>
          ))}</div>
        )
      )}

      {/* SPEND / PAYOUTS (ledger) */}
      {(tab === 'spend' || tab === 'payouts') && (
        <div>
          <Card className="p-5 mb-4 flex items-center gap-5 flex-wrap" glow="mint">
            <div><div className="text-[12px] uppercase tracking-wide text-txt2">{role === 'brand' ? 'Total released' : 'Total earned'}</div><div className="num text-[34px] font-semibold text-mint leading-tight mt-1">{fmtUSDC(earned, false)}</div></div>
            <div className="ml-auto text-right"><div className="num text-[13px] text-txt">{fmtUSDC(inEscrow, false)} in escrow</div><div className="text-[11.5px] text-txt2">across {mine.length} deal{mine.length !== 1 ? 's' : ''}</div></div>
          </Card>
          {releasedToMe.length === 0 ? <Card className="p-10 text-center text-txt2">No payouts yet.</Card> : (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 text-[11px] uppercase tracking-wide text-txt2 border-b border-line"><span>Milestone</span><span>Amount</span><span>Tx</span></div>
              {releasedToMe.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 items-center border-b border-line/60 last:border-0 hover:bg-white/[0.02]"><span className="text-[13px] text-txt truncate">{m.metric === 'posted' ? 'Delivery' : `${METRIC_LABEL[m.metric]} ≥ ${fmtMetric(m.threshold)}`} <span className="text-muted">· {m.deal.title.slice(0, 24)}</span></span><span className="num text-[13.5px] text-mint">{role === 'brand' ? '−' : '+'}{fmtUSDC(m.amountUsdc, false)}</span><TxLink tx={m.releaseTx} prefix="" label="↗" /></div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
