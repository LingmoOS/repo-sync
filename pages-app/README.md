# Lingmo Packages

基于 React 与 Cloudflare Pages Functions 的 APT 软件包检索站。API Worker 通过 R2 binding 读取已发布索引，不会把存储凭据放进浏览器。

## 功能

- 按软件包名称、描述或源码包名搜索，支持精确匹配。
- 按发行分支、架构和分类筛选并分页。
- 查看版本、依赖、SHA256、安装命令及软件包下载。
- 浏览仓库对象和 APT 接入步骤，适配桌面与手机。

## 本地验证

使用 Node.js 24：

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run build` 会构建前端，并编译 Pages Functions 到 `dist/_worker.js`。浏览器测试使用模拟数据；本地 R2 binding 由 Wrangler 模拟。

## Cloudflare Pages 部署

当前 Cloudflare 项目 `lingmo-repo-index` 是 Direct Upload 项目，之后无法转换为 Git 集成项目。新版站点使用 Git 集成项目 `lingmo-packages`：Cloudflare 负责构建，并把输出目录里的 `_worker.js` 作为 Pages Functions（高级模式）一起发布。保留旧项目即可。

1. Cloudflare Dashboard → Workers & Pages → Create application → Pages → **Connect to Git**。
2. 连接 GitHub 仓库 `LingmoOS/repo-sync`，新项目名设为 `lingmo-packages`，生产分支选 `main`。
3. 构建设置：根目录 `pages-app`，构建命令 `npm run build`，输出目录 `dist`，Node.js 版本 24。
4. 在新 Pages 项目的 Settings → Functions → R2 bucket bindings 添加 binding `REPO_BUCKET`，选择 `lingmo-repo`。Pages 项目和 R2 桶需属于同一 Cloudflare 账户。
5. 在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `CF_API_TOKEN` | 有目标账户 Cloudflare Pages Edit 权限的 API Token |
| Secret | `R2_ACCOUNT_ID` | Cloudflare Account ID |
| Variable | `PAGES_ENABLED` | `true` |
| Variable | `PAGES_PROJECT_MODE` | `git` |
| Variable | `CF_PAGES_PROJECT` | `lingmo-packages` |

6. 保持 Pages 的 Git 自动部署开启。Cloudflare 会构建并发布 `_worker.js`；GitHub 的 **Package Website** 工作流会运行测试，等待 Git 部署完成后检查 API。不要在这个项目上用 `wrangler pages deploy` 手动上传：手动部署会覆盖生产环境的 Git 部署（部署源变成 `ad_hoc`），排查问题时容易混淆。
7. 网站地址通常为 `https://lingmo-packages.pages.dev`。如使用自定义域名，可设置 GitHub Variable `PAGES_URL` 为完整的 HTTPS 地址。

设置 `PAGES_PROJECT_MODE=git` 前，仓库工作流不会向旧 Direct Upload 项目发布错误的 API Worker。

## 部署后自检

`npm run build` 必须产出 `dist/_worker.js`，`scripts/copy-worker.mjs` 会校验编译结果里包含 API 路由，`tests/bundle.test.mjs` 会直接调用打包后的 Worker。

```bash
# 本地用真实 Pages 运行时验证 Worker（R2 由 Wrangler 模拟）
npx wrangler pages dev dist
curl -i http://127.0.0.1:8788/api/catalog        # 期望 200 + application/json

# 线上检查（CI 用的同一个脚本，返回非 JSON 会说明原因并重试）
node scripts/verify-deployment.mjs https://lingmo-packages.pages.dev
curl -i https://lingmo-packages.pages.dev/api/catalog
```

## 故障排查：页面提示“暂时无法加载 / 网站数据服务暂时不可用”

这个提示来自 `src/useApi.ts`：`/api/catalog` 没有返回 JSON 时就会显示错误页，并在提示里带上 HTTP 状态和实际内容类型。

1. **接口返回 `text/html`（index.html）**：请求落到了 Pages 的 SPA 回退，说明这个部署没有执行 Pages Functions / `_worker.js`。Pages 在没有顶层 `404.html` 时会把未命中的路径回退到 `/`，所以 `/api/*` 也会拿到 `index.html`。
   - 构建日志里找不到 `Found _worker.js in output directory. Uploading.`：检查构建命令是否为 `npm run build`、输出目录是否为 `dist`、根目录是否为 `pages-app`。
   - 构建日志里有 `_worker.js`、部署记录 `uses_functions = true`，但接口仍是 HTML：说明 Cloudflare 侧把 Functions 请求退回了静态资源。Workers 免费计划的 Pages Functions 有每日额度（10 万次请求），额度用尽时默认 **Fail open**，直接返回静态资源。到 Workers & Pages → 项目 → 用量/设置确认；等额度在 UTC 00:00 重置，或升级到 Workers Paid。
   - 本地 `npx wrangler pages dev dist` 正常、线上仍返回 HTML：问题在 Cloudflare 账号/项目侧，带着部署 ID、构建日志和上面的 `curl -i` 结果提交工单。
2. **接口返回 JSON 错误（503）**：Functions 正常，是 R2 里没有发布索引，或项目没有配置 `REPO_BUCKET` binding。响应里的 `error` 字段会直接说明。

## API 与数据

搜索接口读取 R2 的 Release 和 Packages 索引，校验 SHA256 后解析 Debian control 内容。每个发行分支解压后的索引上限为 8 MiB。完整 Debian 镜像规模需要单独的搜索服务；当前不支持按包内文件路径搜索。
