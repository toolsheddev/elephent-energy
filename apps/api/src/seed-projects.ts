/* Loads the demo projects (built by the domain seed from the current reference data) into the database. */
import { buildSeed } from '@sd/domain/seed'
import { ELECTRIC_UTILITIES, GAS_UTILITIES } from '@sd/domain/options'
import { pool, tx } from './db'
import { seedBaseDesigns } from './basedesigns'
import { saveBundle } from './repo'

export async function seedProjects() {
  const bundles = Object.values(buildSeed())
  await tx(async (c) => {
    await c.query('truncate customers_new, projects_new, houses_new, users, project_profile, existing_systems, proposals_new, systems_new, line_items_new, invoices_new, invoice_line_items_new, deposit_config cascade')
    // Ids for rows created while saving (project managers); the sequence is moved past the seed ids below
    const spare = (() => { let n = 50_000_000; return () => n++ })()
    for (const b of bundles) await saveBundle(c, b, spare)
    // Lookup tables the Retool app has. Sample rows: the utilities the UI offers, and the zip codes of the demo homes.
    await c.query('truncate utilities_new, zipcode_mapping')
    const names = [...new Set([...GAS_UTILITIES, ...ELECTRIC_UTILITIES])]
    for (const [i, n] of names.entries()) {
      // SAMPLE: which utilities Bayou supports is Retool data we were not given; these three are made up so the eligibility rule has something to work with
      const bayou = ['Xcel Energy', 'Eversource', 'National Grid'].includes(n) ? n.toLowerCase().replace(/\s+/g, '_') : null
      await c.query('insert into utilities_new(id, utility_name, is_gas, is_electrical, bayou_utility_name) values ($1,$2,$3,$4,$5)', [i + 1, n, GAS_UTILITIES.includes(n), ELECTRIC_UTILITIES.includes(n), bayou])
    }
    const zips = new Map<string, { zip: number; city: string; county: string; state: string }>()
    for (const b of bundles) if (b.house && Number(b.house.zipcode)) zips.set(b.house.zipcode, { zip: Number(b.house.zipcode), city: b.house.city, county: b.house.county, state: b.house.state })
    let zid = 1
    for (const z of zips.values()) {
      await c.query('insert into zipcode_mapping(id, zipcode, city, county, state, territory, install_territory, manual_j_required) values ($1,$2,$3,$4,$5,$6,$6,false)', [zid++, z.zip, z.city, z.county, z.state, z.state])
    }
    await c.query('truncate ahri_configurations')
    await seedBaseDesigns(c, bundles[0])
    // New rows get ids above anything the seed used
    const ids = Math.max(...bundles.flatMap((b) => [b.project.id, ...b.proposals.map((p) => p.id), ...b.systems.map((s) => s.id), ...b.lineItems.map((l) => l.id), ...b.invoices.map((i) => i.id), ...b.invoiceLines.map((l) => l.id)]))
    await c.query("select setval('app_id_seq', $1, false)", [Math.ceil((ids + 1000) / 1000) * 1000 + 100000])
  })
  return bundles.length
}

export { pool }
