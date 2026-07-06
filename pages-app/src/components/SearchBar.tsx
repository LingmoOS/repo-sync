interface SearchBarProps {
  value: string
  onChange: (v: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="search-wrap">
      <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        className="search-input"
        type="text"
        placeholder="Filter files…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Clear">×</button>
      )}
      <style>{`
        .search-wrap {
          position: relative; display: flex; align-items: center;
          background: var(--surface-1); border: 1px solid var(--border);
          border-radius: var(--radius-sm); overflow: hidden;
          transition: border-color 0.15s;
        }
        .search-wrap:focus-within { border-color: var(--accent); }
        .search-icon { position: absolute; left: 10px; color: var(--text-muted); pointer-events: none; }
        .search-input {
          background: none; border: none; outline: none;
          padding: 7px 32px 7px 32px;
          color: var(--text-primary); font-family: var(--font-mono); font-size: 13px;
          width: 200px;
        }
        .search-input::placeholder { color: var(--text-muted); }
        .search-clear {
          position: absolute; right: 6px;
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          font-size: 16px; line-height: 1; padding: 2px 4px;
        }
        .search-clear:hover { color: var(--text-primary); }
      `}</style>
    </div>
  )
}
