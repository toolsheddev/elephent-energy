import cors from '@fastify/cors'
import Fastify from 'fastify'
import { setRefData } from '@sd/domain/engine'
import { migrate, pool } from './db'
import { listBaseDesigns } from './basedesigns'
import { createProject, deleteProject, type NewProjectInput } from './projects'
import { loadRefData } from './refdata'
import { listProjects, loadBundle } from './repo'
import { seedProjects } from './seed-projects'
import { NotFound, perform } from './service'

/** Builds the API (routes, error handling, reference data). Used by the long-running server and by the serverless entry. */
export async function buildApp() {
  // In a serverless function the schema is already in the database, and the schema file is not bundled
  if (!process.env.SERVERLESS) await migrate()
  const ref = await loadRefData()
  if (!ref.equipment.length) console.warn('Reference tables are empty. Run "npm run db:seed".')
  setRefData(ref)

  const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 8 * 1024 * 1024 })
  await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] })

  app.setErrorHandler((err: Error, _req, reply) => {
    const status = err instanceof NotFound ? 404 : 400
    if (status === 400) app.log.error(err)
    reply.status(status).send({ error: err.message })
  })

  app.get('/api/health', async () => ({ ok: true, projects: (await pool.query('select count(*)::int n from projects_new')).rows[0].n }))
  app.get('/api/refdata', async () => ref)
  app.get('/api/projects', async () => listProjects())
  app.get('/api/base-designs', async () => listBaseDesigns())
  app.post<{ Body: NewProjectInput }>('/api/projects', async (req) => ({ id: await createProject(req.body) }))
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    if (!(await deleteProject(Number(req.params.id)))) throw new NotFound(`Project ${req.params.id} not found`)
    return { value: true }
  })
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const b = await loadBundle(Number(req.params.id))
    if (!b) throw new NotFound(`Project ${req.params.id} not found`)
    return b
  })
  app.post<{ Params: { id: string; action: string }; Body: { args?: unknown[] } }>('/api/projects/:id/:action', async (req) => {
    const value = await perform(Number(req.params.id), req.params.action, req.body?.args ?? [])
    return { value: value ?? null }
  })
  app.post('/api/admin/reset', async () => { await seedProjects(); return { value: true } })

  return app
}
