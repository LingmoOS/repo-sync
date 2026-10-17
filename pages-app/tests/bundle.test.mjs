import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import worker from '../dist/_worker.js/index.js'

const env = {
  REPO_BUCKET: {
    async list() {
      return { delimitedPrefixes: ['dists/stable/'], objects: [], truncated: false }
    },
    async head() {
      return null
    },
    async get() {
      return null
    },
  },
  ASSETS: {
    async fetch() {
      return new Response('<!DOCTYPE html><div id="root"></div>', {
        headers: { 'content-type': 'text/html' },
      })
    },
  },
}
const context = { waitUntil() {}, passThroughOnException() {} }

test('build output contains executable API worker and invocation routes', async () => {
  const routes = JSON.parse(
    await readFile(new URL('../dist/_routes.json', import.meta.url), 'utf8'),
  )
  assert.deepEqual(routes.include, ['/api/*'])
  assert.deepEqual(routes.exclude, [])
  assert.equal(typeof worker.fetch, 'function')
})
test('compiled /api/catalog invokes the API instead of the HTML fallback', async () => {
  const response = await worker.fetch(new Request('https://site.test/api/catalog'), env, context)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual((await response.json()).suites, ['stable'])
})
test('compiled package API returns JSON even when the index is missing', async () => {
  const response = await worker.fetch(
    new Request('https://site.test/api/packages?suite=stable'),
    env,
    context,
  )
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.match((await response.json()).error, /Release/)
})
test('compiled download and unknown API paths do not fall through to SPA HTML', async () => {
  for (const path of ['/api/file/dists/stable/Release', '/api/unknown']) {
    const response = await worker.fetch(new Request('https://site.test' + path), env, context)
    assert.equal(response.status, 404)
    assert.equal(await response.text(), 'Not Found')
  }
})
test('compiled worker preserves static frontend fallback outside API paths', async () => {
  const response = await worker.fetch(new Request('https://site.test/'), env, context)
  assert.match(response.headers.get('content-type'), /text\/html/)
})
