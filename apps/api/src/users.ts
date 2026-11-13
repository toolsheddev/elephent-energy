/* Who may use System Design (the users table). Mainly for the first admin; after that admins use the Team page.
   npm run user -- add <email> "<Full name>" [--admin]   give someone access (they sign in with that email in Supabase)
   npm run user -- role <email> admin|user
   npm run user -- disable <email> | enable <email>
   npm run user -- remove <email>
   npm run user -- list */
import { migrate, pool, reserveIds } from './db'

const [cmd, ...rest] = process.argv.slice(2)
const positional = rest.filter((x) => !x.startsWith('--'))
const has = (f: string) => rest.includes(`--${f}`)

async function main() {
  await migrate() // makes sure the sign-in columns and table security are in place
  if (cmd === 'list') {
    const r = await pool.query('select email, name, role, active, pending, last_login_at from users where email is not null order by name')
    if (!r.rows.length) console.log('Nobody has access yet. Add the first admin: npm run user -- add you@company.com "Your Name" --admin')
    for (const u of r.rows) console.log(`${u.pending ? '? ' : u.active ? '  ' : 'x '}${String(u.email).padEnd(34)} ${String(u.name).padEnd(24)} ${u.role.padEnd(6)} ${u.last_login_at ? 'last sign-in ' + new Date(u.last_login_at).toISOString().slice(0, 16).replace('T', ' ') : 'not signed in yet'}`)
    return
  }
  const email = String(positional[0] ?? '').trim().toLowerCase()
  if (!email.includes('@')) throw new Error('Give an email address.')
  if (cmd === 'add' || cmd === 'role') {
    const role = cmd === 'role' ? positional[1] : has('admin') ? 'admin' : 'user'
    if (role !== 'admin' && role !== 'user') throw new Error('Role must be admin or user.')
    const name = cmd === 'add' ? String(positional[1] ?? '').trim() : ''
    const found = await pool.query('select id from users where lower(email) = $1', [email])
    if (found.rows[0]) await pool.query("update users set role = $1, active = true, pending = false, name = coalesce(nullif($2, ''), name) where id = $3", [role, name, found.rows[0].id])
    else {
      if (cmd === 'role') throw new Error(`${email} is not on the list yet. Use: npm run user -- add ${email} "Full Name"`)
      const nextId = await reserveIds()
      await pool.query('insert into users(id, name, email, role) values ($1, $2, $3, $4)', [nextId(), name || email.split('@')[0], email, role])
    }
    console.log(`${email} has access as ${role}. They sign in with this email (create the account in Supabase > Authentication > Users if it does not exist).`)
    return
  }
  if (cmd === 'disable' || cmd === 'enable') {
    const r = await pool.query('update users set active = $1, pending = false where lower(email) = $2', [cmd === 'enable', email])
    if (!r.rowCount) throw new Error(`${email} is not on the list.`)
    console.log(`${email} ${cmd === 'enable' ? 'can use System Design again' : 'is blocked'}.`)
    return
  }
  if (cmd === 'remove') {
    const r = await pool.query("update users set email = null, auth_user_id = null, active = false, pending = false, role = 'user' where lower(email) = $1", [email])
    if (!r.rowCount) throw new Error(`${email} is not on the list.`)
    console.log(`${email} no longer has access.`)
    return
  }
  throw new Error('Commands: add, role, disable, enable, remove, list')
}

main().then(() => pool.end()).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1) })
