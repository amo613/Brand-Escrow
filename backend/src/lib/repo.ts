/** Postgres-backed domain repository (Prisma/Neon). Source of truth for users, deals,
 *  milestones, applications, social accounts, verdicts. The ephemeral UI bits the schema
 *  has no column for — the live agent log + tx-receipt shortcuts — live in Redis, keyed by
 *  the on-chain deal id. Everything returns the flat view-model the frontend already expects. */
import { createHash } from 'node:crypto'
import { prisma } from './db.ts'
import { redis } from './store.ts'
import type { Platform, MilestoneMetric } from '@prisma/client'

const PLAT_TO_DB: Record<string, Platform> = { x: 'X', twitter: 'X', youtube: 'YOUTUBE', tiktok: 'TIKTOK', instagram: 'INSTAGRAM' }
const PLAT_FROM_DB: Record<string, string> = { X: 'x', YOUTUBE: 'youtube', TIKTOK: 'tiktok', INSTAGRAM: 'instagram' }
const UNAVATAR: Record<string, string> = { X: 'twitter', YOUTUBE: 'youtube', TIKTOK: 'tiktok', INSTAGRAM: 'instagram' }
// REAL audience stats: cached in Redis at OAuth-verify time (followers + avatar from the platform API).
// The avatar always resolves to the real profile picture via unavatar; followers is real or undefined
// (never a fabricated number). key = pactpay:social:<PLATFORM>:<handle-lower>
type SocialCache = { followers?: number; avatarUrl?: string; engagement?: number }
const socialKey = (platform: string, handle: string) => `pactpay:social:${platform}:${handle.replace(/^@/, '').toLowerCase()}`
export async function setSocialCache(platform: Platform, handle: string, data: SocialCache) {
  if (!redis || !handle) return
  try { await redis.set(socialKey(platform, handle), JSON.stringify(data)) } catch { /* ignore */ }
}
async function getSocialCache(platform: Platform, handle: string): Promise<SocialCache | null> {
  if (!redis || !handle) return null
  try { const r = await redis.get(socialKey(platform, handle)); return r ? JSON.parse(r) : null } catch { return null }
}
async function socialStats(platform: Platform, handle?: string): Promise<{ avatarUrl?: string; followers?: number; engagement?: number }> {
  if (!handle) return {}
  const h = handle.replace(/^@/, '')
  const cached = await getSocialCache(platform, handle)
  return { avatarUrl: cached?.avatarUrl || `https://unavatar.io/${UNAVATAR[platform] ?? 'twitter'}/${h}`, followers: cached?.followers, engagement: cached?.engagement }
}
const METRICS = ['posted', 'likes', 'views', 'comments', 'shares', 'followers']
const metricToDb = (m: string | number): MilestoneMetric => (typeof m === 'number' ? METRICS[m] : m).toUpperCase() as MilestoneMetric
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export const platformToDb = (p: string): Platform => PLAT_TO_DB[p.toLowerCase()] ?? 'X'

// ── UI meta (agent log + tx receipts) in Redis ──────────────────────────────
export interface Required { hashtag?: string; mention?: string; link?: string; media?: string }
export interface UiMeta { agentLog: { t: string; text: string; kind: string }[]; tx: Record<string, string>; required?: Required }
const metaKey = (onchainId: string) => `pactpay:meta:${onchainId}`
const mem = new Map<string, UiMeta>() // fallback when Redis is absent
async function getMeta(onchainId: string): Promise<UiMeta> {
  if (redis) { try { const r = await redis.get(metaKey(onchainId)); if (r) return JSON.parse(r) } catch { /* fall through */ } }
  return mem.get(onchainId) ?? { agentLog: [], tx: {} }
}
async function setMeta(onchainId: string, m: UiMeta) {
  mem.set(onchainId, m)
  if (redis) { try { await redis.set(metaKey(onchainId), JSON.stringify(m)) } catch { /* ignore */ } }
}
export async function pushLog(onchainId: string, text: string, kind = 'info') {
  const m = await getMeta(onchainId)
  m.agentLog.push({ t: new Date().toTimeString().slice(0, 8), text, kind }); await setMeta(onchainId, m)
}
export async function setTx(onchainId: string, key: string, val: string) {
  const m = await getMeta(onchainId); m.tx[key] = val; await setMeta(onchainId, m)
}
export async function setRequired(onchainId: string, required: Required) {
  const clean: Required = { hashtag: required.hashtag || undefined, mention: required.mention || undefined, link: required.link || undefined, media: required.media || undefined }
  const m = await getMeta(onchainId); m.required = clean; await setMeta(onchainId, m)
}

