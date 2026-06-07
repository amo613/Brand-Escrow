/** Prisma client over the Neon serverless driver — works in the sandbox (HTTPS/WSS, port 443)
 *  and on Railway alike. DATABASE_URL = the pooled Neon connection string. */
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Node has no global WebSocket — Neon's pooled driver needs one.
neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })

export async function dbPing(): Promise<boolean> {
  try { await prisma.$queryRaw`SELECT 1`; return true } catch { return false }
}
