import { readFile, writeFile, rm, lstat } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'

const project = resolve(import.meta.dirname, '..')
const source = resolve(project, '.functions-build', 'index.js')
const target = resolve(project, 'dist', '_worker.js')
const relativeTarget = relative(resolve(project, 'dist'), target)
if (relativeTarget.startsWith('..' + sep) || relativeTarget === '..') throw new Error('Worker output escaped dist')
const worker = await readFile(source, 'utf8')
if (!worker.includes('pages_template_worker_default') || !worker.includes('routePath: "/api/catalog"')) {
  throw new Error('Compiled Pages Worker is missing the package API routes')
}
const targetInfo = await lstat(target).catch(() => null)
if (targetInfo?.isDirectory()) await rm(target, { recursive: true, force: true })
else if (targetInfo) await rm(target, { force: true })
await writeFile(target, worker)
// Wrangler can leave a second standalone functions bundle beside the static files.
// It is not part of the site; the Pages Worker lives at dist/_worker.js.
const stray = resolve(project, 'dist', 'index.js')
const strayInfo = await lstat(stray).catch(() => null)
if (strayInfo?.isFile()) await rm(stray, { force: true })
console.log('Built Pages Worker:', target)
