import { suites } from '../../lib/catalog.ts'

export interface Env {
  REPO_BUCKET: R2Bucket
  REPO_TITLE?: string
  REPO_PUBLIC_URL?: string
}
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [names, key] = await Promise.all([
      suites(env.REPO_BUCKET),
      env.REPO_BUCKET.head('keys/lingmo.asc'),
    ])
    let publicUrl = ''
    try {
      const url = new URL(env.REPO_PUBLIC_URL || '')
      if (url.protocol === 'https:') publicUrl = url.href.replace(/\/$/, '')
    } catch {
      /* Optional public endpoint. */
    }
    return Response.json(
      {
        title: env.REPO_TITLE || 'Lingmo Packages',
        suites: names,
        publicUrl,
        signingKey: Boolean(key),
      },
      {
        headers: { 'Cache-Control': 'public, max-age=60' },
      },
    )
  } catch {
    return Response.json({ error: '暂时无法读取仓库，请稍后重试。' }, { status: 503 })
  }
}
