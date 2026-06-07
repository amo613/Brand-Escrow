/** Opens the platform OAuth in a popup and resolves with the verified @handle (via postMessage). */
import { api } from './api.ts'

export async function verifySocial(platform: 'x' | 'youtube' | 'tiktok'): Promise<{ ok: boolean; handle?: string; error?: string }> {
  const { url } = await api.socialStart(platform)
  const popup = window.open(url, 'pactpay-social', 'width=600,height=760')
  if (!popup) return { ok: false, error: 'popup blocked — allow popups and retry' }
  return new Promise((resolve) => {
    const done = (r: { ok: boolean; handle?: string; error?: string }) => { window.removeEventListener('message', onMsg); clearInterval(t); resolve(r) }
    const onMsg = (e: MessageEvent) => { if (e.data?.source === 'pactpay-social' && e.data.platform === platform) done({ ok: e.data.ok, handle: e.data.handle, error: e.data.error }) }
    window.addEventListener('message', onMsg)
    const t = setInterval(() => { if (popup.closed) done({ ok: false, error: 'cancelled' }) }, 600)
  })
}
