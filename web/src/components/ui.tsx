/* PactPay UI primitives — ported 1:1 from the design prototype (js/ui.jsx). */
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { loraTx } from '../lib/api.ts'
import { fmtInt, fmtCountdown, STATUS } from '../lib/format.ts'

export const C = { mint: '#00E5A8', mint2: '#00C794', agent: '#7C5CFF', chain: '#34D2FF', amber: '#FFB020', coral: '#FF5A6E', txt: '#EDF0F4', txt2: '#9AA4B2', muted: '#5C6573', line: '#242A35', panel: '#12151B', panel2: '#181C24' }
export const tone = (k?: string) => (({ mint: C.mint, mint2: C.mint2, agent: C.agent, chain: C.chain, amber: C.amber, coral: C.coral, txt: C.txt, txt2: C.txt2, muted: C.muted } as Record<string, string>)[k ?? ''] || C.txt2)

export function Logo({ size = 28, withWord = true }: { size?: number; withWord?: boolean }) {
  const id = useMemo(() => 'lg' + Math.random().toString(36).slice(2, 7), [])
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="PactPay">
        <defs><linearGradient id={id} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#00E5A8" /><stop offset="1" stopColor="#7C5CFF" /></linearGradient></defs>
        <rect x="5.5" y="13" width="21" height="16" rx="4.5" stroke={`url(#${id})`} strokeWidth="2" />
        <path d="M11 13V9.5a5 5 0 0 1 10 0V13" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
        <path d="M11.5 21.2l3.1 3.1 6-6.4" stroke="#00E5A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWord && <span className="font-display font-semibold tracking-tight text-[19px] text-txt">PactPay</span>}
    </div>
  )
}

const ICONS: Record<string, string> = {
  browse: 'M4 6h16M4 12h16M4 18h10', studio: 'M4 19V5l7 5 7-5v14M4 19h14', deals: 'M5 4h11l3 3v13H5z M14 4v4h4',
  trophy: 'M7 4h10v3a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 18h6M12 12v6',
  bolt: 'M13 3L4 14h7l-1 7 9-11h-7z', check: 'M5 12l4 4 10-10', x: 'M6 6l12 12M18 6L6 18', arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowL: 'M19 12H5M11 18l-6-6 6-6', ext: 'M14 5h5v5M19 5l-8 8M19 13v6H5V5h6', copy: 'M9 9h10v10H9zM5 15V5h10', plus: 'M12 5v14M5 12h14',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5z', shield: 'M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z',
  wallet: 'M3 7h15v11H3zM18 10h3v5h-3a2.5 2.5 0 0 1 0-5z', clock: 'M12 7v5l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0', pulse: 'M3 12h4l2-6 4 12 2-6h6',
  spark: 'M12 3l2 6 6 1-4.5 4 1.3 6L12 17l-5.8 3 1.3-6L3 10l6-1z', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0', refresh: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M18 4v5h-5M6 20v-5h5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4', coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4', settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
}
export function Icon({ name, size = 18, c = 'currentColor', sw = 1.8, className = '', style }: { name: string; size?: number; c?: string; sw?: number; className?: string; style?: CSSProperties }) {
  const d = ICONS[name] ?? ICONS.check
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  )
}

export function Platform({ p, size = 16, c = C.txt2 }: { p: string; size?: number; c?: string }) {
  const m: Record<string, string> = { x: '𝕏', tiktok: 'TT', youtube: 'YT' }
  return <span className="num font-semibold" style={{ fontSize: size * 0.72, color: c, letterSpacing: '-.5px' }}>{m[p] || p}</span>
}

