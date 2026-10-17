import type { Catalog } from '../shared/packages.ts'
import { controlParagraphs, parsePackages } from './packages.ts'

export class CatalogError extends Error {}
const MAX_BYTES = 8 * 1024 * 1024
const TTL = 60_000
// Cache at most two suites per isolate; key includes the actual bucket binding.
const caches = new WeakMap<R2Bucket, Map<string, { until: number; value: Promise<Catalog> }>>()

export async function suites(bucket: R2Bucket): Promise<string[]> {
  const names: string[] = []
  let cursor: string | undefined
  do {
    const result = await bucket.list({ prefix: 'dists/', delimiter: '/', cursor })
    names.push(
      ...result.delimitedPrefixes
        .map((p) => p.slice(6, -1))
        .filter((p) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p)),
    )
    cursor = result.truncated ? result.cursor : undefined
  } while (cursor)
  const preferred = ['stable', 'testing', 'unstable', 'experimental']
  return [...new Set(names)].sort((a, b) => {
    const rank = (name: string) => (preferred.includes(name) ? preferred.indexOf(name) : 4)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
}

async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<ArrayBuffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > limit)
        throw new CatalogError('软件包索引超过在线检索容量，请缩小仓库或使用独立搜索服务。')
      chunks.push(result.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}

async function readCatalog(bucket: R2Bucket, suite: string): Promise<Catalog> {
  const release = await bucket.get('dists/' + suite + '/Release')
  if (!release) throw new CatalogError('此发行分支尚未发布 Release 索引。')
  if (release.size > 1024 * 1024) throw new CatalogError('Release 索引过大。')
  const fields = controlParagraphs(await release.text())[0] || {}
  const indexes = new Map<string, { path: string; digest: string; size: number }>()
  for (const line of (fields.SHA256 || '').split('\n')) {
    const entry = /^\s*([a-fA-F0-9]{64})\s+(\d+)\s+(\S+)\s*$/.exec(line)
    if (!entry) continue
    const match = /^([a-zA-Z0-9_-]+)\/binary-([a-zA-Z0-9_-]+)\/Packages(\.gz)?$/.exec(entry[3])
    if (!match) continue
    const key = match[1] + '/' + match[2]
    // Prefer gzip; the Release manifest determines which indexes are current.
    if (!indexes.has(key) || match[3])
      indexes.set(key, { path: entry[3], digest: entry[1].toLowerCase(), size: Number(entry[2]) })
  }
  if (!indexes.size) throw new CatalogError('没有找到可检索的 Packages 或 Packages.gz 索引。')
  let totalBytes = 0
  const records = new Map<string, Catalog['packages'][number]>()
  for (const index of indexes.values()) {
    if (index.size > MAX_BYTES) throw new CatalogError('软件包索引超过在线检索容量。')
    const object = await bucket.get('dists/' + suite + '/' + index.path)
    if (!object || object.size !== index.size)
      throw new CatalogError('仓库索引正在更新，请稍后重试。')
    const compressed = await boundedBytes(object.body, MAX_BYTES)
    const hash = await crypto.subtle.digest('SHA-256', compressed)
    const digest = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (digest !== index.digest) throw new CatalogError('仓库索引正在更新，请稍后重试。')
    const body = index.path.endsWith('.gz')
      ? await boundedBytes(
          new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
          MAX_BYTES - totalBytes,
        )
      : compressed
    totalBytes += body.byteLength
    if (totalBytes > MAX_BYTES) throw new CatalogError('软件包索引超过在线检索容量。')
    for (const pkg of parsePackages(new TextDecoder().decode(body), index.path.split('/')[0])) {
      records.set([pkg.component, pkg.name, pkg.version, pkg.architecture].join('/'), pkg)
    }
  }
  const date = new Date(fields.Date || release.uploaded)
  return {
    suite,
    updatedAt: Number.isNaN(date.getTime()) ? release.uploaded.toISOString() : date.toISOString(),
    packages: [...records.values()],
  }
}

export async function loadCatalog(bucket: R2Bucket, suite: string): Promise<Catalog> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(suite)) throw new CatalogError('发行分支名称无效。')
  let cache = caches.get(bucket)
  if (!cache) {
    cache = new Map()
    caches.set(bucket, cache)
  }
  const cached = cache.get(suite)
  if (cached && cached.until > Date.now()) return cached.value
  if (cache.size >= 2) cache.delete(cache.keys().next().value!)
  const value = readCatalog(bucket, suite)
  const entry = { until: Date.now() + TTL, value }
  cache.set(suite, entry)
  try {
    return await value
  } catch (error) {
    if (cache.get(suite) === entry) cache.delete(suite)
    throw error
  }
}
