import { useEffect, useState } from 'react'
import { api, LORA } from '../lib/api.ts'
import { getBalances, type Wallet } from '../lib/web3auth.ts'
import { Card, Button, StatCard, Pill } from '../components/ui.tsx'
import type { Screen } from '../App.tsx'

export function Dashboard({ wallet, role, balances, onBalances, health, nav }: { wallet: Wallet; role: 'brand' | 'creator'; balances: any; onBalances: (b: any) => void; health: any; nav: (n: Screen['name'], id?: string) => void }) {
  const [deals, setDeals] = useState<any[]>([])
  const refresh = () => { api.deals().then(setDeals).catch(() => {}); getBalances(wallet.address).then(onBalances) }
  useEffect(refresh, [])
  const mine = deals.filter((d) => d.brand === wallet.address || d.creator === wallet.address)

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-7">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Welcome, {role}.</h1>
      <p className="text-txt2 text-[14px] mt-1">Non-custodial Algorand wallet, funded and ready. Escrow enforced on-chain; payouts released by the AI agent over x402.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6">
        <StatCard label="ALGO" value={balances.algo.toFixed(2)} sub="gas" color="chain" />
        <StatCard label="USDC" value={balances.usdc.toFixed(2)} sub="stablecoin" color="mint" />
        <StatCard label="Escrow App" value={health?.escrowApp ?? '…'} sub="Algorand TestNet" />
        <StatCard label="Network" value={<span className="text-mint">TestNet</span>} sub="x402 · USDC" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 mt-5 items-start">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-medium text-txt">{role === 'brand' ? 'Your campaigns' : 'Your deals'}</h2>
            <div className="flex gap-2"><Button variant="ghost" onClick={refresh}>Refresh</Button>{role === 'brand' && <Button onClick={() => nav('studio')}>+ New deal</Button>}</div>
          </div>
          {mine.length === 0 ? (
            <div className="text-center py-10"><div className="text-[14px] text-txt">Nothing here yet</div><div className="text-[13px] text-txt2 mt-1">{role === 'brand' ? 'Create + fund a metric-milestone deal.' : 'Browse funded deals to deliver on.'}</div><Button className="mt-4" onClick={() => nav(role === 'brand' ? 'studio' : 'browse')}>{role === 'brand' ? '+ New deal' : 'Browse deals'}</Button></div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {mine.map((d) => (
                <div key={d.id} onClick={() => nav('deal', d.id)} className="flex items-center gap-3 p-3 rounded-ctl hair cursor-pointer hover:bg-white/[0.02]">
                  <div className="flex-1 min-w-0"><div className="text-[14px] text-txt truncate">{d.title}</div><div className="num text-[11.5px] text-txt2">{d.platform} · {d.milestones.length} milestones</div></div>
                  <Pill text={d.status} color={d.status === 'RELEASED' ? 'mint' : d.status === 'TRACKING' ? 'amber' : 'chain'} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5" glow="agent">
          <div className="text-[12px] uppercase tracking-wider text-txt2 mb-3">How payouts work</div>
          <ol className="flex flex-col gap-2.5 text-[13px] text-txt2">
            <li><span className="num text-mint">1</span> Brand funds USDC into the Algorand smart contract.</li>
            <li><span className="num text-amber">2</span> Creator posts; we track the metric.</li>
            <li><span className="num text-chain">3</span> AI agent pays x402 for the proof + verifies it.</li>
            <li><span className="num text-agent">4</span> The contract releases each tranche — recipient & amount bound on-chain.</li>
          </ol>
          <a href={`${LORA}/application/${health?.escrowApp ?? ''}`} target="_blank" rel="noreferrer" className="num text-[12.5px] text-chain hover:underline mt-4 inline-block">View EscrowApp on Lora ↗</a>
        </Card>
      </div>
    </div>
  )
}
