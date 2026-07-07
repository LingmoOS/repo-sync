import type { R2Object } from '../types'

type SortKey = 'name' | 'size' | 'date'

interface FileTableProps {
  dirs: string[]
  objects: R2Object[]
  prefix: string
  loading: boolean
  sortKey: SortKey
  sortAsc: boolean
  onNavigate: (prefix: string) => void
  onSort: (key: SortKey) => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fileType(key: string): { label: string; color: string } {
  const name = key.split('/').pop()?.toLowerCase() ?? ''
  if (name.endsWith('.deb')) return { label: 'deb', color: '#3fb950' }
  if (name.endsWith('.dsc')) return { label: 'dsc', color: '#a371f7' }
  if (name.match(/\.(tar\.(gz|xz|bz2)|tgz|txz)$/)) return { label: 'tar', color: '#d29922' }
  if (name.match(/^(release|inrelease)$/i)) return { label: 'release', color: '#4f8ef7' }
  if (name.match(/^(packages|sources)(\.gz|\.xz)?$/i)) return { label: 'index', color: '#4f8ef7' }
  if (name.endsWith('.gpg') || name.endsWith('.asc')) return { label: 'sig', color: '#848d97' }
  return { label: 'file', color: '#848d97' }
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ opacity: active ? 1 : 0.3, marginLeft: 4 }}>
      {active && !asc
        ? <path d="M12 5v14M5 12l7 7 7-7"/>
        : <path d="M12 19V5M5 12l7-7 7 7"/>}
    </svg>
  )
}

function Skeleton() {
  return (
    <div className="skeleton-rows">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton-row" style={{ opacity: 1 - i * 0.12 }}>
          <div className="sk sk-icon" />
          <div className="sk sk-name" style={{ width: `${120 + (i % 3) * 60}px` }} />
          <div className="sk sk-badge" />
          <div className="sk sk-date" />
          <div className="sk sk-size" />
        </div>
      ))}
    </div>
  )
}

export default function FileTable({
  dirs, objects, prefix, loading, sortKey, sortAsc, onNavigate, onSort,
}: FileTableProps) {
  const isEmpty = !loading && dirs.length === 0 && objects.length === 0

  return (
    <div className="table-wrap">
      <table className="file-table">
        <thead>
          <tr>
            <th className="col-icon" />
            <th className="col-name">
              <button className="sort-btn" onClick={() => onSort('name')}>
                Name <SortIcon active={sortKey === 'name'} asc={sortAsc} />
              </button>
            </th>
            <th className="col-type">Type</th>
            <th className="col-date">
              <button className="sort-btn" onClick={() => onSort('date')}>
                Modified <SortIcon active={sortKey === 'date'} asc={sortAsc} />
              </button>
            </th>
            <th className="col-size">
              <button className="sort-btn sort-right" onClick={() => onSort('size')}>
                Size <SortIcon active={sortKey === 'size'} asc={sortAsc} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ padding: 0 }}><Skeleton /></td></tr>
          ) : isEmpty ? (
            <tr>
              <td colSpan={5} className="empty-cell">
                <div className="empty-state">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M3 3h18v4H3zM3 10h18v11H3z"/>
                  </svg>
                  <span>Directory is empty</span>
                </div>
              </td>
            </tr>
          ) : (
            <>
              {dirs.map((dir) => {
                const label = dir.replace(prefix, '').replace(/\/$/, '')
                return (
                  <tr key={dir} className="file-row dir-row" onClick={() => onNavigate(dir)}>
                    <td className="col-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#d29922' }}>
                        <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
                      </svg>
                    </td>
                    <td className="col-name">
                      <span className="name-text dir-name">{label}/</span>
                    </td>
                    <td className="col-type">
                      <span className="badge" style={{ background: 'rgba(210,153,34,0.12)', color: '#d29922' }}>dir</span>
                    </td>
                    <td className="col-date" />
                    <td className="col-size">—</td>
                  </tr>
                )
              })}

              {objects.map((obj) => {
                const name = obj.key.replace(prefix, '')
                const type = fileType(obj.key)
                const fileUrl = `/api/file/${obj.key}`
                return (
                  <tr key={obj.key} className="file-row">
                    <td className="col-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: type.color }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </td>
                    <td className="col-name">
                      <a href={fileUrl} className="name-text file-name" download={name}>{name}</a>
                    </td>
                    <td className="col-type">
                      <span className="badge"
                        style={{ background: `${type.color}18`, color: type.color }}>
                        {type.label}
                      </span>
                    </td>
                    <td className="col-date">{formatDate(obj.uploaded)}</td>
                    <td className="col-size">{formatSize(obj.size)}</td>
                  </tr>
                )
              })}
            </>
          )}
        </tbody>
      </table>

      <style>{`
        .table-wrap {
          background: var(--surface-0);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: var(--shadow);
        }
        .file-table { width: 100%; border-collapse: collapse; }
        thead tr { background: var(--surface-1); }
        th {
          padding: 10px 14px; text-align: left;
          font-size: 11px; font-weight: 500; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .sort-btn {
          display: inline-flex; align-items: center; gap: 2px;
          background: none; border: none; color: inherit; cursor: pointer;
          font: inherit; letter-spacing: inherit; text-transform: inherit;
          padding: 0;
        }
        .sort-btn:hover { color: var(--text-secondary); }
        .sort-right { margin-left: auto; }
        .col-icon { width: 36px; text-align: center; }
        .col-type { width: 80px; }
        .col-date { width: 170px; font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }
        .col-size { width: 90px; text-align: right; font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); padding-right: 20px !important; }
        td { padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); }
        tr:last-child td { border-bottom: none; }
        .file-row { cursor: default; transition: background 0.1s; }
        .file-row:hover td { background: rgba(255,255,255,0.025); }
        .dir-row { cursor: pointer; }
        .name-text { font-family: var(--font-mono); font-size: 13px; }
        .dir-name { color: var(--text-primary); }
        .file-name { color: var(--text-primary); }
        .file-name:hover { color: var(--accent); text-decoration: none; }
        .badge {
          display: inline-block; padding: 2px 7px; border-radius: 4px;
          font-family: var(--font-mono); font-size: 11px; font-weight: 500;
        }
        .empty-cell { padding: 0 !important; }
        .empty-state {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 48px; color: var(--text-muted);
        }
        /* Skeleton */
        .skeleton-rows { padding: 4px 0; }
        .skeleton-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);
        }
        .skeleton-row:last-child { border-bottom: none; }
        .sk {
          border-radius: 4px; height: 12px;
          background: linear-gradient(90deg, var(--surface-1) 25%, var(--surface-2) 50%, var(--surface-1) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
        }
        .sk-icon { width: 16px; flex-shrink: 0; }
        .sk-name { flex: 0 0 auto; }
        .sk-badge { width: 42px; flex-shrink: 0; }
        .sk-date { width: 130px; flex-shrink: 0; margin-left: auto; }
        .sk-size { width: 60px; flex-shrink: 0; }
        @keyframes shimmer { to { background-position: -200% 0; } }
      `}</style>
    </div>
  )
}
