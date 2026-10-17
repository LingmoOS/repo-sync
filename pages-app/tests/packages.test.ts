import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import {
  controlParagraphs,
  parsePackages,
  searchCatalog,
  safeObjectKey,
  fileUrl,
} from '../lib/packages.ts'
import { loadCatalog, suites } from '../lib/catalog.ts'
import { onRequestGet as packagesAPI } from '../functions/api/packages.ts'
import { onRequestGet as listAPI } from '../functions/api/list.ts'
import { onRequest as fileAPI } from '../functions/api/[[path]].ts'

const paragraph = (name = 'lingmo-desktop', arch = 'amd64') =>
  [
    'Package: ' + name,
    'Version: 1:2.0-1',
    'Architecture: ' + arch,
    'Section: x11',
    'Source: lingmo-shell (2.0-1)',
    'Maintainer: Lingmo Team',
    'Description: A thoughtful desktop environment',
    ' A longer description.',
    ' .',
    ' A second paragraph.',
    'Depends: libc6 (>= 2.38), libfoo | libbar',
    'Homepage: https://example.org',
    'Filename: pool/main/l/' + name + '/' + name + '_2.0-1_' + arch + '.deb',
    'Size: 2048',
    'Installed-Size: 10',
    'SHA256: ' + 'a'.repeat(64),
  ].join('\n')
const fixture = () => ({
  suite: 'stable',
  updatedAt: '2026-10-17T00:00:00Z',
  packages: [
    ...parsePackages(paragraph(), 'main'),
    ...parsePackages(paragraph('lingmo-icons', 'all'), 'main'),
    ...parsePackages(paragraph('lingmo-desktop-dev'), 'main'),
  ],
})

function makeBucket(text = paragraph(), compressed = true) {
  const path = 'main/binary-amd64/Packages' + (compressed ? '.gz' : '')
  const bytes = compressed ? gzipSync(text) : Buffer.from(text)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const release =
    'Suite: stable\nDate: Sat, 17 Oct 2026 00:00:00 UTC\nSHA256:\n ' +
    digest +
    ' ' +
    bytes.length +
    ' ' +
    path +
    '\n'
  const files = new Map<string, Buffer>([
    ['dists/stable/Release', Buffer.from(release)],
    ['dists/stable/' + path, bytes],
  ])
  const calls: string[] = []
  const bucket = {
    async get(key: string) {
      calls.push(key)
      const bytes = files.get(key)
      return bytes
        ? {
            size: bytes.length,
            uploaded: new Date('2026-10-17T00:00:00Z'),
            body: new Response(bytes).body!,
            text: async () => bytes.toString(),
          }
        : null
    },
  } as unknown as R2Bucket
  return { bucket, files, calls, path }
}

test('Debian paragraphs preserve multiline descriptions and blank continuation lines', () => {
  const pkg = parsePackages(paragraph().replaceAll('\n', '\r\n'), 'main')[0]
  assert.equal(
    pkg.description,
    'A thoughtful desktop environment\nA longer description.\n\nA second paragraph.',
  )
  assert.equal(pkg.source, 'lingmo-shell')
  assert.equal(pkg.installedSize, 10240)
  assert.equal(pkg.depends, 'libc6 (>= 2.38), libfoo | libbar')
  assert.equal(controlParagraphs(paragraph() + '\n\n' + paragraph('another')).length, 2)
})
test('reject unsafe download paths and incomplete package records', () => {
  assert.equal(parsePackages('Package: missing\nVersion: 1', 'main').length, 0)
  assert.equal(parsePackages(paragraph().replace('pool/main/l/', 'pool/../'), 'main').length, 0)
  assert.equal(safeObjectKey('keys/lingmo.asc'), true)
  for (const key of [
    '../secret',
    'pool/../secret',
    'pool/./secret',
    'pool/x\\secret',
    'keys/x\nfile',
  ])
    assert.equal(safeObjectKey(key), false)
  assert.equal(fileUrl('pool/a+b_1:2.deb'), '/api/file/pool/a%2Bb_1%3A2.deb')
})
test('name search ranks exact names first and supports exact matching', () => {
  assert.equal(searchCatalog(fixture(), new URLSearchParams('q=lingmo-desktop')).total, 2)
  const result = searchCatalog(fixture(), new URLSearchParams('q=lingmo-desktop&exact=true'))
  assert.equal(result.total, 1)
  assert.equal(result.packages[0].name, 'lingmo-desktop')
})
test('description, source, architecture and section filters', () => {
  assert.equal(
    searchCatalog(fixture(), new URLSearchParams('q=thoughtful&mode=description')).total,
    3,
  )
  assert.equal(
    searchCatalog(fixture(), new URLSearchParams('q=lingmo-shell&mode=source&exact=true')).total,
    3,
  )
  assert.equal(searchCatalog(fixture(), new URLSearchParams('arch=arm64')).total, 1)
  assert.equal(searchCatalog(fixture(), new URLSearchParams('section=admin')).total, 0)
  assert.equal(
    searchCatalog(fixture(), new URLSearchParams('package=lingmo-icons&q=other&arch=amd64')).total,
    1,
  )
})
test('pagination clamps invalid/out-of-range pages and returns all metadata', () => {
  const catalog = fixture()
  catalog.packages = Array.from({ length: 47 }, (_, i) => ({
    ...catalog.packages[0],
    name: 'pkg-' + String(i).padStart(2, '0'),
  }))
  assert.equal(searchCatalog(catalog, new URLSearchParams('page=2')).packages.length, 20)
  assert.equal(searchCatalog(catalog, new URLSearchParams('page=999')).packages.length, 7)
  assert.equal(searchCatalog(catalog, new URLSearchParams('page=NaN')).page, 1)
  assert.equal(searchCatalog(catalog, new URLSearchParams('page=-5')).page, 1)
  assert.equal(searchCatalog(catalog, new URLSearchParams()).packageCount, 47)
})
for (const compressed of [true, false])
  test(
    'loads and verifies ' + (compressed ? 'gzip' : 'plain') + ' Packages from Release manifest',
    async () => {
      const { bucket } = makeBucket(paragraph(), compressed)
      const catalog = await loadCatalog(bucket, 'stable')
      assert.equal(catalog.packages[0].name, 'lingmo-desktop')
      assert.equal(catalog.updatedAt, '2026-10-17T00:00:00.000Z')
    },
  )
