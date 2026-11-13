import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Pool, types } = pg

// Return plain JS values the domain model expects instead of the driver defaults.
types.setTypeParser(1082, (v) => v)                           // date        -> 'YYYY-MM-DD' (no timezone shift)
types.setTypeParser(1700, (v) => Number(v))                   // numeric     -> number
types.setTypeParser(20, (v) => Number(v))
types.setTypeParser(701, (v) => Number(v))                    // float8      -> number                     // bigint      -> number
types.setTypeParser(1184, (v) => new Date(v).toISOString())   // timestamptz -> ISO string

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/system_design'
// Supabase (and most hosted Postgres) needs TLS; a local database does not.
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)
export const pool = new Pool({ connectionString: DATABASE_URL, max: 8, ssl: local ? undefined : { rejectUnauthorized: false } })

export type Db = Pick<pg.PoolClient, 'query'>

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    const out = await fn(c)
    await c.query('commit')
    return out
  } catch (e) {
    await c.query('rollback').catch(() => undefined)
    throw e
  } finally {
    c.release()
  }
}

/** Create the tables if they do not exist. Safe to run on every start. */
export async function migrate() {
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
}

/** Reserve a block of ids (the sequence moves in steps of 1000) so a request can create rows with explicit ids. */
export async function reserveIds(c: Db = pool): Promise<() => number> {
  const { rows } = await c.query<{ n: number }>("select nextval('app_id_seq') as n")
  let next = rows[0].n
  const end = next + 999
  return () => {
    if (next >= end) throw new Error('Id block exhausted')
    return next++
  }
}

/** Drop this app's tables (not the whole schema, so a hosted database keeps its own objects). */
export async function dropAll() {
  const { rows } = await pool.query<{ t: string }>(
    `select tablename t from pg_tables where schemaname = current_schema()
      and tablename = any($1)`,
    [['customers_new', 'houses_new', 'users', 'projects_new', 'project_profile', 'existing_systems', 'proposals_new', 'systems_new', 'line_items_new', 'invoices_new',
      'invoice_line_items_new', 'deposit_config', 'equipment_new', 'labor_new', 'prices_new', 'maintenance_plans_new', 'ahri_certifications_new',
      'jurisdiction_rules_new', 'permits_new', 'incentives_new', 'incentive_limits_new', 'discounts_new', 'utilities_new', 'hdd_new', 'zipcode_mapping', 'referral_credits', 'timestamps_new', 'ahri_configurations']])
  if (rows.length) await pool.query(`drop table ${rows.map((r) => r.t).join(', ')} cascade`)
}

/** Where the app is connected, without the credentials. */
export function dbTarget() {
  try { const u = new URL(DATABASE_URL); return `${u.hostname}:${u.port || 5432}${u.pathname}` } catch { return 'unknown' }
}
