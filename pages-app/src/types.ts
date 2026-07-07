export interface R2Object {
  key: string
  size: number
  uploaded: string
  etag: string
  contentType: string
}

export interface ListResult {
  prefix: string
  objects: R2Object[]
  dirs: string[]
  truncated: boolean
  error?: string
}

export interface BreadcrumbItem {
  label: string
  prefix: string
}
