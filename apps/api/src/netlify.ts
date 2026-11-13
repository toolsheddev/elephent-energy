/* Netlify Function entry. scripts/build-netlify.mjs bundles this file into netlify/functions/api.js.
   Netlify sends the request as a Lambda-style event; Fastify's inject() runs it through the same routes as the normal server. */
import { buildApp } from './app'

interface NetlifyEvent {
  httpMethod: string
  path: string
  rawQuery?: string
  headers: Record<string, string | undefined>
  body: string | null
  isBase64Encoded?: boolean
}

let ready: ReturnType<typeof buildApp> | undefined
const PREFIX = '/.netlify/functions/api'

export async function handler(event: NetlifyEvent) {
  try {
    ready ??= buildApp().then(async (app) => { await app.ready(); return app })
    const app = await ready
    // /.netlify/functions/api/projects/1  or  /api/projects/1  ->  /api/projects/1
    let path = event.path.startsWith(PREFIX) ? event.path.slice(PREFIX.length) : event.path
    if (!path.startsWith('/api')) path = '/api' + path
    const res = await app.inject({
      method: event.httpMethod as 'GET',
      url: path + (event.rawQuery ? `?${event.rawQuery}` : ''),
      headers: event.headers as Record<string, string>,
      payload: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined,
    })
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined && !['content-length', 'transfer-encoding', 'connection'].includes(k)) headers[k] = String(v)
    return { statusCode: res.statusCode, headers, body: res.body }
  } catch (e) {
    ready = undefined // try again on the next request
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: (e as Error).message }) }
  }
}
