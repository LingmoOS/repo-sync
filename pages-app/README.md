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

当前 Cloudflare 项目 `lingmo-repo-index` 是 Direct Upload 项目。Cloudflare Pages 高级 Worker 模式需要 Git 集成项目；Direct Upload 项目不能转换类型。因此 API 无法在当前项目中接管请求，需要另建项目。保留旧项目即可。

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

6. Git 集成会自动构建。若要由 **Package Website** 工作流统一负责部署和线上 API 检查，请在 Pages 项目中关闭自动部署。
7. 部署成功后，从 Cloudflare Pages 项目取得地址，通常为 `https://lingmo-packages.pages.dev`。

设置 `PAGES_PROJECT_MODE=git` 前，仓库工作流不会向旧 Direct Upload 项目发布错误的 API Worker。

## API 与数据

搜索接口读取 R2 的 Release 和 Packages 索引，校验 SHA256 后解析 Debian control 内容。每个发行分支解压后的索引上限为 8 MiB。完整 Debian 镜像规模需要单独的搜索服务；当前不支持按包内文件路径搜索。
