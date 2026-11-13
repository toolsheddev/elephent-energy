/* Sign-in uses Supabase Auth. The browser signs in with Supabase and sends its access token (Authorization: Bearer ...).
   The API checks the token's signature against the project's public keys (JWKS, ES256), so it needs no secret.
   App-specific settings (role, blocked) live in the users table. A database trigger adds a row there whenever a Supabase account is created. */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { pool } from './db'

export interface SessionUser { id: number; name: string; email: string; role: 'admin' | 'user' }
declare module 'fastify' {
  interface FastifyRequest { user?: SessionUser }
}

/** https://<project-ref>.supabase.co, from SUPABASE_URL or worked out from the database connection string. */
export function supabaseUrl(): string {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/$/, '')
  const ref = decodeURIComponent(process.env.DATABASE_URL ?? '').match(/postgres\.([a-z0-9]+)[:@]/)?.[1]
  if (!ref) throw new Error('SUPABASE_URL is not set and cannot be read from DATABASE_URL.')
  return `https://${ref}.supabase.co`
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
async function verify(token: string): Promise<JWTPayload & { email?: string; user_metadata?: { full_name?: string; name?: string } }> {
  const base = supabaseUrl()
  jwks ??= createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`))
  const { payload } = await jwtVerify(token, jwks, { issuer: `${base}/auth/v1`, audience: 'authenticated' })
  return payload as JWTPayload & { email?: string }
}

/** The app's record for a Supabase user. Only people an admin has added (users table, active) may use the app. */
async function appUser(authId: string, email: string): Promise<(SessionUser & { active: boolean; pending: boolean }) | null> {
  const found = await pool.query('select id, name, email, role, active, pending, auth_user_id from users where auth_user_id = $1 or (lower(email) = $2) order by auth_user_id nulls last limit 1', [authId, email.toLowerCase()])
  const u = found.rows[0]
  if (!u) return null
  // link the Supabase account on first sign-in, and note the visit (at most every 10 minutes)
  await pool.query("update users set auth_user_id = $1, last_login_at = now() where id = $2 and (auth_user_id is distinct from $1 or last_login_at is null or last_login_at < now() - interval '10 minutes')", [authId, u.id])
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, pending: u.pending }
}

const PUBLIC = new Set(['/api/health'])

export function registerAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0]!
    if (!path.startsWith('/api/') || PUBLIC.has(path) || req.method === 'OPTIONS') return
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (!token) return reply.status(401).send({ error: 'Please sign in.' })
    let claims
    try { claims = await verify(token) } catch { return reply.status(401).send({ error: 'Your sign-in has expired. Please sign in again.' }) }
    if (!claims.sub || !claims.email) return reply.status(401).send({ error: 'Please sign in.' })
    // Optional: only work emails, e.g. AUTH_ALLOWED_DOMAINS=elephantenergy.com
    const domains = (process.env.AUTH_ALLOWED_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
    if (domains.length && !domains.includes(claims.email.split('@')[1]?.toLowerCase() ?? '')) return reply.status(403).send({ error: 'This email is not allowed to use System Design.' })
    const user = await appUser(claims.sub, claims.email)
    if (!user) return reply.status(403).send({ error: 'You have not been given access to System Design. Ask an admin to invite you.' })
    if (user.pending) return reply.status(403).send({ error: 'Your account is waiting for an admin to approve it.' })
    if (!user.active) return reply.status(403).send({ error: 'Your access has been removed. Ask an admin.' })
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role }
  })

  app.get('/api/auth/me', async (req) => req.user)
}

/** For routes only an admin may call. */
export function requireAdmin(req: FastifyRequest) {
  if (req.user?.role !== 'admin') throw Object.assign(new Error('Only an admin can do this.'), { statusCode: 403 })
}
