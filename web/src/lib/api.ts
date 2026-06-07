/** Backend API client (cookie auth + CSRF). */
const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
export const LORA = import.meta.env.VITE_LORA ?? 'https://lora.algokit.io/testnet'
export const loraTx = (id: string) => `${LORA}/transaction/${id}`

let csrf = ''
async function req(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) }
  if (opts.method && opts.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf
  const res = await fetch(BASE + path, { ...opts, headers, credentials: 'include' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export const api = {
  health: () => req('/health'),
  challenge: (address: string) => req(`/api/auth/challenge?address=${address}`),
  verify: async (address: string, signature: string) => {
    const r = await req('/api/auth/verify', { method: 'POST', body: JSON.stringify({ address, signature }) })
    csrf = r.csrfToken
    return r
  },
  me: () => req('/api/auth/me'),
  airdrop: () => req('/api/users/airdrop', { method: 'POST' }),
  deals: () => req('/api/deals'),
  deal: (id: string) => req(`/api/deals/${id}`),
  registerDeal: (d: any) => req('/api/deals', { method: 'POST', body: JSON.stringify(d) }),
  accept: (id: string, creator: string, acceptTx: string) => req(`/api/deals/${id}/accept`, { method: 'POST', body: JSON.stringify({ creator, acceptTx }) }),
  submit: (id: string, postUrl: string) => req(`/api/deals/${id}/submit`, { method: 'POST', body: JSON.stringify({ postUrl }) }),
  runAgent: (id: string, index = 0) => req(`/api/deals/${id}/run-agent`, { method: 'POST', body: JSON.stringify({ index }) }),
  release: (id: string, index = 0) => req(`/api/deals/${id}/release`, { method: 'POST', body: JSON.stringify({ index }) }),
  metricOverride: (postUrl: string, metric: string, value: number) => req('/api/admin/metric-override', { method: 'POST', body: JSON.stringify({ postUrl, metric, value }) }),
}
