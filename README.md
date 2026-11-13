# System Design (React rebuild of the Retool app)

Pitch prototype of Elephant Energy's System Design tool.

```
apps/web          React 19 + Vite + TypeScript + Tailwind v4 (desktop-first UI)
packages/engine   @sd/engine: pure TypeScript port of the Retool workflows (pricing, specs, permits)
legacy/           Extracted Retool workflow source, for reference and diffing
```

## Run

```bash
npm install
npm run db:init    # first time: local PostgreSQL cluster in .data/pg (port 5433) + database
npm run db:seed    # tables, reference data (catalog, prices, incentives) and 16 demo projects
npm run dev        # API on :3001 and web on :5173 (the web dev server proxies /api)
npm run test       # engine tests
```

### Database: Supabase (or any Postgres)
1. Create a Supabase project and copy the **Session pooler** connection string.
2. `cp .env.example .env` and set `DATABASE_URL` to it (TLS is switched on automatically for non-local hosts).
3. `npm run db:seed -- --reset` creates the tables and loads sample data. `npm run dev` starts the API and web app.

Without a `.env`, the API uses the local cluster from `npm run db:init` (needs PostgreSQL binaries on PATH, or set `PG_BIN`).
`db:seed` without `--reset` keeps the tables and replaces the data. "Reset demo data" in the UI restores the sample projects.

The schema (`apps/api/db/schema.sql`) follows the Retool database: columns marked `seen` come from screenshots and an export,
`inferred` from the Retool queries, and `APP` tables/columns are additions (listed in the file). All data in the seed is invented.

`npm run verify` drives every System Design action (create, price, edit, finalize, change orders, invoices, financing fee, cost breakdown) against the configured database using a throwaway project, and prints one line per check.

`apps/api` (Fastify + pg) loads a project, applies each change with the shared `@sd/domain` logic and writes it back in one transaction.
The web app's `src/lib/api.ts` is a thin HTTP client; catalog and prices are fetched from `/api/refdata` before the app mounts.
Schema: `apps/api/db/schema.sql`.

All customers, addresses and prices in the seed are invented sample data.

## Deploying (free, no card)

Everything runs on one Netlify site: the web app is static, and the API is a Netlify Function (`apps/api/src/netlify.ts`, bundled by `scripts/build-netlify.mjs`). `netlify.toml` wires it up, so `/api/*` on the site reaches the function.

1. Netlify > Add new site > Import from Git > pick this repo. The build settings come from `netlify.toml`.
2. Site configuration > Environment variables: add `DATABASE_URL` (the Supabase session pooler URL from your `.env`). Do not set `VITE_API_URL`.
3. Deploy. Then open `https://<your-site>.netlify.app/api/health`. It should show `{"ok":true,...}`.

Notes: this is a demo setup. The function runs in Netlify's default region, so each action can take a second or two; the first request after a quiet period is slower still. A function call is limited to about 10 seconds. There is no login, so anyone with the link can read and change the data.