type BtnVariant = 'primary' | 'agent' | 'ghost' | 'soft' | 'danger' | 'chain'
export function Button({ children, variant = 'primary', size = 'md', icon, iconR, onClick, disabled, className = '', type = 'button', full }: { children?: ReactNode; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: string; iconR?: string; onClick?: () => void; disabled?: boolean; className?: string; type?: 'button' | 'submit'; full?: boolean }) {
  const sizes = { sm: 'text-[13px] px-3 py-1.5 gap-1.5', md: 'text-[14px] px-4 py-2.5 gap-2', lg: 'text-[15px] px-5 py-3 gap-2' }
  const base = 'inline-flex items-center justify-center whitespace-nowrap font-medium rounded-ctl transition-all duration-200 focusring active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none'
  const variants: Record<BtnVariant, string> = {
    primary: 'text-ink font-semibold shadow-[0_8px_30px_-10px_rgba(0,229,168,.6)] hover:brightness-110',
    agent: 'text-white font-semibold hover:brightness-110', ghost: 'text-txt hair bg-white/[0.02] hover:bg-white/[0.05]',
    soft: 'text-txt2 hover:text-txt bg-white/[0.03] hover:bg-white/[0.06]', danger: 'text-coral hair border-coral/40 bg-coral/5 hover:bg-coral/10',
    chain: 'text-ink font-semibold hover:brightness-110',
  }
  const bg: CSSProperties = variant === 'primary' ? { background: 'linear-gradient(120deg,#00E5A8,#34D2FF)' } : variant === 'agent' ? { background: 'linear-gradient(120deg,#7C5CFF,#9B7DFF)' } : variant === 'chain' ? { background: C.chain } : {}
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`} style={bg}>
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} sw={2} />}{children}{iconR && <Icon name={iconR} size={size === 'lg' ? 18 : 16} sw={2} />}
    </button>
  )
}

export function Pill({ status, text, color, size = 'md', dot = true, pulse }: { status?: string; text?: string; color?: string; size?: 'sm' | 'md'; dot?: boolean; pulse?: boolean }) {
  const meta = status ? STATUS[status] : null
  const col = tone(color || (meta ? meta.color : 'txt2'))
  const label = text || (meta ? meta.label : status)
  const isPulse = pulse || (meta && meta.pulse)
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${pad}`} style={{ color: col, background: col + '14', border: `1px solid ${col}33` }}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${isPulse ? 'pulse-dot' : ''}`} style={{ background: col }} />}{label}
    </span>
  )
}

export function ProgressBar({ value, color = 'mint', height = 8, glow = true, animate = true, track = '#0d1016' }: { value: number; color?: string; height?: number; glow?: boolean; animate?: boolean; track?: string }) {
  const col = tone(color)
  const [w, setW] = useState(animate ? 0 : value)
  useEffect(() => { const t = setTimeout(() => setW(value), 60); return () => clearTimeout(t) }, [value])
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: track, border: '1px solid rgba(255,255,255,.04)' }}>
      <div className="h-full rounded-full transition-all duration-[1100ms] ease-[cubic-bezier(.2,.7,.3,1)]" style={{ width: `${Math.min(100, w)}%`, background: `linear-gradient(90deg, ${col}, ${col}cc)`, boxShadow: glow ? `0 0 12px ${col}99` : 'none' }} />
    </div>
  )
}

export function CountUp({ value, fmt = (v: number) => fmtInt(Math.round(v)), dur = 900, className = '', style }: { value: number; fmt?: (v: number) => string; dur?: number; className?: string; style?: CSSProperties }) {
  const [v, setV] = useState(value); const prev = useRef(value)
  useEffect(() => {
    const from = prev.current, to = value, start = performance.now(); let raf = 0
    const step = (now: number) => { const p = Math.min(1, (now - start) / dur); setV(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); else prev.current = to }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={className} style={style}>{fmt(v)}</span>
}

export function TimelockRing({ endsAt, total, size = 64, stroke = 5, label = true }: { endsAt: number; total: number; size?: number; stroke?: number; label?: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i) }, [])
  const remain = Math.max(0, (endsAt - now) / 1000); const p = total ? remain / total : 0
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1c2230" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={C.amber} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} style={{ transition: 'stroke-dashoffset .3s linear', filter: `drop-shadow(0 0 5px ${C.amber}aa)` }} />
      </svg>
      {label && <div className="absolute inset-0 grid place-items-center"><div className="num font-semibold text-amber" style={{ fontSize: size * 0.21 }}>{fmtCountdown(remain)}</div></div>}
    </div>
  )
}

export function Avatar({ name, glyph, hue = C.agent, size = 36, ring, img }: { name?: string; glyph?: string; hue?: string; size?: number; ring?: boolean; img?: string }) {
  const [broke, setBroke] = useState(false)
  const init = glyph || (name ? name.replace(/^@/, '').slice(0, 2).toUpperCase() : '??')
  return (
    <div className="grid place-items-center rounded-full font-display font-semibold shrink-0 overflow-hidden" style={{ width: size, height: size, fontSize: size * 0.4, color: '#0A0C10', background: `linear-gradient(135deg, ${hue}, ${hue}99)`, boxShadow: ring ? `0 0 0 2px var(--ink), 0 0 0 3px ${hue}66` : 'none' }}>
      {img && !broke ? <img src={img} alt="" width={size} height={size} className="w-full h-full object-cover" onError={() => setBroke(true)} /> : init}
    </div>
  )
}

export function DataRow({ label, children, mono = true, sub }: { label: string; children: ReactNode; mono?: boolean; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line/60 last:border-0">
      <span className="text-[13px] text-txt2">{label}</span>
      <span className={`text-[13.5px] text-txt text-right ${mono ? 'num' : ''}`}>{children}{sub && <span className="text-muted ml-1">{sub}</span>}</span>
    </div>
  )
}

export function StatCard({ label, value, sub, color = 'txt', icon }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; icon?: string }) {
  return (
    <div className="glass hair rounded-card p-4 anim-rise">
      <div className="flex items-center justify-between mb-2"><span className="text-[12px] uppercase tracking-wider text-txt2">{label}</span>{icon && <Icon name={icon} size={15} c={tone(color)} />}</div>
      <div className="num text-[26px] font-semibold leading-none" style={{ color: tone(color) }}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-1.5">{sub}</div>}
    </div>
  )
}

export function Card({ children, className = '', glow, hover, onClick, style }: { children: ReactNode; className?: string; glow?: string; hover?: boolean; onClick?: () => void; style?: CSSProperties }) {
  return (
    <div onClick={onClick} className={`glass rounded-card hair shadow-card ${hover ? 'transition-all duration-300 hover:border-white/15 hover:-translate-y-0.5 cursor-pointer' : ''} ${className}`} style={{ ...(glow ? { boxShadow: `0 0 0 1px ${tone(glow)}33, 0 0 50px -16px ${tone(glow)}55` } : {}), ...style }}>{children}</div>
  )
}

export function Modal({ open, onClose, children, width = 520, label }: { open: boolean; onClose?: () => void; children: ReactNode; width?: number; label?: string }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center p-4 anim-fade" style={{ background: 'rgba(5,7,10,.7)', backdropFilter: 'blur(6px)' }} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="glass hair rounded-card shadow-card w-full anim-scale relative" style={{ maxWidth: width }} role="dialog" aria-label={label}>{children}</div>
    </div>
  )
}

export function Sparkline({ data, color = 'mint', w = 88, h = 28, fill = true }: { data: number[]; color?: string; w?: number; h?: number; fill?: boolean }) {
  const col = tone(color); const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - ((d - min) / (max - min || 1)) * (h - 4) - 2])
  const line = pts.map((p) => p.join(',')).join(' ')
  const id = useMemo(() => 'sp' + Math.random().toString(36).slice(2, 7), [])
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.35" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      {fill && <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />}
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function TxLink({ tx, label, prefix = 'tx', className = '', lora }: { tx?: string; label?: string; prefix?: string; className?: string; lora?: string }) {
  if (!tx) return null
  return (
    <a href={lora ? `${lora}/transaction/${tx}` : loraTx(tx)} target="_blank" rel="noreferrer" className={`num inline-flex items-center gap-1 text-chain hover:underline decoration-chain/40 ${className}`} style={{ fontSize: '12.5px' }} onClick={(e) => e.stopPropagation()}>
      {label || `${prefix} ${tx.slice(0, 6)}…`} <Icon name="ext" size={11} c={C.chain} sw={2} />
    </a>
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

/* confetti — mint/cyan/violet burst on the #confetti-canvas (set up once) */
;(function setupConfetti() {
  if (typeof window === 'undefined' || (window as any).fireConfetti) return
  const canvas = document.getElementById('confetti-canvas') as HTMLCanvasElement | null
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  let parts: any[] = [], raf: number | null = null
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight }
  resize(); addEventListener('resize', resize)
  const colors = ['#00E5A8', '#34D2FF', '#7C5CFF', '#EDF0F4']
  ;(window as any).fireConfetti = (x = innerWidth * 0.62, y = innerHeight * 0.4) => {
    for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, g: 0.22 + Math.random() * 0.1, s: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length], life: 1, shape: Math.random() > 0.5 ? 'r' : 'c' }) }
    if (!raf) loop()
  }
  function loop() {
    ctx.clearRect(0, 0, canvas!.width, canvas!.height)
    parts.forEach((p) => { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.011; ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; if (p.shape === 'r') ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6); else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill() } ctx.restore() })
    parts = parts.filter((p) => p.life > 0 && p.y < canvas!.height + 40)
    if (parts.length) raf = requestAnimationFrame(loop); else { raf = null; ctx.clearRect(0, 0, canvas!.width, canvas!.height) }
  }
})()
