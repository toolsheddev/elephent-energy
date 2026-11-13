/* npm run db:seed : create the tables, load the reference data, then the demo projects. */
import { sampleRefData } from '@sd/engine'
import { setRefData } from '@sd/domain/engine'
import { dbTarget, dropAll, migrate, pool } from './db'
import { loadRefData, saveRefData } from './refdata'
import { seedProjects } from './seed-projects'

console.log('Database:', dbTarget())
if (process.argv.includes('--reset')) await dropAll()
await migrate()
await saveRefData(sampleRefData)
setRefData(await loadRefData()) // build the demo projects from what is in the database
const n = await seedProjects()
const { rows } = await pool.query('select (select count(*) from equipment_new) eq, (select count(*) from systems_new) sys, (select count(*) from line_items_new) li')
console.log(`Seeded reference data and ${n} projects:`, rows[0])
await pool.end()
