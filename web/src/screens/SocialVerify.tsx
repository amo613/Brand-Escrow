/* Social verification — connect X / YouTube / TikTok via real OAuth, show verified @handle. */
import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { verifySocial } from '../lib/social.ts'
import { Card, Button, Pill, Avatar, Icon, C } from '../components/ui.tsx'
import type { Screen } from '../App.tsx'

const CARDS = [
  { id: 'x', label: 'X (Twitter)', glyph: '𝕏', c: C.txt, note: 'OAuth 2.0 · PKCE' },
  { id: 'youtube', label: 'YouTube', glyph: '▶', c: C.coral, note: 'via Google' },
  { id: 'tiktok', label: 'TikTok', glyph: '♪', c: C.agent, note: 'Login Kit' },
]

export function SocialVerify({ nav }: { nav: (n: Screen['name'], id?: string) => void }) {
  const [socials, setSocials] = useState<any[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { api.socials().then(setSocials).catch(() => {}) }, [])
  const connect = async (id: string) => {
    setBusy(id); setErr('')
    try { const r = await verifySocial(id as any); if (!r.ok) throw new Error(r.error || 'verification failed'); setSocials(await api.socials()) } catch (e: any) { setErr(e?.message ?? String(e)) }
    setBusy('')
  }
  return (
    <div className="max-w-[920px] mx-auto px-5 py-9">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Verify the account you'll post from</h1>
      <p className="text-txt2 text-[15px] mt-2 max-w-lg text-pretty">Verify the platform you'll deliver on before applying to a deal. We read public metrics to track milestones — we never post on your behalf or see your password.</p>
      {err && <div className="text-[12.5px] text-coral mt-3">{err}</div>}
      <div className="grid sm:grid-cols-3 gap-4 mt-7">
        {CARDS.map((c) => {
          const v = socials.find((s) => s.platform === c.id)
          return (
            <Card key={c.id} className="p-5 flex flex-col" glow={v ? 'mint' : undefined}>
              <div className="flex items-center justify-between mb-4"><div className="grid place-items-center w-11 h-11 rounded-ctl num text-[20px] font-semibold" style={{ background: c.c + '1c', color: c.c }}>{c.glyph}</div>{v && <Pill text="verified" color="mint" size="sm" />}</div>
              <div className="text-[15px] font-medium text-txt">{c.label}</div>
              <div className="text-[11px] text-txt2 mt-0.5">{c.note}</div>
              {v ? (
                <div className="mt-4 pt-4 border-t border-line flex items-center gap-2.5"><Avatar size={32} name={v.handle} hue={c.c} /><div className="leading-tight min-w-0"><div className="num text-[12.5px] text-txt truncate">{v.handle}</div><div className="num text-[11px] text-txt2">verified ✓</div></div></div>
              ) : (
                <Button variant="ghost" full className="mt-auto" onClick={() => connect(c.id)} disabled={!!busy}>{busy === c.id ? 'Opening…' : 'Connect'}</Button>
              )}
            </Card>
          )
        })}
      </div>
      <div className="mt-6 flex justify-end"><Button variant="primary" iconR="arrow" onClick={() => nav('browse')}>Continue to deals</Button></div>
    </div>
  )
}
