export interface PackageRecord {
  name: string
  version: string
  architecture: string
  component: string
  section: string
  summary: string
  description: string
  source: string
  maintainer: string
  homepage: string
  depends: string
  recommends: string
  suggests: string
  provides: string
  filename: string
  size: number
  installedSize: number
  sha256: string
}
export interface Catalog {
  suite: string
  updatedAt: string
  packages: PackageRecord[]
}
export interface SearchResult {
  suite: string
  updatedAt: string
  total: number
  packageCount: number
  page: number
  pageSize: number
  architectures: string[]
  sections: string[]
  packages: PackageRecord[]
}
export interface SiteConfig {
  title: string
  suites: string[]
  publicUrl: string
  signingKey: boolean
}
