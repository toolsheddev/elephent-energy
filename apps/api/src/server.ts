import { buildApp } from './app'
import { dbTarget } from './db'

async function main() {
  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`API listening on http://localhost:${port}, database ${dbTarget()}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