test('cache avoids repeat index downloads and never crosses bucket bindings', async () => {
  const a = makeBucket(),
    b = makeBucket(paragraph('other-package'))
  await loadCatalog(a.bucket, 'stable')
  await loadCatalog(a.bucket, 'stable')
  assert.equal(a.calls.length, 2)
  assert.equal((await loadCatalog(b.bucket, 'stable')).packages[0].name, 'other-package')
})
test('mixed release/index updates fail closed and can be retried', async () => {
  const { bucket, files, path } = makeBucket()
  const original = files.get('dists/stable/' + path)!
  files.set('dists/stable/' + path, Buffer.alloc(original.length))
  await assert.rejects(loadCatalog(bucket, 'stable'), /正在更新/)
  files.set('dists/stable/' + path, original)
  assert.equal((await loadCatalog(bucket, 'stable')).packages.length, 1)
})
test('missing index, invalid suite, and missing Release return clear errors', async () => {
  const { bucket, files, path, calls } = makeBucket()
  await assert.rejects(loadCatalog(bucket, '../keys'), /名称无效/)
  assert.equal(calls.length, 0)
  await assert.rejects(loadCatalog(bucket, 'testing'), /尚未发布/)
  files.delete('dists/stable/' + path)
  await assert.rejects(loadCatalog(bucket, 'stable'), /正在更新/)
})
test('rejects decompression bombs before unlimited memory growth', async () => {
  const { bucket } = makeBucket('X'.repeat(8 * 1024 * 1024 + 1))
  await assert.rejects(loadCatalog(bucket, 'stable'), /容量/)
})
test('suite discovery follows R2 pagination and prioritizes stable', async () => {
  const seen: (string | undefined)[] = []
  const bucket = {
    list: async ({ cursor }: { cursor?: string }) => {
      seen.push(cursor)
      return cursor
        ? { delimitedPrefixes: ['dists/stable/'], truncated: false }
        : {
            delimitedPrefixes: ['dists/testing/', 'dists/lithium/'],
            truncated: true,
            cursor: 'next',
          }
    },
  } as unknown as R2Bucket
  assert.deepEqual(await suites(bucket), ['stable', 'testing', 'lithium'])
  assert.deepEqual(seen, [undefined, 'next'])
})
test('packages API returns searched data and controlled failures', async () => {
  const { bucket } = makeBucket()
  const response = await packagesAPI({
    request: new Request('https://test/api/packages?suite=stable&q=desktop'),
    env: { REPO_BUCKET: bucket },
  } as never)
  assert.equal(response.status, 200)
  assert.equal(((await response.json()) as any).total, 1)
  const missing = await packagesAPI({
    request: new Request('https://test/api/packages?suite=testing'),
    env: { REPO_BUCKET: bucket },
  } as never)
  assert.equal(missing.status, 503)
})
test('archive API returns cursor and excludes unrelated bucket contents', async () => {
  const bucket = {
    list: async (opts: any) => {
      assert.equal(opts.cursor, 'next')
      return {
        objects: [],
        delimitedPrefixes: ['pool/', 'private/'],
        truncated: true,
        cursor: 'last',
      }
    },
  }
  const response = await listAPI({
    request: new Request('https://test/api/list?cursor=next'),
    env: { REPO_BUCKET: bucket },
  } as never)
  assert.deepEqual(await response.json(), {
    prefix: '',
    objects: [],
    dirs: ['pool/'],
    cursor: 'last',
  })
})
test('file endpoint decodes object keys once and supports range/HEAD', async () => {
  const object = {
    size: 10,
    httpEtag: '"abc"',
    uploaded: new Date(),
    range: { offset: 2, length: 3 },
    writeHttpMetadata(h: Headers) {
      h.set('content-type', 'application/octet-stream')
    },
  }
  const bucket = {
    async get(key: string) {
      assert.equal(key, 'pool/a+b.deb')
      return { ...object, body: new Response('abc').body }
    },
    async head() {
      return { ...object, range: undefined }
    },
  }
  const get = await fileAPI({
    request: new Request('https://test/api/file/pool/a%2Bb.deb', {
      headers: { Range: 'bytes=2-4' },
    }),
    env: { REPO_BUCKET: bucket },
  } as never)
  assert.equal(get.status, 206)
  assert.equal(get.headers.get('content-range'), 'bytes 2-4/10')
  assert.equal(await get.text(), 'abc')
  const head = await fileAPI({
    request: new Request('https://test/api/file/pool/a%2Bb.deb', { method: 'HEAD' }),
    env: { REPO_BUCKET: bucket },
  } as never)
  assert.equal(head.headers.get('content-length'), '10')
  assert.equal(await head.text(), '')
})
