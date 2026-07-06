import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Env = {
  REPO_BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Env }>()

// Proxy any file from R2: GET /api/file/dists/stable/Release
app.get('/api/file/*', async (c) => {
  const key = c.req.path.replace(/^\/api\/file\//, '')

  if (!key) return c.text('Bad Request', 400)

  const obj = await c.env.REPO_BUCKET.get(key)
  if (!obj) return c.text('Not Found', 404)

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('cache-control', 'public, max-age=300')
  headers.set('access-control-allow-origin', '*')

  return new Response(obj.body, { headers })
})

export const onRequest = handle(app)
