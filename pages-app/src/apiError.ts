/**
 * Cloudflare Pages 在没有顶层 404.html 时会把未命中的路径回退到 `/`（SPA），
 * 因此 Pages Functions 未生效或触发 Fail open 时，/api/* 会返回 index.html。
 * 把这种情况转成可诊断的错误信息，而不是笼统的“服务不可用”。
 */
export function describeApiResponse(response: Response): string | null {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return null
  const kind = contentType.includes('text/html') ? 'HTML 页面' : '非 JSON 内容'
  return (
    '网站数据服务暂时不可用，请稍后重试（HTTP ' +
    response.status +
    ' 返回' +
    kind +
    '，说明 Cloudflare Pages Functions 未生效或已达免费额度上限）。'
  )
}
