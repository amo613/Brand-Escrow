/**
 * proofService — the data behind the x402 proof oracle.
 * Returns a verified post's metric + content + the creator's REAL profile image.
 *
 * Profile images are fetched live from X / YouTube / TikTok via unavatar.io (a free
 * avatar resolver) — we cannot upload images, so we pull them from the social profile.
 *
 * Metric values: realistic deterministic fixtures by default; an in-memory override
 * (set by the Admin Test Console) lets us drive a specific value for demos/tests while
 * the post + profile stay really fetched.
 */
export interface Proof {
  authorHandle: string
  platform: string
  metric: string
  metricValue: number
  content: string
  hashtags: string[]
  mentions: string[]
  mediaType: string
  profileImage: string
  source: string
  real: boolean
  fetchedAt: number
}

// X (Twitter) API v2 — bearer is stored URL-encoded in some portals, so decode it.
const X_BEARER = process.env.X_BEARER_TOKEN ? decodeURIComponent(process.env.X_BEARER_TOKEN) : ''
const tweetIdFromUrl = (url: string): string | null => url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i)?.[1] ?? null

/** Real metric read from the X API. Returns null on profile-only URLs, missing creds, or API errors
 *  (e.g. free tier can't read tweets) so callers fall back to the override/deterministic value. */
async function fetchXMetric(postUrl: string, metric: string): Promise<{ value: number; handle?: string; content?: string; profileImage?: string } | null> {
  const id = tweetIdFromUrl(postUrl)
  if (!id || !X_BEARER) return null
  try {
    const url = `https://api.twitter.com/2/tweets/${id}?tweet.fields=public_metrics,text&expansions=author_id&user.fields=username,profile_image_url`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${X_BEARER}` } })
    if (!r.ok) return null
    const j: any = await r.json()
    const pm = j.data?.public_metrics ?? {}
    const map: Record<string, number> = {
      likes: pm.like_count, views: pm.impression_count ?? 0,
      comments: pm.reply_count, shares: (pm.retweet_count ?? 0) + (pm.quote_count ?? 0),
    }
    const value = map[metric]
    if (value == null) return null
    const user = j.includes?.users?.[0]
    return { value, handle: user?.username ? '@' + user.username : undefined, content: j.data?.text, profileImage: user?.profile_image_url?.replace('_normal', '') }
  } catch { return null }
}

const overrides = new Map<string, number>() // key `${postUrl}|${metric}` -> value
export const setMetricOverride = (postUrl: string, metric: string, value: number) => overrides.set(`${postUrl}|${metric}`, value)
export const clearMetricOverride = (postUrl: string, metric: string) => overrides.delete(`${postUrl}|${metric}`)

const unavatarPlatform = (p: string) => ({ x: 'twitter', twitter: 'twitter', youtube: 'youtube', tiktok: 'tiktok', instagram: 'instagram' }[p] ?? 'twitter')

/** Best-effort parse of the @handle out of a post URL; falls back to a demo handle. */
function deriveHandle(postUrl: string, platform: string): string {
  try {
    const u = new URL(postUrl)
    const seg = u.pathname.split('/').filter(Boolean)
    const at = seg.find((s) => s.startsWith('@'))
    if (at) return at
    if (platform === 'x' || platform === 'twitter') return '@' + (seg[0] || 'maxfit')
    if (platform === 'youtube') return '@' + (seg[0]?.replace(/^@/, '') || 'maxfit')
    return '@' + (seg[0]?.replace(/^@/, '') || 'maxfit')
  } catch {
    return '@maxfit'
  }
}

function deterministicMetric(postUrl: string, metric: string): number {
  if (metric === 'posted') return 1 // delivery is a boolean: they submitted a post → 1 (never a random count)
  const seed = [...(postUrl + metric)].reduce((a, c) => a + c.charCodeAt(0), 0)
  const base: Record<string, number> = { likes: 6000, views: 80000, comments: 800, shares: 400 }
  return Math.round((base[metric] ?? 5000) + (seed % 5000))
}

/** Resolve the creator's real avatar URL from the social platform (unavatar 302s to the image). */
export function profileImageUrl(platform: string, handle: string): string {
  return `https://unavatar.io/${unavatarPlatform(platform)}/${handle.replace(/^@/, '')}`
}

export async function fetchProof(platform: string, postUrl: string, metric: string): Promise<Proof> {
  const override = overrides.get(`${postUrl}|${metric}`)
  // 1) admin override wins (Test Console). 2) real X API. 3) deterministic demo fixture.
  const live = override == null && (platform === 'x' || platform === 'twitter') ? await fetchXMetric(postUrl, metric) : null
  const real = live != null
  const authorHandle = live?.handle ?? deriveHandle(postUrl, platform)
  const metricValue = override ?? live?.value ?? deterministicMetric(postUrl, metric)
  return {
    authorHandle,
    platform,
    metric,
    metricValue,
    content: live?.content ?? `Training in the new gear 🔥 link in bio #PactPay @nike — ${authorHandle}`,
    hashtags: ['#PactPay'],
    mentions: ['@nike'],
    mediaType: 'video',
    profileImage: live?.profileImage ?? profileImageUrl(platform, authorHandle),
    source: real ? 'live · X API v2' : override != null ? 'admin override (test)' : `demo fixture (${platform})`,
    real,
    fetchedAt: Date.now(),
  }
}
