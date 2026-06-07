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

type LiveProof = { value: number; handle?: string; content?: string; profileImage?: string } | null

// YouTube Data API — real video stats (views/likes/comments). Needs GOOGLE_API_KEY.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? ''
const ytVideoId = (url: string): string | null => url.match(/(?:v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/)?.[1] ?? null
async function fetchYouTubeMetric(postUrl: string, metric: string): Promise<LiveProof> {
  const id = ytVideoId(postUrl)
  if (!id || !GOOGLE_API_KEY) return null
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${id}&key=${GOOGLE_API_KEY}`)
    if (!r.ok) return null
    const it: any = (await r.json()).items?.[0]
    if (!it) return null
    const st = it.statistics ?? {}
    const map: Record<string, number> = { likes: +st.likeCount || 0, views: +st.viewCount || 0, comments: +st.commentCount || 0, shares: 0, followers: 0 }
    const value = metric === 'posted' ? 1 : map[metric]
    if (value == null) return null
    return { value, handle: it.snippet?.channelTitle ? '@' + String(it.snippet.channelTitle).replace(/\s+/g, '') : undefined, content: `${it.snippet?.title ?? ''} ${it.snippet?.description ?? ''}`, profileImage: it.snippet?.thumbnails?.default?.url }
  } catch { return null }
}

// TikTok via Apify (clockworks~tiktok-scraper). Real likes/views/comments/shares. Slow-ish (run-sync).
const APIFY = process.env.APIFY_API_TOKEN ?? ''
async function fetchTikTokMetric(postUrl: string, metric: string): Promise<LiveProof> {
  if (!APIFY || !/tiktok\.com/i.test(postUrl)) return null
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${APIFY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postURLs: [postUrl], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false }),
      signal: AbortSignal.timeout(55000),
    })
    if (!r.ok) return null
    const it: any = (await r.json())?.[0]
    if (!it) return null
    const map: Record<string, number> = { likes: it.diggCount ?? 0, views: it.playCount ?? 0, comments: it.commentCount ?? 0, shares: it.shareCount ?? 0, followers: it.authorMeta?.fans ?? 0 }
    const value = metric === 'posted' ? 1 : map[metric]
    if (value == null) return null
    return { value, handle: it.authorMeta?.name ? '@' + it.authorMeta.name : undefined, content: it.text ?? '', profileImage: it.authorMeta?.avatar }
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
  // 1) admin override wins (Test Console). 2) real platform API (X / YouTube / TikTok). 3) deterministic fixture.
  let live: LiveProof = null
  if (override == null) {
    if (platform === 'x' || platform === 'twitter') live = await fetchXMetric(postUrl, metric)
    else if (platform === 'youtube') live = await fetchYouTubeMetric(postUrl, metric)
    else if (platform === 'tiktok') live = await fetchTikTokMetric(postUrl, metric)
  }
  const real = live != null
  const authorHandle = live?.handle ?? deriveHandle(postUrl, platform)
  const metricValue = override ?? live?.value ?? deterministicMetric(postUrl, metric)
  const content = live?.content ?? `Training in the new gear 🔥 link in bio #PactPay @nike — ${authorHandle}`
  // tags are TRACKED from the real post content — not hardcoded. Empty post → empty tags.
  const hashtags = content.match(/#[\p{L}\p{N}_]+/gu) ?? []
  const mentions = content.match(/@[\p{L}\p{N}_]+/gu) ?? []
  return {
    authorHandle,
    platform,
    metric,
    metricValue,
    content,
    hashtags,
    mentions,
    mediaType: 'video',
    profileImage: live?.profileImage ?? profileImageUrl(platform, authorHandle),
    source: real ? `live · ${platform === 'tiktok' ? 'Apify TikTok' : platform === 'youtube' ? 'YouTube Data API' : 'X API v2'}` : override != null ? 'admin override (test)' : `demo fixture (${platform})`,
    real,
    fetchedAt: Date.now(),
  }
}
