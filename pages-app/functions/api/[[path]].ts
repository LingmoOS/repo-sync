import { safeObjectKey } from '../../lib/packages.ts'

export const onRequest: PagesFunction<{ REPO_BUCKET: R2Bucket }> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  const path = new URL(request.url).pathname
  if (!path.startsWith('/api/file/')) return new Response('Not Found', { status: 404 })
  let key: string
  try {
    key = decodeURIComponent(path.slice('/api/file/'.length))
  } catch {
    return new Response('Bad Request', { status: 400 })
  }
  if (!safeObjectKey(key)) return new Response('Bad Request', { status: 400 })
  try {
    const object =
      request.method === 'HEAD'
        ? await env.REPO_BUCKET.head(key)
        : await env.REPO_BUCKET.get(key, { range: request.headers })
    if (!object) return new Response('Not Found', { status: 404 })
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('last-modified', object.uploaded.toUTCString())
    headers.set('cache-control', 'public, max-age=' + (key.startsWith('pool/') ? '3600' : '60'))
    headers.set('x-content-type-options', 'nosniff')
    headers.set('accept-ranges', 'bytes')
    const filename = encodeURIComponent(key.split('/').pop() || 'download')
    headers.set('content-disposition', "attachment; filename*=UTF-8''" + filename)
    const body = 'body' in object ? (object as R2ObjectBody).body : null
    if (request.headers.get('if-none-match') === object.httpEtag) {
      if (body) await body.cancel()
      return new Response(null, { status: 304, headers })
    }
    let status = 200
    let length = object.size
    if ('range' in object && object.range) {
      const range = object.range
      const start = 'suffix' in range ? Math.max(0, object.size - range.suffix) : range.offset || 0
      length =
        'suffix' in range
          ? Math.min(range.suffix, object.size)
          : Math.min(range.length ?? object.size - start, object.size - start)
      headers.set(
        'content-range',
        'bytes ' + start + '-' + (start + length - 1) + '/' + object.size,
      )
      status = 206
    }
    headers.set('content-length', String(length))
    return new Response(body, { status, headers })
  } catch {
    return new Response('文件暂时不可用，请稍后重试。', { status: 503 })
  }
}
