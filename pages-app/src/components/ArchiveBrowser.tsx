import { useState } from 'react'
import { useApi } from '../useApi'
import { fileUrl } from '../../lib/packages'
import { ErrorState, Icon, Loading, formatSize } from './UI'
interface Listing {
  prefix: string
  dirs: string[]
  objects: { key: string; size: number; uploaded: string }[]
  cursor?: string
}

export default function ArchiveBrowser({
  prefix,
  navigate,
}: {
  prefix: string
  navigate: (prefix: string) => void
}) {
  const [cursor, setCursor] = useState('')
  const [filter, setFilter] = useState('')
  const [previousPrefix, setPreviousPrefix] = useState(prefix)
  if (previousPrefix !== prefix) {
    setPreviousPrefix(prefix)
    setCursor('')
    setFilter('')
  }
  const api = useApi<Listing>(
    '/api/list?prefix=' + encodeURIComponent(prefix) + '&cursor=' + encodeURIComponent(cursor),
  )
  const parts = prefix.split('/').filter(Boolean)
  const dirs = (api.data?.dirs || []).filter((key) =>
    key.toLowerCase().includes(filter.toLowerCase()),
  )
  const objects = (api.data?.objects || []).filter((object) =>
    object.key.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <section className="archive-page">
      <div className="eyebrow">REPOSITORY ARCHIVE</div>
      <h1>浏览仓库文件</h1>
      <p className="page-intro">查看发行索引、签名公钥与原始软件包文件。</p>
      <div className="archive-toolbar">
        <nav aria-label="文件路径">
          <button onClick={() => navigate('')}>仓库根目录</button>
          {parts.map((part, i) => (
            <span key={i}>
              {' '}
              /{' '}
              <button onClick={() => navigate(parts.slice(0, i + 1).join('/') + '/')}>
                {part}
              </button>
            </span>
          ))}
        </nav>
        <input
          type="search"
          aria-label="过滤当前页文件"
          placeholder="过滤当前页文件…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {api.loading ? (
        <Loading />
      ) : api.error ? (
        <ErrorState message={api.error} retry={api.retry} />
      ) : (
        <div className="archive-table-wrap">
          <table className="archive-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>修改时间</th>
                <th>大小</th>
              </tr>
            </thead>
            <tbody>
              {prefix && (
                <tr>
                  <td>
                    <button
                      onClick={() =>
                        navigate(parts.slice(0, -1).join('/') + (parts.length > 1 ? '/' : ''))
                      }
                    >
                      ↑ 上级目录
                    </button>
                  </td>
                  <td />
                  <td />
                </tr>
              )}
              {dirs.map((dir) => (
                <tr key={dir}>
                  <td>
                    <button onClick={() => navigate(dir)}>
                      <Icon name="folder" size={18} />
                      {dir.slice(prefix.length)}
                    </button>
                  </td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              ))}
              {objects.map((object) => (
                <tr key={object.key}>
                  <td>
                    <a href={fileUrl(object.key)}>
                      <Icon name="file" size={18} />
                      {object.key.slice(prefix.length)}
                    </a>
                  </td>
                  <td>{new Date(object.uploaded).toLocaleDateString('zh-CN')}</td>
                  <td>{formatSize(object.size)}</td>
                </tr>
              ))}
              {!dirs.length && !objects.length && (
                <tr>
                  <td colSpan={3} className="archive-empty">
                    {filter ? '当前页没有匹配文件。' : '此目录为空。'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        {cursor && (
          <button className="button secondary" onClick={() => setCursor('')}>
            返回第一页
          </button>
        )}
        {api.data?.cursor && (
          <button className="button secondary" onClick={() => setCursor(api.data!.cursor!)}>
            下一页 <Icon name="arrow" size={16} />
          </button>
        )}
      </div>
    </section>
  )
}
