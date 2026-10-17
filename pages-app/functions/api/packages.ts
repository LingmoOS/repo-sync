import { CatalogError, loadCatalog } from '../../lib/catalog.ts'
import { searchCatalog } from '../../lib/packages.ts'

export const onRequestGet: PagesFunction<{ REPO_BUCKET: R2Bucket }> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams
  try {
    const catalog = await loadCatalog(env.REPO_BUCKET, params.get('suite') || 'stable')
    return Response.json(searchCatalog(catalog, params), {
      headers: { 'Cache-Control': 'public, max-age=30' },
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CatalogError ? error.message : '暂时无法读取软件包索引，请稍后重试。',
      },
      { status: 503 },
    )
  }
}
