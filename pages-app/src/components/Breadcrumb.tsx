import type { BreadcrumbItem } from '../types'

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  onNavigate: (prefix: string) => void
}

export default function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb" aria-label="Directory navigation">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={item.prefix} className="crumb-group">
            {i > 0 && <span className="crumb-sep">/</span>}
            {isLast ? (
              <span className="crumb crumb-active">{item.label}</span>
            ) : (
              <button className="crumb crumb-link" onClick={() => onNavigate(item.prefix)}>
                {item.label}
              </button>
            )}
          </span>
        )
      })}
      <style>{`
        .breadcrumb {
          display: flex; align-items: center; flex-wrap: wrap; gap: 2px;
          font-family: var(--font-mono); font-size: 13px;
        }
        .crumb-group { display: flex; align-items: center; gap: 2px; }
        .crumb-sep { color: var(--text-muted); padding: 0 2px; }
        .crumb {
          padding: 4px 8px; border-radius: var(--radius-sm);
          border: none; background: none; font-family: inherit; font-size: inherit;
          line-height: 1;
        }
        .crumb-link {
          color: var(--accent); cursor: pointer; transition: background 0.12s;
        }
        .crumb-link:hover { background: var(--accent-glow); }
        .crumb-active { color: var(--text-primary); }
      `}</style>
    </nav>
  )
}
