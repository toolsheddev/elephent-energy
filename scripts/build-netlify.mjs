// Bundles the API into one CommonJS file, netlify/functions/api.js, which Netlify runs as a function.
import { build } from 'esbuild'

await build({
  entryPoints: ['apps/api/src/netlify.ts'],
  outfile: 'netlify/functions/api.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['pg-native'],
  banner: { js: "process.env.SERVERLESS = '1';" },
  logLevel: 'info',
})
