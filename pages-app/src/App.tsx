import { useState, useEffect, useCallback } from 'react'
import type { ListResult, BreadcrumbItem } from './types'
import Header from './components/Header'
import Breadcrumb from './components/Breadcrumb'
import FileTable from './components/FileTable'
import SetupCard from './components/SetupCard'
import SearchBar from './components/SearchBar'

export default function App() {
  const [prefix, setPrefix] = useState('')
  const [data, setData] = useState<ListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'size' | 'date'>('name')
  const [sortAsc, setSortAsc] = useState(true)

  const fetchList = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    setSearch('')
    try {
      const res = await fetch(`/api/list?prefix=${encodeURIComponent(p)}&delimiter=/`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ListResult = await res.json()
      setData(json)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList(prefix) }, [prefix, fetchList])

  const navigate = (newPrefix: string) => setPrefix(newPrefix)

  const breadcrumbs: BreadcrumbItem[] = [{ label: 'root', prefix: '' }]
  if (prefix) {
    const parts = prefix.replace(/\/$/, '').split('/')
    parts.forEach((part, i) => {
      breadcrumbs.push({
        label: part,
        prefix: parts.slice(0, i + 1).join('/') + '/',
      })
    })
  }

  const filteredDirs = (data?.dirs ?? []).filter((d) =>
    d.toLowerCase().includes(search.toLowerCase())
  )
  const filteredObjects = (data?.objects ?? [])
    .filter((o) => o.key.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.key.localeCompare(b.key)
      else if (sortKey === 'size') cmp = a.size - b.size
      else cmp = a.uploaded.localeCompare(b.uploaded)
      return sortAsc ? cmp : -cmp
    })

  const isRoot = prefix === ''

  return (
    <div className="layout">
      <Header onRefresh={() => fetchList(prefix)} loading={loading} />

      <div className="container">
        {isRoot && <SetupCard />}

        <div className="toolbar">
          <Breadcrumb items={breadcrumbs} onNavigate={navigate} />
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {error ? (
          <div className="error-card">
            <span className="error-icon">⚠</span>
            <div>
              <strong>Failed to load directory</strong>
              <p>{error}</p>
            </div>
            <button onClick={() => fetchList(prefix)}>Retry</button>
          </div>
        ) : (
          <FileTable
            dirs={filteredDirs}
            objects={filteredObjects}
            prefix={prefix}
            loading={loading}
            sortKey={sortKey}
            sortAsc={sortAsc}
            onNavigate={navigate}
            onSort={(k) => {
              if (k === sortKey) setSortAsc((v) => !v)
              else { setSortKey(k); setSortAsc(true) }
            }}
          />
        )}
      </div>

      <footer className="footer">
        <span>Lingmo OS Repository</span>
        <span className="sep">·</span>
        <span>Powered by</span>
        <a href="https://developers.cloudflare.com/r2/">Cloudflare R2</a>
        <span className="sep">&</span>
        <a href="https://pages.cloudflare.com">Pages</a>
      </footer>

      <style>{`
        .layout { display: flex; flex-direction: column; min-height: 100vh; }
        .container { flex: 1; max-width: 1100px; width: 100%; margin: 0 auto; padding: 24px 20px; }
        .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
        .error-card {
          display: flex; align-items: flex-start; gap: 14px;
          background: rgba(248,81,73,0.08); border: 1px solid rgba(248,81,73,0.3);
          border-radius: var(--radius); padding: 16px 20px; margin-top: 16px;
        }
        .error-icon { font-size: 20px; color: var(--red); margin-top: 2px; }
        .error-card strong { color: var(--red); }
        .error-card p { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
        .error-card button {
          margin-left: auto; padding: 6px 14px;
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer; font-size: 13px;
        }
        .footer {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 20px; font-size: 12px; color: var(--text-muted);
          border-top: 1px solid var(--border-subtle);
        }
        .footer a { color: var(--text-muted); }
        .footer a:hover { color: var(--accent); text-decoration: none; }
        .sep { opacity: 0.4; }
      `}</style>
    </div>
  )
}
