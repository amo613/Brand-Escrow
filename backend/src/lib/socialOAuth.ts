/** Social-account VERIFICATION (separate from Web3Auth login) — direct per-platform OAuth
 *  (X PKCE · YouTube/Google · TikTok) that proves the creator's @handle and stores it in
 *  SocialAccount with AES-256-GCM-encrypted tokens. State is a short-lived signed JWT (carries
 *  the wallet + PKCE verifier) so the callback is stateless. The callback returns a tiny HTML
 *  page that postMessages the result to the opener window and closes the popup. */
import type { Hono, Context } from 'hono'
import { createHash, randomBytes, createCipheriv } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import * as repo from './repo.ts'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me')
const AES_KEY = createHash('sha256').update(process.env.ENCRYPTION_KEY || 'pactpay-dev-key').digest() // always 32 bytes
const WEB = process.env.WEB_ORIGIN || '*'

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function pkce() { const verifier = b64url(randomBytes(32)); return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) } }
function enc(plain?: string): string | undefined {
  if (!plain) return undefined
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', AES_KEY, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}
const signState = (p: Record<string, unknown>) => new SignJWT(p).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(SECRET)
const verifyState = async (t: string) => (await jwtVerify(t, SECRET)).payload as any

interface PlatformCfg {
  authUrl: string; tokenUrl: string; scope: string
  clientId?: string; clientSecret?: string; redirect?: string
  pkce?: boolean; basicAuth?: boolean; clientKeyParam?: boolean; extraAuth?: Record<string, string>
  userinfo: (token: string) => Promise<{ handle?: string; id?: string; followers?: number; avatar?: string }>
}

const CFG: Record<string, PlatformCfg> = {
  x: {
    authUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read users.read', clientId: process.env.X_CLIENT_ID, clientSecret: process.env.X_CLIENT_SECRET, redirect: process.env.X_REDIRECT_URI,
    pkce: true, basicAuth: true,
    userinfo: async (t) => { const j: any = await (await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url', { headers: { Authorization: `Bearer ${t}` } })).json(); return { handle: j.data?.username ? '@' + j.data.username : undefined, id: j.data?.id, followers: j.data?.public_metrics?.followers_count, avatar: j.data?.profile_image_url?.replace('_normal', '') } },
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile', clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirect: process.env.GOOGLE_REDIRECT_URI,
    extraAuth: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    userinfo: async (t) => {
      const j: any = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', { headers: { Authorization: `Bearer ${t}` } })).json()
      const it = j.items?.[0]
      if (it) return { handle: it.snippet?.customUrl || it.snippet?.title, id: it.id, followers: +it.statistics?.subscriberCount || undefined, avatar: it.snippet?.thumbnails?.default?.url }
      // account has no YouTube channel → fall back to the Google profile name + picture
      const u: any = await (await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${t}` } })).json()
      return { handle: u?.name ? '@' + String(u.name).replace(/\s+/g, '') : undefined, id: u?.id, avatar: u?.picture }
    },
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic', clientId: process.env.TIKTOK_CLIENT_KEY, clientSecret: process.env.TIKTOK_CLIENT_SECRET, redirect: process.env.TIKTOK_REDIRECT_URI,
    clientKeyParam: true,
    // user.info.basic returns display_name/avatar/open_id (follower_count needs user.info.profile → may be null)
    userinfo: async (t) => { const j: any = await (await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count', { headers: { Authorization: `Bearer ${t}` } })).json(); const u = j.data?.user; return { handle: u?.display_name, id: u?.open_id, followers: u?.follower_count, avatar: u?.avatar_url } },
  },
}

function resultPage(c: Context, payload: { ok: boolean; platform: string; handle?: string; error?: string }) {
  const msg = payload.ok ? `Verified ${payload.platform}: ${payload.handle} — you can close this window.` : `Verification failed: ${payload.error}`
  return c.html(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0B0E13;color:#EDF0F4;display:grid;place-items:center;height:100vh;margin:0"><div>${msg}</div><script>
    try { window.opener && window.opener.postMessage(${JSON.stringify({ source: 'pactpay-social', ...payload })}, ${JSON.stringify(WEB)}) } catch (e) {}
    setTimeout(function(){ window.close() }, 1200);
  </script></body>`)
}

export function socialRoutes(app: Hono, requireAuth: any) {
  app.get('/api/social/:platform/start', requireAuth, async (c: Context) => {
    const platform = c.req.param('platform'); const conf = CFG[platform]
    if (!conf) return c.json({ error: 'unknown platform' }, 400)
    if (!conf.clientId || !conf.clientSecret || !conf.redirect) return c.json({ error: `${platform} OAuth is not configured yet` }, 400)
    const wallet = c.get('wallet') as string
    const { verifier, challenge } = conf.pkce ? pkce() : { verifier: '', challenge: '' }
    const state = await signState({ wallet, platform, verifier })
    const params = new URLSearchParams({
      response_type: 'code',
      [conf.clientKeyParam ? 'client_key' : 'client_id']: conf.clientId,
      redirect_uri: conf.redirect, scope: conf.scope, state,
      ...(conf.pkce ? { code_challenge: challenge, code_challenge_method: 'S256' } : {}),
      ...(conf.extraAuth ?? {}),
    })
    return c.json({ url: `${conf.authUrl}?${params.toString()}` })
  })

  app.get('/api/social/:platform/callback', async (c: Context) => {
    const platform = c.req.param('platform'); const conf = CFG[platform]
    const code = c.req.query('code'); const stateRaw = c.req.query('state'); const oauthErr = c.req.query('error')
    if (oauthErr) return resultPage(c, { ok: false, platform, error: oauthErr })
    if (!conf || !code || !stateRaw) return resultPage(c, { ok: false, platform, error: 'missing code/state' })
    try {
      const st = await verifyState(stateRaw)
      if (st.platform !== platform) throw new Error('state mismatch')
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: conf.redirect!,
        ...(conf.pkce ? { code_verifier: st.verifier } : {}),
        ...(conf.clientKeyParam ? { client_key: conf.clientId!, client_secret: conf.clientSecret! }
          : conf.basicAuth ? { client_id: conf.clientId! }
            : { client_id: conf.clientId!, client_secret: conf.clientSecret! }),
      })
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
      if (conf.basicAuth) headers.Authorization = 'Basic ' + Buffer.from(`${conf.clientId}:${conf.clientSecret}`).toString('base64')
      const tj: any = await (await fetch(conf.tokenUrl, { method: 'POST', headers, body })).json()
      const accessToken = tj.access_token
      if (!accessToken) throw new Error(tj.error_description || tj.error || 'token exchange failed')
      const info = await conf.userinfo(accessToken)
      const { handle, id } = info
      if (!handle) throw new Error('could not read your handle from the provider')
      await repo.saveSocialAccount(st.wallet, platform, handle, { platformUserId: id, accessTokenEnc: enc(accessToken), refreshTokenEnc: enc(tj.refresh_token), followers: info.followers, avatarUrl: info.avatar })
      return resultPage(c, { ok: true, platform, handle })
    } catch (e: any) {
      return resultPage(c, { ok: false, platform, error: e?.message ?? String(e) })
    }
  })
}
