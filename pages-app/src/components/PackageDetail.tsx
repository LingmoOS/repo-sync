import { useEffect, useState } from 'react'
import type { SearchResult } from '../../shared/packages'
import { fileUrl } from '../../lib/packages'
import { CopyButton, Icon, formatSize } from './UI'

export default function PackageDetail({
  data,
  back,
  search,
}: {
  data: SearchResult
  back: () => void
  search: (name: string) => void
}) {
  const [selected, setSelected] = useState(0)
  useEffect(() => setSelected(0), [data])
  const pkg = data.packages[selected] || data.packages[0]
  if (!pkg)
    return (
      <div className="empty-state">
        <Icon name="box" size={36} />
        <h3>此分支没有这个软件包</h3>
        <p>尝试切换发行分支，或返回搜索查看其他软件包。</p>
        <button className="button secondary" onClick={back}>
          返回搜索
        </button>
      </div>
    )
  const install = 'sudo apt install ' + pkg.name
  const relations = [
    ['依赖', pkg.depends],
    ['推荐', pkg.recommends],
    ['建议', pkg.suggests],
    ['提供', pkg.provides],
  ].filter(([, value]) => value)
  return (
    <article className="detail-panel">
      <button className="back-link" onClick={back}>
        ← 返回搜索结果
      </button>
      <div className="detail-heading">
        <div className="detail-icon">
          <Icon name="box" size={30} />
        </div>
        <div>
          <div className="eyebrow">软件包详情 / {data.suite}</div>
          <h1>{pkg.name}</h1>
          <p>{pkg.summary || '此软件包未提供简短描述。'}</p>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <section>
            <h2>安装软件包</h2>
            <p className="muted">添加 Lingmo 软件源后，在终端运行：</p>
            <div className="command">
              <code>{install}</code>
              <CopyButton text={install} />
            </div>
          </section>
          <section>
            <h2>关于此软件包</h2>
            <p className="long-description">{pkg.description || '此软件包未提供详细描述。'}</p>
          </section>
          {relations.length > 0 && (
            <section>
              <h2>依赖与关联</h2>
              <p className="muted">依赖也可能由 Debian 基础仓库提供。</p>
              <dl className="relations">
                {relations.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value.split(',').map((part, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          {part.split('|').map((alternative, j) => {
                            const name = alternative.trim().match(/^[a-z0-9][a-z0-9+.-]*/)?.[0]
                            return (
                              <span key={j}>
                                {j > 0 && ' | '}
                                {name ? (
                                  <button className="text-link" onClick={() => search(name)}>
                                    {name}
                                  </button>
                                ) : null}
                                {name ? alternative.trim().slice(name.length) : alternative}
                              </span>
                            )
                          })}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {pkg.sha256 && (
            <section>
              <h2>文件校验</h2>
              <div className="checksum">
                <span>SHA256</span>
                <code>{pkg.sha256}</code>
                <CopyButton text={pkg.sha256} />
              </div>
            </section>
          )}
        </div>
        <aside className="package-meta">
          <h2>软件包信息</h2>
          {data.packages.length > 1 && (
            <label className="field-label">
              选择版本 / 架构
              <select
                value={selected}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {data.packages.map((p, i) => (
                  <option key={i} value={i}>
                    {p.version} · {p.architecture} · {p.component}
                  </option>
                ))}
              </select>
            </label>
          )}
          <dl>
            {[
              ['版本', pkg.version],
              ['发行分支', data.suite],
              ['架构', pkg.architecture],
              ['分类', pkg.section],
              ['组件', pkg.component],
              ['下载大小', formatSize(pkg.size)],
              ['安装大小', formatSize(pkg.installedSize)],
              ['源码包', pkg.source],
              ['维护者', pkg.maintainer || '未提供'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <a className="button primary download-button" href={fileUrl(pkg.filename)}>
            <Icon name="download" size={17} />
            下载 .deb
          </a>
          {pkg.homepage && (
            <a
              className="homepage-link"
              href={pkg.homepage}
              target="_blank"
              rel="noopener noreferrer"
            >
              项目主页 <Icon name="external" size={14} />
            </a>
          )}
        </aside>
      </div>
    </article>
  )
}
