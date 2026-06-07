/** Smoke test the HTTP API: health → wallet auth (challenge/signBytes/verify) → airdrop.
 *  Run from backend/:  npx tsx scripts/api-smoke.ts */
import '../src/server.ts' // boots the API on :8080
import algosdk from 'algosdk'

const BASE = 'http://localhost:8080'
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))
const creator = algosdk.mnemonicToSecretKey(process.env.CREATOR_TEST_MNEMONIC!)

async function main() {
  await sleep(0.9)
  const health = await (await fetch(`${BASE}/health`)).json()
  console.log('health        :', health)

  const addr = String(creator.addr)
  const { message } = await (await fetch(`${BASE}/api/auth/challenge?address=${addr}`)).json()
  console.log('challenge      : received', message.split('\n')[0])
  const sig = Buffer.from(algosdk.signBytes(new TextEncoder().encode(message), creator.sk)).toString('base64')
  const verifyRes = await fetch(`${BASE}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, signature: sig }) })
  const v = await verifyRes.json()
  const cookies = (verifyRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  console.log('auth verify    :', verifyRes.status, 'ok=' + v.ok, 'csrf=' + !!v.csrfToken)

  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookies } })).json()
  console.log('auth/me        :', me)

  const airRes = await fetch(`${BASE}/api/users/airdrop`, { method: 'POST', headers: { Cookie: cookies, 'x-csrf-token': v.csrfToken } })
  const air = await airRes.json()
  console.log('airdrop        :', airRes.status, JSON.stringify(air))

  const ok = health.ok && verifyRes.status === 200 && v.ok && me.wallet === addr && airRes.status === 200
  console.log(ok ? '\n✅ HTTP API smoke passed (auth + airdrop + oracle mounted)' : '\n❌ smoke failed')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => { console.error('❌', e?.message ?? e); process.exit(1) })
