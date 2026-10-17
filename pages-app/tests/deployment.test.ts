import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyDeployment } from '../scripts/verify-deployment.mjs'

test('deployment check rejects HTTP 200 SPA fallback instead of treating it as a successful API', async () => {
  await assert.rejects(
    verifyDeployment(
      'https://test.pages.dev',
      async () => new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } }),
    ),
    /did not return JSON/,
  )
})
test('deployment check validates catalog, actual package response and Release download', async () => {
  const seen: string[] = []
  const result = await verifyDeployment('https://test.pages.dev', async (url: URL) => {
    seen.push(url.pathname)
    if (url.pathname === '/api/catalog')
      return Response.json({ title: 'Packages', suites: ['stable'] })
    if (url.pathname === '/api/packages') return Response.json({ packages: [], total: 0 })
    return new Response('Suite: stable\nSHA256:\n')
  })
  assert.equal(result.suites, 1)
  assert.deepEqual(seen, ['/api/catalog', '/api/packages', '/api/file/dists/stable/Release'])
})
test('deployment check rejects a missing R2 binding / API failure', async () => {
  await assert.rejects(
    verifyDeployment('https://test.pages.dev', async () =>
      Response.json({ error: 'unavailable' }, { status: 503 }),
    ),
    /unavailable/,
  )
})
