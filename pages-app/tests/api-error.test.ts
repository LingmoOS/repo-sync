import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeApiResponse } from '../src/apiError.ts'

const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } })

test('JSON API responses are accepted', () => {
  assert.equal(describeApiResponse(json('{"title":"Lingmo Packages"}')), null)
})

test('SPA HTML fallback produces an actionable error instead of a generic one', () => {
  const message = describeApiResponse(
    new Response('<!DOCTYPE html><div id="root"></div>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  )
  assert.ok(message)
  assert.match(message, /网站数据服务暂时不可用/)
  assert.match(message, /HTTP 200/)
  assert.match(message, /HTML 页面/)
  assert.match(message, /Pages Functions/)
})

test('non-JSON API failures keep their HTTP status in the message', () => {
  const message = describeApiResponse(
    new Response('bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } }),
  )
  assert.ok(message)
  assert.match(message, /HTTP 502/)
  assert.match(message, /非 JSON 内容/)
})
