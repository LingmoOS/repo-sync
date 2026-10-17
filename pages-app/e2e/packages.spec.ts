import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { searchCatalog } from '../lib/packages.ts'
import type { Catalog, PackageRecord } from '../shared/packages.ts'

const descriptions: Record<string, string> = {
  'lingmo-calculator': 'A simple and elegant calculator for the Lingmo desktop',
  'lingmo-core': 'Core components and system integration for Lingmo OS',
  'lingmo-desktop': 'The complete Lingmo desktop environment',
  'lingmo-dock': 'Application launcher and dock for the Lingmo desktop',
  'lingmo-filemanager': 'A lightweight file manager with a clean, modern interface',
  'lingmo-icons': 'A cohesive icon theme for Lingmo applications',
  'lingmo-settings': 'System settings and desktop preferences',
  'lingmo-terminal': 'A modern terminal emulator for everyday work',
}
const names = [
  ...Object.keys(descriptions),
  ...Array.from({ length: 17 }, (_, i) => 'lingmo-widget-' + String(i + 1).padStart(2, '0')),
]
const catalog: Catalog = {
  suite: 'stable',
  updatedAt: '2026-10-17T03:30:00.000Z',
  packages: names.map((name, i): PackageRecord => ({
    name,
    version: i % 2 ? '2.0.1-1' : '1.4.0-2',
    architecture: name === 'lingmo-icons' ? 'all' : 'amd64',
    component: 'main',
    section: name === 'lingmo-icons' ? 'misc' : 'x11',
    summary: descriptions[name] || 'Desktop widgets and integration components',
    description:
      (descriptions[name] || 'Desktop widgets and integration components') +
      '\nBuilt for Lingmo OS.\n\nA longer description of this package.',
    source: name,
    maintainer: 'Lingmo Team',
    homepage: 'https://example.org/',
    depends:
      name === 'lingmo-desktop' ? 'lingmo-dock (>= 2.0), lingmo-icons | hicolor-icon-theme' : '',
    recommends: '',
    suggests: '',
    provides: '',
    filename: 'pool/main/l/' + name + '/' + name + '_1.4.0-2_amd64.deb',
    size: 1048576,
    installedSize: 5242880,
    sha256: 'ab'.repeat(32),
  })),
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalog', (route) =>
    route.fulfill({
      json: {
        title: 'Lingmo Packages',
        suites: ['stable', 'testing', 'unstable', 'experimental'],
        publicUrl: 'https://apt.example.org',
        signingKey: true,
      },
    }),
  )
  await page.route('**/api/packages?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({
      json: searchCatalog({ ...catalog, suite: params.get('suite') || 'stable' }, params),
    })
  })
})

test('searches names and descriptions, preserves browser history, and paginates', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '浏览软件包' })).toBeVisible()
  await expect(page.locator('.package-row')).toHaveCount(20)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.locator('.package-row')).toHaveCount(5)
  await page.getByRole('searchbox', { name: '搜索软件包' }).fill('terminal')
  await page.getByRole('button', { name: '搜索软件包' }).click()
  await expect(page.locator('.package-row')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'lingmo-terminal', exact: true })).toBeVisible()
  await page.getByLabel('搜索范围').selectOption('description')
  await page.getByRole('searchbox', { name: '搜索软件包' }).fill('elegant')
  await page.getByRole('button', { name: '搜索软件包' }).click()
  await expect(page.getByRole('link', { name: 'lingmo-calculator', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('searchbox', { name: '搜索软件包' })).toHaveValue('terminal')
})

test('filters suite, architecture and section and renders an empty state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: '发行分支', exact: true }).selectOption('testing')
  await expect(page.locator('.suite-badge')).toHaveText('testing')
  await page.getByLabel('处理器架构').selectOption('all')
  await expect(page.locator('.package-row')).toHaveCount(1)
  await page.getByRole('searchbox', { name: '搜索软件包' }).fill('nonexistent')
  await page.getByRole('button', { name: '搜索软件包' }).click()
  await expect(page.getByRole('heading', { name: '没有找到匹配的软件包' })).toBeVisible()
  await page.getByRole('button', { name: '查看全部软件包' }).click()
  await expect(page.locator('.package-row')).toHaveCount(20)
})

test('opens shareable package details with dependencies and valid download links', async ({
  page,
}) => {
  await page.goto('/?suite=stable&package=lingmo-desktop')
  await expect(page.getByRole('heading', { name: 'lingmo-desktop', exact: true })).toBeVisible()
  await expect(page.locator('.command code')).toContainText('sudo apt install lingmo-desktop')
  await expect(page.getByRole('link', { name: '下载 .deb' })).toHaveAttribute(
    'href',
    /api\/file\/pool\/.*\.deb$/,
  )
  await page.getByRole('button', { name: 'lingmo-dock', exact: true }).click()
  await expect(page.getByRole('link', { name: 'lingmo-dock', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('searchbox', { name: '搜索软件包' })).toHaveValue('lingmo-dock')
})

test('provides signed APT setup and a paginated archive browser', async ({ page }) => {
  await page.route('**/api/list?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    const prefix = params.get('prefix') || ''
    return route.fulfill({
      json: {
        prefix,
        dirs: prefix ? [] : ['dists/', 'keys/', 'pool/'],
        objects: prefix
          ? [{ key: prefix + 'Release', size: 2048, uploaded: '2026-10-17T00:00:00Z' }]
          : [],
        cursor: prefix && !params.get('cursor') ? 'next' : undefined,
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '接入软件源', exact: true }).click()
  await expect(page.locator('.command').first()).toContainText(
    'https://apt.example.org/keys/lingmo.asc',
  )
  await expect(page.locator('.command').nth(1)).toContainText(
    'signed-by=/etc/apt/keyrings/lingmo.gpg',
  )
  await page.getByRole('button', { name: '仓库文件', exact: true }).click()
  await page.getByRole('button', { name: 'dists/', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Release' })).toHaveAttribute(
    'href',
    '/api/file/dists/Release',
  )
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByRole('button', { name: '返回第一页' })).toBeVisible()
})

test('shows API errors and supports retry', async ({ page }) => {
  let failed = false
  await page.route('**/api/packages?**', (route) => {
    if (!failed) {
      failed = true
      return route.fulfill({ status: 503, json: { error: '仓库索引正在更新，请稍后重试。' } })
    }
    return route.fulfill({ json: searchCatalog(catalog, new URLSearchParams()) })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('仓库索引正在更新')
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.locator('.package-row')).toHaveCount(20)
})

test('desktop visual preview', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.package-row')).toHaveCount(20)
  await mkdir('test-results/previews', { recursive: true })
  await page.screenshot({ path: 'test-results/previews/desktop.png' })
  await page.getByRole('link', { name: 'lingmo-desktop', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'lingmo-desktop', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/previews/detail.png', fullPage: true })
})

test('mobile navigation and search fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.package-row')).toHaveCount(20)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('searchbox', { name: '搜索软件包' }).fill('desktop')
  await page.getByRole('button', { name: '搜索软件包' }).click()
  await expect(page.locator('.package-row')).toHaveCount(1)
  await mkdir('test-results/previews', { recursive: true })
  await page.screenshot({ path: 'test-results/previews/mobile.png', fullPage: true })
})
