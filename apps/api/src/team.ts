/* Team management, admins only (role column in the users table, checked on every call).
   No Supabase secret key: access is the users table itself.
   - Invite: add the person (email, name, role) and send them a Supabase sign-in email using the anon key.
   - Remove: take them off the list, so they lose access at once. Their name stays (projects may list them as PM).
   - Role and block: columns in the users table.
   - Pending: someone made a Supabase account without an invite (the database trigger added them); an admin approves them. */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireAdmin, supabaseUrl } from './auth'
import { pool, reserveIds } from './db'

type Role = 'admin' | 'user'
const bad = (msg: string) => Object.assign(new Error(msg), { statusCode: 400 })

/** Where the email link should land: the site the admin is using. */
function siteUrl(req: FastifyRequest): string {
  if (req.headers.origin) return req.headers.origin
  return `${(req.headers['x-forwarded-proto'] as string) ?? 'http'}://${req.headers.host}`
}

/** Supabase "magic link" email. Works with the anon key; creates the Supabase account if the person has none yet. */
async function sendSignInEmail(email: string, name: string, redirectTo: string) {
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!key) throw bad('Set VITE_SUPABASE_ANON_KEY so the invite email can be sent.')
  const res = await fetch(`${supabaseUrl()}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, create_user: true, data: name ? { full_name: name } : {} }),
  })
  if (!res.ok) {
    const t = await res.text()
    let msg = t
    try { const j = JSON.parse(t); msg = j.msg ?? j.message ?? j.error_description ?? t } catch { /* keep text */ }
    if (/signups? not allowed/i.test(msg)) throw bad('Supabase blocks new sign-ups, so it cannot create the account. Turn on "Allow new users to sign up" in Supabase > Authentication (access to the app is still limited to this list), or add the person in the Supabase dashboard.')
    throw bad(`Supabase: ${String(msg).slice(0, 200)}`)
  }
}

export function registerTeam(app: FastifyInstance) {
  app.get('/api/team', async (req) => {
    requireAdmin(req)
    const rows = (await pool.query('select id, name, email, role, active, pending, auth_user_id, last_login_at from users where email is not null order by lower(name)')).rows
    return {
      people: rows.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        status: u.pending ? 'pending' : !u.active ? 'blocked' : u.last_login_at ? 'active' : 'invited',
        lastSignIn: u.last_login_at, me: u.id === req.user!.id,
      })),
    }
  })

  app.post<{ Body: { email?: string; name?: string; role?: Role } }>('/api/team/invite', async (req) => {
    requireAdmin(req)
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const name = String(req.body?.name ?? '').trim()
    const role: Role = req.body?.role === 'admin' ? 'admin' : 'user'
    if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Enter a valid email address.')
    const domains = (process.env.AUTH_ALLOWED_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
    if (domains.length && !domains.includes(email.split('@')[1]!)) throw bad(`Only ${domains.join(', ')} addresses can be invited.`)
    const found = await pool.query('select id from users where lower(email) = $1', [email])
    if (found.rows[0]) await pool.query("update users set role = $1, active = true, pending = false, name = coalesce(nullif($2, ''), name) where id = $3", [role, name, found.rows[0].id])
    else { const nextId = await reserveIds(); await pool.query('insert into users(id, name, email, role) values ($1, $2, $3, $4)', [nextId(), name || email.split('@')[0], email, role]) }
    await sendSignInEmail(email, name, siteUrl(req) + '/')
    return { value: true }
  })

  app.patch<{ Params: { id: string }; Body: { role?: Role; active?: boolean } }>('/api/team/:id', async (req) => {
    requireAdmin(req)
    const id = Number(req.params.id)
    if (id === req.user!.id) throw bad('You cannot change your own role or block yourself.')
    if (req.body.role && req.body.role !== 'admin' && req.body.role !== 'user') throw bad('Role must be admin or user.')
    const r = await pool.query('update users set role = coalesce($1, role), active = coalesce($2, active), pending = case when $2::boolean then false else pending end where id = $3 and email is not null', [req.body.role ?? null, req.body.active ?? null, id])
    if (!r.rowCount) throw bad('Person not found.')
    return { value: true }
  })

  app.delete<{ Params: { id: string } }>('/api/team/:id', async (req) => {
    requireAdmin(req)
    const id = Number(req.params.id)
    if (id === req.user!.id) throw bad('You cannot remove yourself.')
    // Keep the name (projects may list this person as PM); remove access
    const r = await pool.query("update users set email = null, auth_user_id = null, active = false, pending = false, role = 'user' where id = $1 and email is not null", [id])
    if (!r.rowCount) throw bad('Person not found.')
    return { value: true }
  })
}