// ── Users ───────────────────────────────────────────────────────────────────
export async function upsertUser(wallet: string, role?: 'BRAND' | 'CREATOR', extra?: { email?: string; displayName?: string }) {
  return prisma.user.upsert({
    where: { wallet },
    update: { ...(role ? { role } : {}), ...(extra ?? {}) },
    create: { wallet, role: role ?? 'CREATOR', ...(extra ?? {}) },
  })
}
export const markFunded = (wallet: string) => prisma.user.update({ where: { wallet }, data: { fundedTestnet: true } }).catch(() => {})
export const getUser = (wallet: string) => prisma.user.findUnique({ where: { wallet } })

// ── View-model mapping ───────────────────────────────────────────────────────
async function toView(d: any): Promise<any> {
  const meta = await getMeta(d.onchainId.toString())
  // verified handle per applicant: their SocialAccount for this deal's platform, else the pitch they typed.
  // Enrich with the real profile avatar (unavatar) + realistic audience stats for the marketplace cards.
  const applicants = await Promise.all((d.applications ?? []).filter((a: any) => a.status === 'SUBMITTED').map(async (a: any) => {
    const social = (a.creator.socials ?? []).find((s: any) => s.platform === d.platform)
    const handle = social?.handle ?? a.pitch ?? undefined
    return { address: a.creator.wallet, handle, verified: !!social, at: new Date(a.createdAt).getTime(), ...(await socialStats(d.platform, handle)) }
  }))
  const creatorHandleVal = d.creator ? ((d.creator.socials ?? []).find((s: any) => s.platform === d.platform)?.handle ?? undefined) : undefined
  const creatorStatsVal = await socialStats(d.platform, creatorHandleVal)
  return {
    id: d.onchainId.toString(),
    brand: d.brand?.wallet,
    creator: d.creator?.wallet ?? undefined,
    creatorHandle: creatorHandleVal,
    creatorStats: creatorStatsVal,
    title: d.title, brief: d.brief, platform: PLAT_FROM_DB[d.platform] ?? 'x', postUrl: d.postUrl ?? undefined,
    status: d.status,
    milestones: (d.milestones ?? []).sort((a: any, b: any) => a.index - b.index).map((m: any) => ({
      index: m.index, metric: m.metric.toLowerCase(), threshold: Number(m.threshold), amountUsdc: Number(m.amountMicro) / 1e6,
      status: m.status, releaseTx: m.releaseTxId ?? undefined, approvedAt: m.approvedAt ? Math.floor(new Date(m.approvedAt).getTime() / 1000) : undefined,
    })),
    applicants, agentLog: meta.agentLog, tx: meta.tx, required: meta.required, createdAt: new Date(d.createdAt).getTime(),
    deadline: d.deadline ? new Date(d.deadline).getTime() : undefined,
  }
}
const DEAL_INCLUDE = { brand: true, creator: { include: { socials: true } }, milestones: true, applications: { include: { creator: { include: { socials: true } } } } } as const

export async function listDeals() {
  const ds = await prisma.deal.findMany({ include: DEAL_INCLUDE, orderBy: { createdAt: 'desc' } })
  return Promise.all(ds.map(toView))
}
export async function getDeal(onchainId: string) {
  const d = await prisma.deal.findUnique({ where: { onchainId: BigInt(onchainId) }, include: DEAL_INCLUDE })
  return d ? toView(d) : null
}

// ── Mutations ────────────────────────────────────────────────────────────────
export async function registerDeal(b: { onchainId: string; brandWallet: string; title: string; brief: string; platform: string; milestones: any[]; fundTx?: string; deadlineUnix?: number; required?: Required }) {
  const brand = await upsertUser(b.brandWallet, 'BRAND')
  const ms = (b.milestones ?? []).map((m: any, i: number) => ({ index: i, metric: metricToDb(m.metric), threshold: BigInt(Math.round(Number(m.threshold))), amountMicro: BigInt(Math.round(Number(m.amountUsdc) * 1e6)) }))
  const total = ms.reduce((a, m) => a + m.amountMicro, 0n)
  await prisma.deal.create({
    data: {
      onchainId: BigInt(b.onchainId), brandId: brand.id, title: b.title, brief: b.brief, platform: platformToDb(b.platform),
      payoutMode: ms.length > 1 ? 'MILESTONE' : 'FULL', totalAmountMicro: total,
      deadline: new Date((b.deadlineUnix ? b.deadlineUnix * 1000 : Date.now() + 30 * 864e5)), status: 'FUNDED',
      briefHash: sha256(b.brief), fundTxId: b.fundTx, milestones: { create: ms },
    },
  })
  if (b.fundTx) await setTx(b.onchainId, 'fund', b.fundTx)
  if (b.required) await setRequired(b.onchainId, b.required)
  return getDeal(b.onchainId)
}

