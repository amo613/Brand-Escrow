import { useEffect, useState } from 'react'
import { api } from './lib/api.ts'
import { connectSocial, devLogin, signChallenge, optInUSDC, getBalances, logoutSocial, type Wallet } from './lib/web3auth.ts'
import { Logo, Pill, Spinner, Modal, Icon, C } from './components/ui.tsx'
import { Landing } from './screens/Landing.tsx'
import { Dashboard } from './screens/Dashboard.tsx'
import { Studio } from './screens/Studio.tsx'
import { DealDetail } from './screens/DealDetail.tsx'
import { Browse } from './screens/Browse.tsx'
import { Console } from './screens/Console.tsx'
import { SocialVerify } from './screens/SocialVerify.tsx'
import { Leaderboard } from './screens/Leaderboard.tsx'

type Phase = 'login' | 'connecting' | 'airdrop' | 'app'
type Role = 'brand' | 'creator'
export type Screen = { name: 'home' | 'browse' | 'studio' | 'deal' | 'console' | 'verify' | 'leaderboard'; id?: string }
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
    // role comes ONLY from the authenticated session — there is no role switcher.
    // Brands see brand things, creators see creator things.
    const items: { k: Screen['name']; label: string }[] = role === 'brand'
      ? [{ k: 'studio', label: 'Brand Studio' }, { k: 'home', label: 'My Campaigns' }, { k: 'leaderboard', label: 'Leaderboard' }]
      : [{ k: 'browse', label: 'Browse Deals' }, { k: 'home', label: 'My Deals' }, { k: 'verify', label: 'Verify @handle' }, { k: 'leaderboard', label: 'Leaderboard' }]
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
          {screen.name === 'deal' && <DealDetail id={screen.id!} wallet={wallet} role={role} onBalances={refreshBal} nav={nav} />}
          {screen.name === 'verify' && <SocialVerify nav={nav} />}
          {screen.name === 'leaderboard' && <Leaderboard />}
          {screen.name === 'console' && <Console />}
        </main>
      </div>
    )
  }

  const busyLogin = phase === 'connecting' || phase === 'airdrop'
  return (
    <>
      <Landing onAuth={social} />

      {/* wallet creation + airdrop animation (overlay) */}
      <Modal open={busyLogin} width={440} label="Signing in">
        <div className="p-7 text-center">
          <div className="mx-auto mb-5 grid place-items-center w-20 h-20"><Spinner size={72} /></div>
          <h3 className="font-display text-[20px] font-semibold tracking-tight">{phase === 'connecting' ? 'Creating your wallet…' : 'Funding your wallet'}</h3>
          {wallet && <p className="num text-[12px] text-txt2 mt-1">{trunc(wallet.address)} · Algorand TestNet</p>}
          {phase === 'airdrop' && (
            <div className="mt-6 flex flex-col gap-2.5 text-left">
              {([['algo', '+1.00 test ALGO', 'Network gas', C.chain], ['optin', 'USDC opt-in', 'ASA ' + (health?.usdcAsa ?? ''), C.agent], ['usdc', '+50.00 test USDC', 'Stablecoin balance', C.mint]] as [string, string, string, string][]).map(([k, a, b, c]) => {
                const done = (drops as any)[k]
                return (
                  <div key={k} className="flex items-center gap-3 px-3.5 py-2.5 rounded-ctl hair transition-all duration-500" style={{ background: done ? c + '12' : 'transparent', opacity: done ? 1 : 0.45 }}>
                    <div className="grid place-items-center w-8 h-8 rounded-md" style={{ background: c + '1c' }}>{done ? <Icon name="check" size={16} c={c} sw={2.6} /> : <span className="inline-block w-3 h-3 rounded-full border-2 border-muted/40 border-t-transparent spin" />}</div>
                    <div className="flex-1"><div className="num text-[13.5px]" style={{ color: done ? C.txt : C.txt2 }}>{a}</div><div className="text-[11.5px] text-muted">{b}</div></div>
                    {done && <span className="num text-[11px]" style={{ color: c }}>✓</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      {err && !busyLogin && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] text-[12.5px] text-coral glass hair rounded-ctl px-4 py-2.5 anim-rise">{err}</div>}
      <DevLogin onLogin={doLogin} />
    </>
  )
}

function DevLogin({ onLogin }: { onLogin: (w: Wallet, r: 'brand' | 'creator') => void }) {
  const [open, setOpen] = useState(false)
  const [mn, setMn] = useState('')
  const [r, setR] = useState<'brand' | 'creator'>('brand')
  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[290px] text-right">
      <button onClick={() => setOpen(!open)} className="num text-[11px] text-muted hover:text-txt2 ml-auto">{open ? '▾' : '▸'} dev login</button>
      {open && (
        <div className="mt-2 glass hair rounded-ctl p-3 flex flex-col gap-2 anim-rise text-left shadow-card">
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
