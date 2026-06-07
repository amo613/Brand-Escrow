/** Formatting helpers + status map — ported from the design prototype (data.jsx). */
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtMetric = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'k' : String(Math.round(n)))
export const fmtUSDC = (n: number, sign = true) => `${sign ? '$' : ''}${(n ?? 0).toFixed(2)}`
export const fmtCountdown = (secs: number) => {
  const s = Math.max(0, Math.round(secs))
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return `${s}s`
}

export type StatusKey = 'DRAFT' | 'FUNDED' | 'ACCEPTED' | 'TRACKING' | 'PENDING' | 'REACHED_PENDING' | 'PARTIALLY_RELEASED' | 'RELEASED' | 'DISPUTED' | 'REFUNDED'
export const STATUS: Record<string, { label: string; color: string; pulse?: boolean }> = {
  DRAFT: { label: 'Draft', color: 'muted' },
  FUNDED: { label: 'Funded', color: 'chain' },
  ACCEPTED: { label: 'Accepted', color: 'txt2' },
  TRACKING: { label: 'Tracking', color: 'amber', pulse: true },
  PENDING: { label: 'Pending', color: 'muted' },
  REACHED_PENDING: { label: 'Reached · timelock', color: 'amber', pulse: true },
  PARTIALLY_RELEASED: { label: 'Partially released', color: 'mint' },
  RELEASED: { label: 'Released', color: 'mint' },
  DISPUTED: { label: 'Disputed', color: 'coral' },
  REFUNDED: { label: 'Refunded', color: 'muted' },
}

export function fireConfetti(x?: number, y?: number) {
  const f = (window as any).fireConfetti
  if (f) f(x ?? window.innerWidth / 2, y ?? window.innerHeight * 0.4)
}
