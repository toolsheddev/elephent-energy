// Local PostgreSQL for development, no Docker or admin rights needed.
//   node scripts/db.mjs init     create the cluster (first time), start it and create the database
//   node scripts/db.mjs start | stop | status | psql
// The cluster lives in .data/pg (git-ignored). Use any other Postgres by setting DATABASE_URL instead.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dataDir = join(root, '.data', 'pg')
const logFile = join(root, '.data', 'pg.log')
const PORT = process.env.PGPORT || '5433'
const DB = process.env.PGDATABASE || 'system_design'
const bin = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name)

function run(cmd, args, opts = {}) {
  const r = spawnSync(bin(cmd), args, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' })
  if (r.error) {
    console.error(`Could not run ${cmd}: ${r.error.message}\nInstall PostgreSQL (for example "scoop install postgresql") or set PG_BIN to its bin folder.`)
    process.exit(1)
  }
  return r
}

const isRunning = () => run('pg_ctl', ['-D', dataDir, 'status'], { quiet: true }).status === 0

function start() {
  if (isRunning()) return console.log(`Postgres already running on port ${PORT}`)
  // stdio is ignored on purpose: the server process would otherwise keep our output pipe open and this script would never exit
  const r = spawnSync(bin('pg_ctl'), ['-D', dataDir, '-o', `-p ${PORT}`, '-l', logFile, 'start', '-w'], { stdio: 'ignore' })
  if (r.status !== 0) { console.error('Postgres did not start. See', logFile); process.exit(r.status ?? 1) }
  console.log(`Postgres started on port ${PORT}`)
}

const cmd = process.argv[2]
switch (cmd) {
  case 'init': {
    mkdirSync(join(root, '.data'), { recursive: true })
    if (!existsSync(join(dataDir, 'PG_VERSION'))) {
      console.log('Creating the cluster in', dataDir)
      const r = run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'])
      if (r.status !== 0) process.exit(r.status ?? 1)
    }
    start()
    const exists = run('psql', ['-h', 'localhost', '-p', PORT, '-U', 'postgres', '-tAc', `select 1 from pg_database where datname='${DB}'`], { quiet: true })
    if (!String(exists.stdout).trim()) run('createdb', ['-h', 'localhost', '-p', PORT, '-U', 'postgres', DB])
    console.log(`Ready: postgres://postgres@localhost:${PORT}/${DB}`)
    break
  }
  case 'start': start(); break
  case 'stop': run('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast']); break
  case 'status': run('pg_ctl', ['-D', dataDir, 'status']); break
  case 'psql': run('psql', ['-h', 'localhost', '-p', PORT, '-U', 'postgres', DB, ...process.argv.slice(3)]); break
  default:
    console.log('usage: node scripts/db.mjs init | start | stop | status | psql [args]')
    process.exit(1)
}
