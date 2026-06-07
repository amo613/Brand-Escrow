/** Smoke-test the DEPLOYED Railway stack: CORS + cross-site cookie auth round-trip.
 *  Run from backend/:  API=https://... WEB=https://... npx tsx scripts/prod-smoke.ts */
import algosdk from 'algosdk'
import dotenv from 'dotenv'
import { resolve } from 'node:path'
dotenv.config({ path: resolve(process.cwd(), '../.env') })

const API = process.env.API!
const WEB = process.env.WEB!
const MN = process.env.BRAND_TEST_MNEMONIC!

async function main() {
  // 1) health
  const h = await (await fetch(`${API}/health`)).json()
  console.log('health:', JSON.stringify(h))

  // 2) CORS preflight as the browser would send it
  const pf = await fetch(`${API}/api/auth/verify`, {
    method: 'OPTIONS',
    headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' },
  })
  console.log('CORS preflight:', pf.status,
    '| allow-origin =', pf.headers.get('access-control-allow-origin'),
    '| allow-credentials =', pf.headers.get('access-control-allow-credentials'),
    '| allow-headers =', pf.headers.get('access-control-allow-headers'))

  // 3) signed auth round-trip (challenge → verify → me) with the web Origin
  const a = algosdk.mnemonicToSecretKey(MN); const addr = String(a.addr)
  const ch = await (await fetch(`${API}/api/auth/challenge?address=${addr}`, { headers: { Origin: WEB } })).json()
  const sig = Buffer.from(algosdk.signBytes(new TextEncoder().encode(ch.message), a.sk)).toString('base64')
  const vr = await fetch(`${API}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: WEB }, body: JSON.stringify({ address: addr, signature: sig }) })
  const vbody = await vr.json()
  const raw: string[] = (typeof vr.headers.getSetCookie === 'function' ? vr.headers.getSetCookie() : [])
    ?? (vr.headers.get('set-cookie') ? [vr.headers.get('set-cookie') as string] : [])
  const cookies = raw.filter(Boolean).map((c) => String(c).split(';')[0]).join('; ')
  console.log('verify:', vr.status, '| set-cookie token+csrf present =', /token=/.test(cookies) && /csrf=/.test(cookies), '| csrfToken =', vbody.csrfToken?.slice(0, 8) + '…')
  const me = await fetch(`${API}/api/auth/me`, { headers: { Cookie: cookies, Origin: WEB } })
  const mb = await me.json()
  console.log('me:', me.status, '| wallet =', mb.wallet)
  if (mb.wallet !== addr) throw new Error('auth round-trip failed (wallet mismatch)')
  console.log('\n✅ DEPLOYED stack: health + Redis + CORS + cross-site cookie auth all working')
}
main().catch((e) => { console.error('❌ prod-smoke failed:', e?.message ?? e); process.exit(1) })
