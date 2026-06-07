/* Landing — marketing page + animated trust-flow + guardrails + rate lookup. Ported from landing.jsx. */
import { useEffect, useState } from 'react'
import { Card, Pill, ProgressBar, Button, Icon, Logo, C, tone } from '../components/ui.tsx'
import { fmtMetric, fmtUSDC } from '../lib/format.ts'

const USDC_ASA = import.meta.env.VITE_USDC_ASA ?? '10458941'
type Role = 'brand' | 'creator'

function TrustFlow() {
  const [step, setStep] = useState(0)
  const [fill, setFill] = useState(28)
  useEffect(() => { const i = setInterval(() => setStep((s) => (s + 1) % 4), 1900); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (step === 1) setFill(28)
    if (step === 2) { let f = 28; const t = setInterval(() => { f += 9; setFill(Math.min(100, f)); if (f >= 100) clearInterval(t) }, 70); return () => clearInterval(t) }
  }, [step])
  const Node = ({ active, done, color, label, sub, glyph }: any) => (
    <div className="flex items-center gap-3 transition-all duration-500" style={{ opacity: active || done ? 1 : 0.5 }}>
      <div className="grid place-items-center w-11 h-11 rounded-ctl shrink-0 transition-all duration-500" style={{ background: active || done ? color + '1f' : '#14171f', boxShadow: active ? `0 0 0 1px ${color}, 0 0 26px -4px ${color}` : `inset 0 0 0 1px ${C.line}` }}>
        <span style={{ color: active || done ? color : C.muted, fontSize: 19 }}>{glyph}</span>
      </div>
      <div className="leading-snug min-w-0"><div className="text-[13.5px] font-medium" style={{ color: active || done ? C.txt : C.txt2 }}>{label}</div><div className="num text-[11.5px] text-muted mt-0.5">{sub}</div></div>
    </div>
  )
  const connector = (lit: boolean, color: string) => (
    <div className="ml-[21px] my-1 h-7 w-px relative" style={{ background: lit ? color : C.line }}>
      {lit && <span className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}`, animation: 'coinUp 1s linear infinite' }} />}
    </div>
  )
  return (
    <Card className="p-5 relative overflow-hidden" glow="agent">
      <div className="flex items-center justify-between mb-4"><span className="text-[12px] uppercase tracking-wider text-txt2">Trustless settlement</span><Pill text="live" color="agent" size="sm" pulse /></div>
      <Node active={step === 0} done={step > 0} color={C.mint} glyph="◆" label="Brand funds deal" sub="5.00 USDC → escrow" />
      {connector(step >= 1, C.mint)}
      <div className="ml-1 mb-1">
        <Node active={step === 1} done={step > 1} color={C.amber} glyph="▲" label="Creator posts · agent tracks metric" sub={`${fmtMetric(Math.round(7382 * fill))} likes`} />
        <div className="ml-[56px] mt-2 mb-1"><ProgressBar value={step >= 1 ? fill : 0} color="amber" height={6} animate={false} /></div>
      </div>
      {connector(step >= 2, C.chain)}
      <Node active={step === 2} done={step > 2} color={C.chain} glyph="⬡" label="AI agent pays x402 for proof" sub="0.01 USDC · verdict PASS" />
      {connector(step >= 3, C.mint)}
      <Node active={step === 3} color={C.mint} glyph="✦" label="Contract releases tranche" sub="→ creator paid · on-chain ✓" />
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,92,255,.25), transparent 70%)' }} />
    </Card>
  )
}

const GUARDS = [
  { t: 'Recipient-bound', d: 'Pays only the creator wallet bound at funding. No one else, ever.', icon: 'user' },
  { t: 'Amount-bound', d: "The exact tranche amount. Can't overpay, can't round up.", icon: 'coin' },
  { t: 'Metric ≥ threshold', d: 'The contract re-reads the on-chain metric before paying.', icon: 'pulse' },
  { t: 'Oracle-only attestation', d: 'Only the signed oracle can attest a verdict on-chain.', icon: 'shield' },
  { t: 'Timelock challenge window', d: 'A dispute window must elapse before funds move.', icon: 'clock' },
  { t: 'Refund-on-deadline', d: 'Unreached tranches return to the brand after the deadline.', icon: 'refresh' },
]

function GuardrailSection() {
  return (
    <section className="max-w-[1320px] mx-auto px-5 py-20">
      <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-12 items-center">
        <div>
          <Pill text="The guardrail" color="agent" />
          <h2 className="font-display text-[clamp(30px,4vw,46px)] font-semibold tracking-tight mt-4 leading-[1.04] text-balance">The AI can be wrong.<br /><span style={{ color: C.agent }}>The contract can't.</span></h2>
          <p className="text-txt2 text-[16px] mt-4 max-w-md text-pretty leading-relaxed">We box the agent inside the contract's rules. It re-checks the metric on-chain and can only pay the bound creator, the exact amount, once, after a challenge window.</p>
          <div className="mt-7 relative rounded-card p-5 hair" style={{ background: 'linear-gradient(180deg, rgba(124,92,255,.06), transparent)' }}>
            <div className="text-[11px] uppercase tracking-wider text-mint mb-3 flex items-center gap-2"><Icon name="lock" size={13} c={C.mint} /> Smart-contract perimeter</div>
            <div className="rounded-ctl p-4 grid place-items-center text-center" style={{ background: 'rgba(124,92,255,.08)', border: `1px dashed ${C.agent}66` }}>
              <Icon name="spark" size={22} c={C.agent} /><div className="text-[14px] font-medium text-txt mt-2">Autonomous AI agent</div><div className="text-[12px] text-txt2 mt-1">judges proof · proposes verdicts</div>
            </div>
            <div className="num text-[11.5px] text-muted mt-3 text-center">↑ can <span className="text-txt2">propose</span> — can never <span className="text-coral">move funds</span> on its own</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3.5">
          {GUARDS.map((g, i) => (
            <Card key={i} className="p-4 anim-rise" style={{ animationDelay: `${i * 60}ms` }} hover>
              <div className="flex items-start gap-3">
                <div className="grid place-items-center w-9 h-9 rounded-ctl shrink-0" style={{ background: C.mint + '14' }}><Icon name={g.icon} size={17} c={C.mint} /></div>
                <div><div className="text-[14px] font-medium text-txt flex items-center gap-1.5">{g.t} <Icon name="check" size={13} c={C.mint} sw={2.6} /></div><div className="text-[12.5px] text-txt2 mt-1 text-pretty leading-snug">{g.d}</div></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function RateLookup() {
  const [handle, setHandle] = useState('')
  const [res, setRes] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const lookup = () => {
    const h = handle.trim().replace(/^@/, '') || 'creator'
    setLoading(true); setRes(null)
    setTimeout(() => {
      const seed = [...h].reduce((a, c) => a + c.charCodeAt(0), 0)
      const followers = 40000 + (seed * 977) % 1400000
      const eng = 2.8 + (seed % 40) / 10
      const rate = Math.max(0.5, +((followers / 1e6) * 4.2 * (eng / 4)).toFixed(2))
      setLoading(false); setRes({ h, followers, eng, rate, views: Math.round(followers * (1.6 + (seed % 10) / 10)) })
    }, 850)
  }
  return (
    <Card className="p-6 sm:p-8" glow="chain">
      <div className="flex items-center gap-2 mb-1"><Icon name="search" size={16} c={C.chain} /><span className="text-[12px] uppercase tracking-wider text-txt2">Creator rate lookup</span></div>
      <h3 className="font-display text-[24px] font-semibold tracking-tight">Estimate a fair deal rate</h3>
      <p className="text-txt2 text-[14px] mt-1.5">Drop a handle — we pull mock metrics and suggest a fair tranche budget.</p>
      <div className="flex gap-2.5 mt-5">
        <div className="flex-1 flex items-center gap-2 px-3.5 rounded-ctl hair bg-ink/60 focus-within:border-chain/50 transition-colors">
          <span className="num text-muted">@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="maxfit" className="bg-transparent flex-1 py-3 text-[14px] text-txt placeholder:text-muted num" />
        </div>
        <Button variant="chain" onClick={lookup} icon="bolt">Look up</Button>
      </div>
      {loading && <div className="mt-5 grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-16 rounded-ctl" />)}</div>}
      {res && !loading && (
        <div className="mt-5 anim-rise">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[['Followers', fmtMetric(res.followers), 'chain'], ['Avg views', fmtMetric(res.views), 'txt'], ['Engagement', res.eng.toFixed(1) + '%', 'amber'], ['Suggested', fmtUSDC(res.rate, false), 'mint']].map(([l, v, c], i) => (
              <div key={i} className="rounded-ctl p-3 hair bg-ink/40"><div className="text-[11px] text-txt2 uppercase tracking-wide">{l}</div><div className="num text-[19px] font-semibold mt-1" style={{ color: tone(c as string) }}>{v}</div></div>
            ))}
          </div>
          <div className="num text-[12px] text-muted mt-3">@{res.h} · suggested total escrow across 4 tranches · powered by Apify metrics</div>
        </div>
      )}
    </Card>
  )
}

export function Landing({ onAuth }: { onAuth: (role: Role) => void }) {
  const steps = [
    { n: '01', t: 'Fund a deal', d: 'Brand locks USDC in an Algorand smart contract. Money is escrowed, not sent.', c: C.mint, icon: 'coin' },
    { n: '02', t: 'Creator posts', d: 'Creator delivers content with the required #tag, @mention and link.', c: C.amber, icon: 'studio' },
    { n: '03', t: 'AI verifies', d: 'The agent pays x402 for cryptographic proof and judges the metric.', c: C.chain, icon: 'spark' },
    { n: '04', t: 'Contract releases', d: 'Each milestone auto-releases its tranche — on-chain, irreversibly.', c: C.agent, icon: 'check' },
  ]
  return (
    <div>
      <div className="sticky top-0 z-50 glass border-b border-line">
        <div className="max-w-[1320px] mx-auto px-5 h-[60px] flex items-center">
          <Logo />
          <nav className="hidden md:flex items-center gap-7 ml-auto mr-7 text-[14px] text-txt2">
            <a className="hover:text-txt transition-colors cursor-pointer" onClick={() => onAuth('creator')}>Browse</a>
            <a className="hover:text-txt transition-colors cursor-pointer" href="#how">How it works</a>
            <a className="hover:text-txt transition-colors cursor-pointer" href="#guardrail">Guardrail</a>
            <a className="hover:text-txt transition-colors cursor-pointer" href="#lookup">Rate lookup</a>
          </nav>
          <Button variant="ghost" size="sm" onClick={() => onAuth('creator')}>Sign in</Button>
        </div>
      </div>

      <section className="max-w-[1320px] mx-auto px-5 pt-16 pb-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full hair bg-white/[0.02] text-[12.5px] text-txt2 mb-6 anim-rise"><span className="w-1.5 h-1.5 rounded-full bg-mint pulse-dot" /> Algorand TestNet · x402 · USDC</div>
          <h1 className="font-display font-semibold tracking-tight leading-[0.98] text-balance anim-rise" style={{ fontSize: 'clamp(40px,6.2vw,72px)', animationDelay: '60ms' }}>
            Pay creators when<br />the post <span style={{ background: 'linear-gradient(120deg,#00E5A8,#34D2FF)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>performs.</span><br />Trustlessly.
          </h1>
          <p className="text-txt2 text-[17px] mt-6 max-w-lg leading-relaxed text-pretty anim-rise" style={{ animationDelay: '120ms' }}>On-chain escrow that releases USDC as your campaign hits real metrics — verified by an AI agent, enforced by an Algorand smart contract.</p>
          <div className="flex flex-wrap gap-3 mt-8 anim-rise" style={{ animationDelay: '180ms' }}>
            <Button size="lg" variant="primary" iconR="arrow" onClick={() => onAuth('brand')}>Launch a deal</Button>
            <Button size="lg" variant="ghost" onClick={() => onAuth('creator')}>I'm a creator</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 mt-12 pt-7 border-t border-line anim-rise" style={{ animationDelay: '240ms' }}>
            {[['$128,400', 'escrowed'], ['412', 'deals settled'], ['1.2M', 'USDC paid out'], ['99.4%', 'auto-released']].map(([v, l], i) => (
              <div key={i}><div className="num text-[22px] font-semibold" style={{ color: i === 3 ? C.mint : C.txt }}>{v}</div><div className="text-[12.5px] text-txt2 mt-0.5">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="anim-rise" style={{ animationDelay: '160ms' }}><TrustFlow /></div>
      </section>

      <section id="how" className="max-w-[1320px] mx-auto px-5 py-16">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
          <h2 className="font-display text-[clamp(26px,3.5vw,40px)] font-semibold tracking-tight">How it works</h2>
          <p className="text-txt2 text-[14px] max-w-sm text-pretty">Four steps from brief to payout. No invoices, no chasing, no trust required.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <Card key={i} className="p-5 anim-rise relative overflow-hidden" style={{ animationDelay: `${i * 70}ms` }} hover>
              <div className="num text-[13px]" style={{ color: s.c }}>{s.n}</div>
              <div className="grid place-items-center w-11 h-11 rounded-ctl mt-3 mb-4" style={{ background: s.c + '16' }}><Icon name={s.icon} size={20} c={s.c} /></div>
              <div className="text-[16px] font-medium text-txt">{s.t}</div>
              <div className="text-[13px] text-txt2 mt-1.5 text-pretty leading-snug">{s.d}</div>
              {i < 3 && <Icon name="arrow" size={16} c={C.muted} className="hidden lg:block absolute -right-2 top-1/2" />}
            </Card>
          ))}
        </div>
      </section>

      <div id="guardrail"><GuardrailSection /></div>
      <section id="lookup" className="max-w-[1320px] mx-auto px-5 py-16"><RateLookup /></section>

      <footer className="border-t border-line mt-8">
        <div className="max-w-[1320px] mx-auto px-5 py-12 grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8">
          <div>
            <Logo /><p className="text-txt2 text-[13px] mt-3 max-w-xs text-pretty">The first creator marketplace where an autonomous agent moves real money — safely.</p>
            <div className="num text-[12px] text-muted mt-4">USDC ASA {USDC_ASA} · Algorand TestNet</div>
          </div>
          {([['Product', ['Browse deals', 'Brand Studio', 'Leaderboard', 'Rate lookup']], ['Protocol', ['Smart contract', 'x402 payments', 'Oracle attestation', 'Lora explorer']], ['Company', ['About', 'Docs', 'Security', 'Careers']]] as [string, string[]][]).map(([h, items], i) => (
            <div key={i}><div className="text-[13px] text-txt font-medium mb-3">{h}</div>{items.map((it, j) => <div key={j} className="text-[13px] text-txt2 hover:text-txt cursor-pointer py-1 transition-colors">{it}</div>)}</div>
          ))}
        </div>
        <div className="max-w-[1320px] mx-auto px-5 py-5 border-t border-line text-[12.5px] text-muted flex flex-wrap gap-2 justify-between"><span>© 2026 LockPay Labs · TestNet demo</span><span className="num">Built on Algorand × x402</span></div>
      </footer>
    </div>
  )
}
