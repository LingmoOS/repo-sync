import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Env = {
  REPO_BUCKET: R2Bucket
  REPO_TITLE: string
  REPO_PUBLIC_URL: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/list', async (c) => {
  const prefix = c.req.query('prefix') ?? ''
  const delimiter = c.req.query('delimiter') ?? '/'

  try {
    const result = await c.env.REPO_BUCKET.list({ prefix, delimiter, limit: 1000 })

    return c.json({
      prefix,
      objects: result.objects.map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded.toISOString(),
        etag: o.httpEtag,
        contentType: o.httpMetadata?.contentType ?? '',
      })),
      dirs: result.delimitedPrefixes,
      truncated: result.truncated,
    })
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

export const onRequest = handle(app)
