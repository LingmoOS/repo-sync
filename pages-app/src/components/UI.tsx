import { useState } from 'react'

export function Icon({
  name,
  size = 20,
}: {
  name: 'box' | 'search' | 'arrow' | 'download' | 'folder' | 'file' | 'check' | 'copy' | 'external'
  size?: number
}) {
  const paths = {
    box: (
      <>
        <path d="m12 3 9 5v8l-9 5-9-5V8z" />
        <path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    folder: <path d="M3 5h6l2 3h10v12H3z" />,
    file: (
      <>
        <path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V3H3v13h5" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('已复制')
    } catch {
      setStatus('复制失败，请手动选择')
    }
    window.setTimeout(() => setStatus(''), 2500)
  }
  return (
    <button type="button" className="copy-button" onClick={copy} aria-label="复制命令">
      <Icon name={status === '已复制' ? 'check' : 'copy'} size={16} />
      <span aria-live="polite">{status || '复制'}</span>
    </button>
  )
}

export function formatSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB'
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty-state error-state" role="alert">
      <span className="state-icon">!</span>
      <h3>暂时无法加载</h3>
      <p>{message}</p>
      <button className="button secondary" onClick={retry}>
        重新加载
      </button>
    </div>
  )
}

export function Loading() {
  return (
    <div className="loading-list" aria-label="正在加载" role="status">
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton-row" key={i}>
          <span />
          <span />
          <span />
        </div>
      ))}
      <span className="sr-only">正在读取仓库索引…</span>
    </div>
  )
}
