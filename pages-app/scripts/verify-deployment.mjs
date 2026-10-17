import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export async function verifyDeployment(origin, request = fetch) {
  async function json(path) {
    const response = await request(new URL(path, origin), {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15000),
    })
    if (!(response.headers.get('content-type') || '').includes('application/json'))
      throw new Error(
        path +
          ' did not return JSON (HTTP ' +
          response.status +
          '); check the deployed Worker and API routes',
      )
    const data = await response.json()
    if (!response.ok) throw new Error(path + ': ' + (data.error || response.status))
    return data
  }
  const config = await json('/api/catalog')
  if (!Array.isArray(config.suites) || typeof config.title !== 'string')
    throw new Error('Invalid catalog response')
  if (config.suites.length) {
    const suite = config.suites.includes('stable') ? 'stable' : config.suites[0]
    const packages = await json('/api/packages?suite=' + encodeURIComponent(suite))
    if (!Array.isArray(packages.packages) || typeof packages.total !== 'number')
      throw new Error('Invalid package search response')
    const response = await request(
      new URL('/api/file/dists/' + encodeURIComponent(suite) + '/Release', origin),
      { signal: AbortSignal.timeout(15000) },
    )
    if (!response.ok || !/^SHA256:/m.test(await response.text()))
      throw new Error('Release download did not return an APT index')
    return { suites: config.suites.length, suite, total: packages.total }
  }
  return { suites: 0 }
}

async function main() {
  let url = process.argv[2]
  if (url === '--log') {
    const log = await readFile(process.argv[3], 'utf8')
    url = [...log.matchAll(/https:\/\/[a-z0-9.-]+\.pages\.dev/gi)].at(-1)?.[0]
  }
  if (!url || !/^https:\/\//.test(url))
    throw new Error('Provide a deployment HTTPS URL or --log <wrangler log>')
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const result = await verifyDeployment(url)
      console.log('Deployment API verified:', url, JSON.stringify(result))
      return
    } catch (error) {
      if (attempt === 6) throw error
      console.warn('Deployment not ready (' + attempt + '/6):', error.message)
      await delay(5000)
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
