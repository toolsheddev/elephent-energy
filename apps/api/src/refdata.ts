import type { RefData } from '@sd/engine'
import { pool, tx, type Db } from './db'

/* Reference tables have real typed columns plus `extra` (jsonb) for engine fields without a column.
   Loading rebuilds the engine row: all columns (nulls dropped) merged with `extra`. */

type Row = Record<string, unknown>

const TABLES = {
  equipment: 'equipment_new',
  labor: 'labor_new',
  prices: 'prices_new',
  maintenancePlans: 'maintenance_plans_new',
  ahri: 'ahri_certifications_new',
  jurisdictionRules: 'jurisdiction_rules_new',
  permits: 'permits_new',
  incentives: 'incentives_new',
  incentiveLimits: 'incentive_limits_new',
} as const

/** Engine field name -> column name, where they differ. */
const RENAME: Partial<Record<string, Record<string, string>>> = {
  equipment_new: { additional_equipment_ids: 'additional_equipment' },
}

const stripNulls = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null))

export async function loadRefData(c: Db = pool): Promise<RefData> {
  const rows = async (table: string) => {
    const { rows } = await c.query<{ row: Row }>(`select to_jsonb(t) - 'extra' || coalesce(t.extra, '{}'::jsonb) as row from ${table} t order by id`)
    return rows.map(({ row }) => {
      const r = stripNulls(row)
      for (const [engine, col] of Object.entries(RENAME[table] ?? {})) if (r[col] !== undefined) { r[engine] = r[col]; delete r[col] }
      return r
    })
  }
  const out = {} as Record<string, Row[]>
  await Promise.all(Object.entries(TABLES).map(async ([key, table]) => { out[key] = await rows(table) }))
  return out as unknown as RefData
}

/** Replace the reference tables with the given rows. */
export async function saveRefData(ref: RefData) {
  await tx(async (c) => {
    await c.query(`truncate ${Object.values(TABLES).join(', ')} restart identity`)
    for (const [key, table] of Object.entries(TABLES)) {
      const data = ((ref as unknown as Record<string, Row[]>)[key] ?? []).map((r) => {
        const row = { ...r }
        for (const [engine, col] of Object.entries(RENAME[table] ?? {})) if (row[engine] !== undefined) { row[col] = row[engine]; delete row[engine] }
        return row
      })
      if (!data.length) continue
      const cols = (await c.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = current_schema() and table_name = $1", [table]))
        .rows.map((x) => x.column_name).filter((n) => n !== 'extra')
      // Columns that fill from the row's keys; every other key goes to `extra`.
      await c.query(
        `insert into ${table}
         select (jsonb_populate_record(null::${table}, r || jsonb_build_object('extra', r - $2::text[]))).*
           from jsonb_array_elements($1::jsonb) r`,
        [JSON.stringify(data), cols])
    }
  })
}