export async function applyToDeal(onchainId: string, creatorWallet: string, handle?: string) {
  const deal = await prisma.deal.findUnique({ where: { onchainId: BigInt(onchainId) } })
  if (!deal) throw new Error('deal not found')
  if (deal.creatorId) throw new Error('a creator is already bound to this deal')
  const creator = await upsertUser(creatorWallet, 'CREATOR')
  await prisma.application.upsert({
    where: { dealId_creatorId: { dealId: deal.id, creatorId: creator.id } },
    update: { pitch: handle, status: 'SUBMITTED' }, create: { dealId: deal.id, creatorId: creator.id, pitch: handle },
  })
  return getDeal(onchainId)
}

export async function acceptCreator(onchainId: string, creatorWallet: string, acceptTx?: string) {
  const deal = await prisma.deal.findUnique({ where: { onchainId: BigInt(onchainId) } })
  if (!deal) throw new Error('deal not found')
  const creator = await upsertUser(creatorWallet, 'CREATOR')
  await prisma.deal.update({ where: { id: deal.id }, data: { creatorId: creator.id, status: 'ACCEPTED' } })
  await prisma.application.updateMany({ where: { dealId: deal.id, creatorId: creator.id }, data: { status: 'ACCEPTED' } })
  if (acceptTx) await setTx(onchainId, 'accept', acceptTx)
  return getDeal(onchainId)
}

export async function submitPost(onchainId: string, postUrl: string) {
  await prisma.deal.update({ where: { onchainId: BigInt(onchainId) }, data: { postUrl, status: 'TRACKING' } })
  return getDeal(onchainId)
}

export async function recordVerdict(onchainId: string, index: number, v: { pass: boolean; confidence: number; reason: string; model: string; observed: any; observedValue: number; x402Tx?: string; verdictTx?: string }) {
  const deal = await prisma.deal.findUnique({ where: { onchainId: BigInt(onchainId) }, include: { milestones: true } })
  if (!deal) throw new Error('deal not found')
  const ms = deal.milestones.find((m) => m.index === index)
  await prisma.verdict.create({ data: { dealId: deal.id, milestoneId: ms?.id, pass: v.pass, confidence: v.confidence, reason: v.reason, model: v.model, observedMetric: v.observed, x402SettleTxId: v.x402Tx } })
  if (v.x402Tx) await setTx(onchainId, 'x402', v.x402Tx)
  if (v.verdictTx && ms) {
    await prisma.milestone.update({ where: { id: ms.id }, data: { status: 'REACHED_PENDING', approvedAt: new Date(), reachedValue: BigInt(Math.round(v.observedValue)) } })
    await setTx(onchainId, 'verdict', v.verdictTx)
  }
  return getDeal(onchainId)
}

export async function recordRelease(onchainId: string, index: number, releaseTx: string) {
  const deal = await prisma.deal.findUnique({ where: { onchainId: BigInt(onchainId) }, include: { milestones: true } })
  if (!deal) throw new Error('deal not found')
  const ms = deal.milestones.find((m) => m.index === index)!
  await prisma.milestone.update({ where: { id: ms.id }, data: { status: 'RELEASED', releaseTxId: releaseTx } })
  const fresh = await prisma.milestone.findMany({ where: { dealId: deal.id } })
  const allReleased = fresh.every((m) => m.status === 'RELEASED')
  await prisma.deal.update({ where: { id: deal.id }, data: { status: allReleased ? 'RELEASED' : 'PARTIALLY_RELEASED' } })
  await setTx(onchainId, 'release', releaseTx)
  return getDeal(onchainId)
}

// ── Social accounts (OAuth-verified @handle) ─────────────────────────────────
export async function saveSocialAccount(wallet: string, platform: string, handle: string, opts: { platformUserId?: string; accessTokenEnc?: string; refreshTokenEnc?: string; followers?: number; avatarUrl?: string; engagement?: number }) {
  const user = await upsertUser(wallet)
  const plat = platformToDb(platform)
  // cache the REAL follower count + avatar + engagement (from the platform API) for the marketplace cards
  await setSocialCache(plat, handle, { followers: opts.followers, avatarUrl: opts.avatarUrl, engagement: opts.engagement })
  return prisma.socialAccount.upsert({
    where: { platform_handle: { platform: plat, handle } },
    update: { userId: user.id, platformUserId: opts.platformUserId, accessTokenEnc: opts.accessTokenEnc, refreshTokenEnc: opts.refreshTokenEnc, verifiedAt: new Date() },
    create: { userId: user.id, platform: plat, handle, platformUserId: opts.platformUserId, accessTokenEnc: opts.accessTokenEnc, refreshTokenEnc: opts.refreshTokenEnc },
  })
}
export async function getSocials(wallet: string) {
  const user = await prisma.user.findUnique({ where: { wallet }, include: { socials: true } })
  return (user?.socials ?? []).map((s) => ({ platform: PLAT_FROM_DB[s.platform] ?? s.platform.toLowerCase(), handle: s.handle, verifiedAt: s.verifiedAt }))
}
