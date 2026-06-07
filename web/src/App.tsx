import { useEffect, useState } from 'react'
import { api } from './lib/api.ts'
import { connectSocial, devLogin, signChallenge, optInUSDC, getBalances, logoutSocial, type Wallet } from './lib/web3auth.ts'
import { Logo, Pill, Spinner } from './components/ui.tsx'
import { Dashboard } from './screens/Dashboard.tsx'
import { Studio } from './screens/Studio.tsx'
import { DealDetail } from './screens/DealDetail.tsx'
import { Browse } from './screens/Browse.tsx'
import { Console } from './screens/Console.tsx'

type Phase = 'login' | 'connecting' | 'airdrop' | 'app'
type Role = 'brand' | 'creator'
export type Screen = { name: 'home' | 'browse' | 'studio' | 'deal' | 'console'; id?: string }
const trunc = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a)

export default function App() {
  const [phase, setPhase] = useState<Phase>('login')
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [role, setRole] = useState<Role>('creator')
  const [bal, setBal] = useState({ algo: 0, usdc: 0, optedIn: false })
  const [drops, setDrops] = useState({ algo: false, optin: false, usdc: false })
  const [err, setErr] = useState('')
  const [health, setHealth] = useState<any>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const nav = (name: Screen['name'], id?: string) => setScreen({ name, id })

  useEffect(() => { api.health().then(setHealth).catch(() => {}) }, [])

  async function doLogin(w: Wallet, r: Role) {
    setErr(''); setWallet(w); setRole(r); setPhase('connecting')
    try {
      const { message } = await api.challenge(w.address)
      await api.verify(w.address, signChallenge(w, message))
      setPhase('airdrop'); setDrops({ algo: false, optin: false, usdc: false })
      const a1 = await api.airdrop(r); setDrops((d) => ({ ...d, algo: true }))
      if (a1.needsOptIn) { await optInUSDC(w); setDrops((d) => ({ ...d, optin: true })); await api.airdrop(r); setDrops((d) => ({ ...d, usdc: true })) }
      else setDrops({ algo: true, optin: true, usdc: true })
      setBal(await getBalances(w.address)); setScreen({ name: r === 'brand' ? 'studio' : 'browse' })
      setTimeout(() => setPhase('app'), 600)
    } catch (e: any) { setErr(e?.message ?? String(e)); setPhase('login') }
  }
  const social = async (r: Role) => { try { setPhase('connecting'); doLogin(await connectSocial(), r) } catch (e: any) { setErr(e?.message ?? String(e)); setPhase('login') } }
  async function logout() { await logoutSocial(); setWallet(null); setPhase('login'); setBal({ algo: 0, usdc: 0, optedIn: false }) }
  const refreshBal = () => wallet && getBalances(wallet.address).then(setBal)

  if (phase === 'app' && wallet) {
    const isAdmin = health?.admin === wallet.address
    const items: { k: Screen['name']; label: string }[] = [
      { k: 'browse', label: 'Browse Deals' },
      ...(role === 'brand' ? [{ k: 'studio' as const, label: 'Brand Studio' }] : []),
      { k: 'home', label: 'My Deals' },
    ]
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 glass border-b border-line">
          <div className="max-w-[1280px] mx-auto px-5 h-[60px] flex items-center gap-4">
            <button onClick={() => nav('home')}><Logo /></button>
            <nav className="hidden md:flex items-center gap-0.5 ml-2">
              {items.map((n) => (
                <button key={n.k} onClick={() => nav(n.k)} className={`px-3 py-2 rounded-ctl text-[13.5px] ${screen.name === n.k ? 'text-txt bg-white/[0.05]' : 'text-txt2 hover:text-txt'}`}>{n.label}</button>
              ))}
              {isAdmin && <button onClick={() => nav('console')} className={`px-3 py-2 rounded-ctl text-[13.5px] ${screen.name === 'console' ? 'text-agent bg-agent/10' : 'text-agent/80 hover:text-agent'}`}>⚙ Test Console</button>}
            </nav>
            <div className="ml-auto flex items-center gap-2.5">
              <Pill text={role} color="mint" />
              <span className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-ctl hair text-[12.5px] text-txt2"><span className="w-2 h-2 rounded-full bg-chain pulse-dot" /> TestNet</span>
              <div className="flex flex-col items-end leading-tight px-3 py-1.5 rounded-ctl hair"><span className="num text-[12.5px] text-txt">{trunc(wallet.address)}</span><span className="num text-[11px] text-txt2">{bal.algo.toFixed(2)} ALGO · {bal.usdc.toFixed(2)} USDC</span></div>
              <button onClick={logout} className="text-[13px] text-txt2 hover:text-txt px-2">Logout</button>
            </div>
          </div>
        </header>
        <main className="anim-rise">
          {screen.name === 'home' && <Dashboard wallet={wallet} role={role} balances={bal} onBalances={setBal} health={health} nav={nav} />}
          {screen.name === 'browse' && <Browse nav={nav} />}
          {screen.name === 'studio' && <Studio wallet={wallet} nav={nav} onDone={refreshBal} />}
          {screen.name === 'deal' && <DealDetail id={screen.id!} wallet={wallet} role={role} onBalances={refreshBal} />}
          {screen.name === 'console' && <Console />}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid place-items-center px-5">
      <div className="w-full max-w-[460px] anim-rise">
        <div className="flex justify-center mb-6"><Logo size={40} /></div>
        {phase === 'login' && (
          <div className="glass hair rounded-card p-7 shadow-2xl">
            <h1 className="font-display text-[26px] font-semibold text-center tracking-tight">Pay creators when the post performs.</h1>
            <p className="text-txt2 text-[14px] text-center mt-2 mb-6">On-chain escrow on Algorand, released by an AI agent over x402. No seed phrase — we create your wallet.</p>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => social('brand')} className="px-4 py-3 rounded-ctl font-semibold text-ink" style={{ background: 'linear-gradient(120deg,#00E5A8,#34D2FF)' }}>Log in as Brand</button>
              <button onClick={() => social('creator')} className="px-4 py-3 rounded-ctl font-medium text-txt hair bg-white/[0.03] hover:bg-white/[0.06]">Log in as Creator</button>
            </div>
            <div className="flex items-center gap-2 justify-center mt-5 text-[12px] text-muted">🔒 Non-custodial · powered by Web3Auth</div>
            <DevLogin onLogin={doLogin} />
            {err && <div className="text-[12.5px] text-coral mt-4 text-center">{err}</div>}
            {health && <div className="num text-[11px] text-muted mt-4 text-center">backend ✓ · escrowApp {health.escrowApp}</div>}
          </div>
        )}
        {(phase === 'connecting' || phase === 'airdrop') && (
          <div className="glass hair rounded-card p-7 text-center">
            <div className="mx-auto mb-5 grid place-items-center"><Spinner /></div>
            <h3 className="font-display text-[20px] font-semibold">{phase === 'connecting' ? 'Creating your wallet…' : 'Funding your wallet'}</h3>
            {wallet && <p className="num text-[12px] text-txt2 mt-1">{trunc(wallet.address)} · Algorand TestNet</p>}
            {phase === 'airdrop' && (
              <div className="mt-6 flex flex-col gap-2.5 text-left">
                {[['algo', '+5.00 test ALGO', 'Network gas', '#34D2FF'], ['optin', 'USDC opt-in', 'ASA ' + (health?.usdcAsa ?? ''), '#7C5CFF'], ['usdc', '+50.00 test USDC', 'Stablecoin balance', '#00E5A8']].map(([k, a, b, c]) => {
                  const done = (drops as any)[k as string]
                  return (
                    <div key={k as string} className="flex items-center gap-3 px-3.5 py-2.5 rounded-ctl hair" style={{ background: done ? (c as string) + '12' : 'transparent', opacity: done ? 1 : 0.45 }}>
                      <div className="grid place-items-center w-8 h-8 rounded-md" style={{ background: (c as string) + '1c' }}>{done ? <span style={{ color: c as string }}>✓</span> : <span className="inline-block w-3 h-3 rounded-full border-2 border-muted/40 border-t-transparent spin" />}</div>
                      <div className="flex-1"><div className="num text-[13.5px]" style={{ color: done ? '#EDF0F4' : '#9AA4B2' }}>{a}</div><div className="text-[11.5px] text-muted">{b}</div></div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DevLogin({ onLogin }: { onLogin: (w: Wallet, r: 'brand' | 'creator') => void }) {
  const [open, setOpen] = useState(false)
  const [mn, setMn] = useState('')
  const [r, setR] = useState<'brand' | 'creator'>('brand')
  return (
    <div className="mt-5 pt-4 border-t border-line">
      <button onClick={() => setOpen(!open)} className="text-[12px] text-txt2 hover:text-txt">{open ? '▾' : '▸'} Dev login (paste a test mnemonic)</button>
      {open && (
        <div className="mt-2.5 flex flex-col gap-2">
          <textarea value={mn} onChange={(e) => setMn(e.target.value)} rows={2} placeholder="25-word test mnemonic…" className="w-full px-3 py-2 rounded-ctl hair bg-ink/60 text-[12px] num text-txt resize-none" />
          <div className="flex gap-2">
            <select value={r} onChange={(e) => setR(e.target.value as any)} className="px-2 py-1.5 rounded-ctl hair bg-ink/60 text-[12.5px] text-txt"><option value="brand">brand</option><option value="creator">creator</option></select>
            <button onClick={() => { try { onLogin(devLogin(mn), r) } catch (e: any) { alert(e?.message) } }} className="flex-1 px-3 py-1.5 rounded-ctl text-[13px] font-medium text-ink" style={{ background: '#00E5A8' }}>Dev login</button>
          </div>
        </div>
      )}
    </div>
  )
}
