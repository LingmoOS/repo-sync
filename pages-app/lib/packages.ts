import type { Catalog, PackageRecord, SearchResult } from '../shared/packages.ts'

// Debian control paragraphs: indented lines continue the preceding field;
// a single dot in Description represents a paragraph break.
export function controlParagraphs(text: string): Record<string, string>[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .filter((s) => s.trim())
    .map((block) => {
      const fields: Record<string, string> = Object.create(null)
      let key = ''
      for (const line of block.split('\n')) {
        if (/^[ \t]/.test(line) && key) {
          const continuation = line.slice(1)
          fields[key] += '\n' + (continuation === '.' ? '' : continuation)
        } else {
          const match = /^([A-Za-z0-9-]+):[ \t]*(.*)$/.exec(line)
          key = match?.[1] ?? ''
          if (match) fields[key] = match[2]
        }
      }
      return fields
    })
}

export function safeObjectKey(key: string): boolean {
  return (
    /^(pool|dists|keys)\//.test(key) &&
    !key.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(key) &&
    !key.split('/').some((part) => part === '..' || part === '.')
  )
}

export function parsePackages(text: string, component: string): PackageRecord[] {
  return controlParagraphs(text).flatMap((f) => {
    if (
      !f.Package ||
      !f.Version ||
      !f.Architecture ||
      !f.Filename ||
      !/^[a-z0-9][a-z0-9+.-]*$/.test(f.Package) ||
      !f.Filename.startsWith('pool/') ||
      !safeObjectKey(f.Filename)
    )
      return []
    const description = f.Description ?? ''
    const numeric = (value: string | undefined) => (/^\d+$/.test(value ?? '') ? Number(value) : 0)
    return [
      {
        name: f.Package,
        version: f.Version,
        architecture: f.Architecture,
        component,
        section: f.Section || 'other',
        summary: description.split('\n')[0],
        description,
        source: (f.Source || f.Package).split(/\s/)[0],
        maintainer: f.Maintainer || '',
        homepage: /^https?:\/\//i.test(f.Homepage || '') ? f.Homepage : '',
        depends: f.Depends || '',
        recommends: f.Recommends || '',
        suggests: f.Suggests || '',
        provides: f.Provides || '',
        filename: f.Filename,
        size: numeric(f.Size),
        installedSize: numeric(f['Installed-Size']) * 1024,
        sha256: f.SHA256 || '',
      },
    ]
  })
}

export function searchCatalog(catalog: Catalog, params: URLSearchParams): SearchResult {
  const query = (params.get('q') || '').trim().toLowerCase().slice(0, 200)
  const packageName = params.get('package') || ''
  const architecture = params.get('arch') || ''
  const section = params.get('section') || ''
  const exact = params.get('exact') === 'true'
  const mode = params.get('mode') || 'name'
  const filtered = catalog.packages
    .filter((p) => {
      if (packageName) return p.name === packageName
      if (architecture && p.architecture !== architecture && p.architecture !== 'all') return false
      if (section && p.section !== section) return false
      if (!query) return true
      if (mode === 'source')
        return exact ? p.source.toLowerCase() === query : p.source.toLowerCase().includes(query)
      if (mode === 'description')
        return (p.name + ' ' + p.description).toLowerCase().includes(query)
      return exact ? p.name.toLowerCase() === query : p.name.toLowerCase().includes(query)
    })
    .sort((a, b) => {
      // Exact package names precede prefixes and substring matches.
      const rank = (p: PackageRecord) => (p.name === query ? 0 : p.name.startsWith(query) ? 1 : 2)
      return (
        rank(a) - rank(b) ||
        a.name.localeCompare(b.name) ||
        a.architecture.localeCompare(b.architecture) ||
        a.version.localeCompare(b.version)
      )
    })
  const pageSize = packageName ? 100 : 20
  const requested = Number(params.get('page') || '1')
  const page = Math.min(
    Math.max(1, Math.ceil(filtered.length / pageSize)),
    Number.isSafeInteger(requested) && requested > 0 ? requested : 1,
  )
  return {
    suite: catalog.suite,
    updatedAt: catalog.updatedAt,
    total: filtered.length,
    packageCount: new Set(catalog.packages.map((p) => p.name)).size,
    page,
    pageSize,
    architectures: [...new Set(catalog.packages.map((p) => p.architecture))].sort(),
    sections: [...new Set(catalog.packages.map((p) => p.section))].sort(),
    packages: filtered.slice((page - 1) * pageSize, page * pageSize),
  }
}

export function fileUrl(key: string): string {
  return '/api/file/' + key.split('/').map(encodeURIComponent).join('/')
}
