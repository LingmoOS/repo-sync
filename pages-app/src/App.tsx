import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SearchResult, SiteConfig } from '../shared/packages'
import { useApi } from './useApi'
import { ErrorState, Icon, Loading } from './components/UI'
import PackageDetail from './components/PackageDetail'
import ArchiveBrowser from './components/ArchiveBrowser'
import SetupCard from './components/SetupCard'

export default function App() {
  const [location, setLocation] = useState(() => window.location.search)
  useEffect(() => {
    const update = () => setLocation(window.location.search)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  const params = new URLSearchParams(location)
  const site = useApi<SiteConfig>('/api/catalog')
  const requestedTab = params.get('view') || 'packages'
  const tab = ['packages', 'archive', 'setup'].includes(requestedTab) ? requestedTab : 'packages'
  const suite = params.get('suite') || site.data?.suites[0] || 'stable'
  const query = params.get('q') || ''
  const selectedPackage = params.get('package') || ''
  const [draftQuery, setDraftQuery] = useState(query)
  useEffect(() => setDraftQuery(query), [query])
  function navigate(changes: Record<string, string | null>, reset = false) {
    const next = reset ? new URLSearchParams() : new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const search = next.toString()
    window.history.pushState({}, '', window.location.pathname + (search ? '?' + search : ''))
    setLocation(window.location.search)
  }
  const searchParams = new URLSearchParams(params)
  searchParams.set('suite', suite)
  const result = useApi<SearchResult>(
    site.data?.suites.length && tab === 'packages'
      ? '/api/packages?' + searchParams.toString()
      : null,
  )
  useEffect(() => {
    document.title =
      (selectedPackage ? selectedPackage + ' · ' : '') + (site.data?.title || 'Lingmo Packages')
  }, [selectedPackage, site.data?.title])
  const filter = (changes: Record<string, string | null>) =>
    navigate({ page: null, package: null, ...changes })
  const switchTab = (view: string) =>
    navigate({ view: view === 'packages' ? null : view, suite }, true)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    filter({ q: draftQuery.trim() || null })
  }
  const data = result.data
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        跳转到内容
      </a>
      <header className="site-header">
        <div className="header-content">
          <a
            className="brand"
            href="/"
            onClick={(event) => {
              event.preventDefault()
              switchTab('packages')
            }}
            aria-label="Lingmo 软件包首页"
          >
            <span className="brand-mark">
              <Icon name="box" size={25} />
            </span>
            <span>
              Lingmo<span className="brand-product"> / Packages</span>
            </span>
          </a>
          <nav className="main-nav" aria-label="主导航">
            {[
              ['packages', '软件包'],
              ['archive', '仓库文件'],
              ['setup', '接入软件源'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? 'active' : ''}
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => switchTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <a
            className="github-link"
            href="https://github.com/LingmoOS"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub <Icon name="external" size={14} />
          </a>
        </div>
      </header>
      <main id="main" className="main-container">
        {site.loading ? (
          <Loading />
        ) : site.error ? (
          <ErrorState message={site.error} retry={site.retry} />
        ) : !site.data?.suites.length ? (
          <div className="empty-state">
            <Icon name="box" size={42} />
            <h1>仓库正在准备中</h1>
            <p>首次发布并同步软件包后，即可在这里搜索。</p>
            <button className="button secondary" onClick={site.retry}>
              刷新仓库
            </button>
          </div>
        ) : (
          <>
            {tab !== 'packages' && (
              <div className="suite-picker">
                <label htmlFor="page-suite">发行分支</label>
                <select
                  id="page-suite"
                  value={suite}
                  onChange={(e) => filter({ suite: e.target.value })}
                >
                  {site.data.suites.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}
            {tab === 'archive' ? (
              <ArchiveBrowser
                prefix={params.get('prefix') || ''}
                navigate={(prefix) => navigate({ prefix: prefix || null })}
              />
            ) : tab === 'setup' ? (
              <SetupCard config={site.data} suite={suite} />
            ) : (
              <>
                {selectedPackage ? (
                  <>
                    {result.loading ? (
                      <Loading />
                    ) : result.error ? (
                      <ErrorState message={result.error} retry={result.retry} />
                    ) : (
                      data && (
                        <PackageDetail
                          data={data}
                          back={() => navigate({ package: null })}
                          search={(name) =>
                            navigate({
                              package: null,
                              q: name,
                              mode: 'name',
                              exact: null,
                              page: null,
                              arch: null,
                              section: null,
                            })
                          }
                        />
                      )
                    )}
                  </>
                ) : (
                  <>
                    <section className="hero">
                      <div className="hero-copy">
                        <div className="eyebrow">
                          <span className="live-dot" />
                          LINGMO OS · PACKAGE DIRECTORY
                        </div>
                        <h1>
                          找到你需要的<span>软件包。</span>
                        </h1>
                        <p>
                          探索 Lingmo 软件仓库，查找版本、查看依赖，
                          <br className="desktop-break" />
                          让下一次安装更简单。
                        </p>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="orbit one" />
                        <div className="orbit two" />
                        <div className="art-box">
                          <Icon name="box" size={88} />
                        </div>
                        <span className="art-tag top">.deb</span>
                        <span className="art-tag bottom">apt install</span>
                        <span className="art-cross">+</span>
                      </div>
                    </section>
                    <form className="search-panel" onSubmit={submit} role="search">
                      <div className="search-main">
                        <Icon name="search" size={23} />
                        <label className="sr-only" htmlFor="package-query">
                          搜索软件包
                        </label>
                        <input
                          id="package-query"
                          type="search"
                          maxLength={200}
                          value={draftQuery}
                          onChange={(e) => setDraftQuery(e.target.value)}
                          placeholder="输入软件包名称，例如 lingmo-desktop"
                          autoComplete="off"
                        />
                        <button className="button primary search-submit" type="submit">
                          搜索软件包 <Icon name="arrow" size={17} />
                        </button>
                      </div>
                      <div className="search-options">
                        <label>
                          搜索范围
                          <select
                            aria-label="搜索范围"
                            value={params.get('mode') || 'name'}
                            onChange={(e) => filter({ mode: e.target.value, exact: null })}
                          >
                            <option value="name">软件包名称</option>
                            <option value="description">名称与描述</option>
                            <option value="source">源码包名称</option>
                          </select>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={params.get('exact') === 'true'}
                            disabled={params.get('mode') === 'description'}
                            onChange={(e) => filter({ exact: e.target.checked ? 'true' : null })}
                          />
                          精确匹配
                        </label>
                        <span className="search-tip">搜索已发布的 APT 软件包索引</span>
                      </div>
                    </form>
                    <div className="catalog-layout">
                      <aside className="filters">
                        <div className="filter-title">
                          <h2>筛选条件</h2>
                          {(params.get('arch') || params.get('section') || params.get('exact')) && (
                            <button
                              className="text-link"
                              onClick={() => filter({ arch: null, section: null, exact: null })}
                            >
                              重置
                            </button>
                          )}
                        </div>
                        <label className="field-label" htmlFor="suite">
                          发行分支
                          <select
                            id="suite"
                            value={suite}
                            onChange={(e) =>
                              filter({ suite: e.target.value, arch: null, section: null })
                            }
                          >
                            {site.data.suites.map((name) => (
                              <option key={name}>{name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label" htmlFor="architecture">
                          处理器架构
                          <select
                            id="architecture"
                            value={params.get('arch') || ''}
                            onChange={(e) => filter({ arch: e.target.value || null })}
                          >
                            <option value="">全部架构</option>
                            {(data?.architectures || [params.get('arch')].filter(Boolean)).map(
                              (name) => (
                                <option key={name} value={name!}>
                                  {name}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="field-label" htmlFor="section">
                          软件包分类
                          <select
                            id="section"
                            value={params.get('section') || ''}
                            onChange={(e) => filter({ section: e.target.value || null })}
                          >
                            <option value="">全部分类</option>
                            {(data?.sections || [params.get('section')].filter(Boolean)).map(
                              (name) => (
                                <option key={name} value={name!}>
                                  {name}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <div className="repository-info">
                          <span className="small-label">当前仓库</span>
                          <strong>{suite}</strong>
                          <p>
                            {data
                              ? data.packageCount.toLocaleString() + ' 个软件包'
                              : '正在读取索引…'}
                          </p>
                          {data && (
                            <span className="update-time">
                              发布于 {new Date(data.updatedAt).toLocaleDateString('zh-CN')}
                            </span>
                          )}
                        </div>
                        <button className="setup-prompt" onClick={() => switchTab('setup')}>
                          <span>
                            第一次使用？<strong>添加 Lingmo 软件源</strong>
                          </span>
                          <Icon name="arrow" size={18} />
                        </button>
                      </aside>
                      <section className="results" aria-label="搜索结果">
                        <div className="results-heading">
                          <div>
                            <h2>{query ? '搜索结果' : '浏览软件包'}</h2>
                            <span aria-live="polite">
                              {result.loading
                                ? '正在读取索引…'
                                : data
                                  ? '共 ' +
                                    data.total.toLocaleString() +
                                    ' 个版本' +
                                    (query ? ' · “' + query + '”' : '')
                                  : ''}
                            </span>
                          </div>
                          <span className="suite-badge">
                            <span />
                            {suite}
                          </span>
                        </div>
                        {result.loading ? (
                          <Loading />
                        ) : result.error ? (
                          <ErrorState message={result.error} retry={result.retry} />
                        ) : data?.total === 0 ? (
                          <div className="empty-state">
                            <Icon name="search" size={38} />
                            <h3>没有找到匹配的软件包</h3>
                            <p>试试更短的关键词、名称与描述搜索，或切换发行分支。</p>
                            <button
                              className="button secondary"
                              onClick={() => navigate({ suite }, true)}
                            >
                              查看全部软件包
                            </button>
                          </div>
                        ) : (
                          <div className="package-list">
                            {data?.packages.map((pkg) => (
                              <article
                                className="package-row"
                                key={[pkg.component, pkg.name, pkg.version, pkg.architecture].join(
                                  '/',
                                )}
                              >
                                <div className="package-icon">
                                  <Icon name="box" size={22} />
                                </div>
                                <div className="package-copy">
                                  <div className="package-name-line">
                                    <a
                                      href={
                                        '?suite=' +
                                        encodeURIComponent(suite) +
                                        '&package=' +
                                        encodeURIComponent(pkg.name)
                                      }
                                      onClick={(e) => {
                                        e.preventDefault()
                                        navigate({ package: pkg.name })
                                      }}
                                    >
                                      {pkg.name}
                                    </a>
                                    <span className="arch-badge">{pkg.architecture}</span>
                                  </div>
                                  <p>{pkg.summary || '此软件包未提供描述。'}</p>
                                  <div className="package-labels">
                                    <span>{pkg.section}</span>
                                    <span>{pkg.component}</span>
                                  </div>
                                </div>
                                <div className="package-version">
                                  <span className="small-label">VERSION</span>
                                  <code>{pkg.version}</code>
                                  <button
                                    aria-label={'查看 ' + pkg.name + ' 详情'}
                                    onClick={() => navigate({ package: pkg.name })}
                                  >
                                    <Icon name="arrow" size={18} />
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                        {data && data.total > 0 && (
                          <div className="pagination">
                            <span>
                              第 {data.page} / {pageCount} 页
                            </span>
                            <div>
                              <button
                                className="button secondary"
                                disabled={data.page <= 1}
                                onClick={() => navigate({ page: String(data.page - 1) })}
                              >
                                上一页
                              </button>
                              <button
                                className="button secondary"
                                disabled={data.page >= pageCount}
                                onClick={() => navigate({ page: String(data.page + 1) })}
                              >
                                下一页 <Icon name="arrow" size={15} />
                              </button>
                            </div>
                          </div>
                        )}
                      </section>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <div>
          <span className="footer-brand">
            <Icon name="box" size={18} />
            Lingmo Packages
          </span>
          <span>开放的软件，让可能发生。</span>
        </div>
        <div>
          <span>来自已发布的 APT 索引</span>
          <a href="https://github.com/LingmoOS/repo-sync" target="_blank" rel="noopener noreferrer">
            源代码 <Icon name="external" size={13} />
          </a>
        </div>
      </footer>
    </div>
  )
}
