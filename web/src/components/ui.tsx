import type { ReactNode } from 'react'

export const C: Record<string, string> = { mint: '#00E5A8', agent: '#7C5CFF', chain: '#34D2FF', amber: '#FFB020', coral: '#FF5A6E', txt: '#EDF0F4', txt2: '#9AA4B2', muted: '#5C6573' }
const tone = (k?: string) => C[k ?? 'txt2'] ?? C.txt2

export function Logo({ size = 28, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="PactPay">
        <defs><linearGradient id="lg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#00E5A8" /><stop offset="1" stopColor="#7C5CFF" /></linearGradient></defs>
        <rect x="5.5" y="13" width="21" height="16" rx="4.5" stroke="url(#lg)" strokeWidth="2" />
        <path d="M11 13V9.5a5 5 0 0 1 10 0V13" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" />
        <path d="M11.5 21.2l3.1 3.1 6-6.4" stroke="#00E5A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWord && <span className="font-display font-semibold tracking-tight text-[19px] text-txt">PactPay</span>}
    </div>
  )
}

export function Pill({ text, color = 'txt2', pulse }: { text: string; color?: string; pulse?: boolean }) {
  const col = tone(color)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full font-medium px-2.5 py-1 text-[12px]" style={{ color: col, background: col + '14', border: `1px solid ${col}33` }}>
      <span className={`w-1.5 h-1.5 rounded-full ${pulse ? 'pulse-dot' : ''}`} style={{ background: col }} />{text}
    </span>
  )
}

export function Spinner({ size = 64 }: { size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full border-2 border-mint/25 border-t-mint spin" />
      <Logo size={size * 0.46} withWord={false} />
    </div>
  )
}

export function Card({ children, className = '', glow }: { children: ReactNode; className?: string; glow?: string }) {
  return <div className={`glass rounded-card hair ${className}`} style={glow ? { boxShadow: `0 0 0 1px ${tone(glow)}33, 0 0 50px -16px ${tone(glow)}55` } : undefined}>{children}</div>
}

export function Button({ children, onClick, variant = 'primary', disabled, className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'agent'; disabled?: boolean; className?: string }) {
  const styles: Record<string, any> = {
    primary: { background: 'linear-gradient(120deg,#00E5A8,#34D2FF)', color: '#0A0C10' },
    agent: { background: 'linear-gradient(120deg,#7C5CFF,#9B7DFF)', color: '#fff' },
    ghost: {},
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 font-medium rounded-ctl px-4 py-2.5 text-[14px] transition-all disabled:opacity-40 ${variant === 'ghost' ? 'hair bg-white/[0.03] hover:bg-white/[0.06] text-txt' : 'hover:brightness-110 font-semibold'} ${className}`} style={styles[variant]}>{children}</button>
  )
}

export function StatCard({ label, value, sub, color = 'txt' }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[12px] uppercase tracking-wider text-txt2 mb-2">{label}</div>
      <div className="num text-[26px] font-semibold leading-none" style={{ color: tone(color) }}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-1.5">{sub}</div>}
    </Card>
  )
}

export function TxLink({ tx, label, lora }: { tx: string; label?: string; lora: string }) {
  return <a href={`${lora}/transaction/${tx}`} target="_blank" rel="noreferrer" className="num text-chain hover:underline text-[12.5px]">{label ?? `tx ${tx.slice(0, 6)}…`} ↗</a>
}
