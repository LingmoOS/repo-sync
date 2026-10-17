import { safeObjectKey } from '../../lib/packages.ts'

export const onRequestGet: PagesFunction<{ REPO_BUCKET: R2Bucket }> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams
  const prefix = params.get('prefix') || ''
  if (prefix && !safeObjectKey(prefix))
    return Response.json({ error: '目录路径无效。' }, { status: 400 })
  try {
    const result = await env.REPO_BUCKET.list({
      prefix,
      delimiter: '/',
      limit: 200,
      cursor: params.get('cursor') || undefined,
    })
    return Response.json(
      {
        prefix,
        objects: result.objects
          .filter((o) => safeObjectKey(o.key))
          .map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() })),
        dirs: result.delimitedPrefixes.filter(safeObjectKey),
        cursor: result.truncated ? result.cursor : undefined,
      },
      { headers: { 'Cache-Control': 'public, max-age=30' } },
    )
  } catch {
    return Response.json({ error: '暂时无法读取此目录。' }, { status: 503 })
  }
}
