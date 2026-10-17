# Lingmo Packages

基于 React + Cloudflare Pages Functions 的 APT 软件包检索站。通过 R2 binding 读取真实的已发布索引，不需要把 R2 访问密钥放进前端，也不需要为每次包同步重新部署网站。

## 功能

- 包名、名称与描述、源码包名称搜索；支持包名和源码包名精确匹配。
- 发行分支、架构、分类筛选和分页；选择具体架构时也包含 Architecture: all 的包。
- 可分享的包详情链接，显示版本、描述、依赖、维护者、安装命令、SHA256 和下载链接。
- 原始仓库文件浏览和分页；GET/HEAD 下载、Range 请求。
- 根据实际公钥状态生成 signed-by 的 APT 接入命令。
- 桌面和手机布局、键盘导航、加载、空结果及失败重试状态。

## 数据来源

从桶的 dists/ 发现发行分支，包括发布别名。检索时读取所选分支的 Release，并根据 SHA256 清单加载其当前 main/binary-*/Packages.gz 或 Packages 索引（也支持其他组件）。校验索引大小和 SHA256 后解析 Debian control 格式，不通过 .deb 文件名猜测包信息。

索引与 Release 不一致时会返回“正在更新”，避免展示混合版本。查询缓存最长约 90 秒；R2 同步成功后，网页会自动读取新数据。

当前版本面向 Lingmo 规模的仓库：每个分支解压后的索引总量最多 8 MiB，每个 Functions isolate 缓存最多两个分支。超限时返回明确错误；完整 Debian 镜像规模需要独立检索数据库。尚不支持按包内文件路径搜索（Contents 索引）或源码包内容浏览；“源码包名称”搜索匹配二进制包的 Source 字段。详情按实际发布的版本/架构展示，不推断版本新旧。

## 本地开发

使用 Node.js 24：

```bash
npm ci
npm test
npm run build
npm run build:functions
npm run dev:full
```

完整本地服务由 Wrangler 提供，默认使用本地模拟的 R2，不会连接生产桶。可导入测试索引，例如：

```bash
npx wrangler r2 object put lingmo-repo/dists/stable/Release --file /path/to/published/dists/stable/Release --local
npx wrangler r2 object put lingmo-repo/dists/stable/main/binary-amd64/Packages.gz --file /path/to/published/dists/stable/main/binary-amd64/Packages.gz --local
```

需要导入 Release 清单中的所有 Packages 索引；若要测试下载，再导入对应 pool/ 包文件和 keys/lingmo.asc。

使用 Vite 热更新时，先在 8788 端口运行完整服务，再运行 npm run dev；Vite 会将 /api 转发到该服务。单独启动 Vite 不会产生真实软件包数据。

## 部署到 Cloudflare Pages

1. 编辑 wrangler.toml：binding 名保持 REPO_BUCKET，bucket_name 改为实际桶名（默认 lingmo-repo）。项目和 R2 桶必须在同一 Cloudflare 账户。
2. REPO_TITLE 设置站点标题。REPO_PUBLIC_URL 可填写现有 APT 公开域名，例如 https://apt.example.org。留空时，接入命令使用当前站点的 /api/file 地址。
3. 在 Cloudflare 创建 Pages 项目；默认项目名 lingmo-repo-index。也可在设置 Cloudflare API 凭据后运行：

```bash
npx wrangler pages project create lingmo-repo-index --production-branch main
```

4. GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | CF_API_TOKEN | Cloudflare API Token，目标账户的 Cloudflare Pages 编辑权限；不是 R2 的 Secret Access Key |
| Secret | R2_ACCOUNT_ID | 已有的 Cloudflare 账户 ID，可直接复用 |
| Variable | PAGES_ENABLED | true，开启网站部署 |
| Variable | CF_PAGES_PROJECT | 可选，默认 lingmo-repo-index |

5. 运行 Package Website 工作流。工作流会测试、构建并部署网站和 Functions；网站代码更新后也可自动触发。R2 同步仍由原来的 Sync 工作流负责。
6. 使用 Pages 项目的 pages.dev 地址访问；如需独立域名，在 Pages 项目中绑定，例如 packages.example.org。已有的 apt.example.org 可以继续指向 R2。

不要把 dist 目录单独上传到 R2 来运行此网站。它包含动态检索 API，部署时必须包含 functions/ 并绑定 REPO_BUCKET。Wrangler 会读取 wrangler.toml 的绑定和变量；修改这些配置后需重新部署。

R2 上传成功不代表网站已经部署。上述 PAGES_ENABLED 是 GitHub Repository Variable；与旧 pages_index.sh 的同名 Shell 环境变量属于不同流程。本网站不需要启用旧静态目录索引生成器。

## 验证

```bash
npm test
npm run build
npm run build:functions
npx playwright install chromium
npm run test:e2e
```

单元/API 测试使用真实 gzip 数据、Release 哈希和模拟 R2；覆盖索引更新、大小限制、分页、筛选及文件下载。
浏览器测试使用固定测试数据，覆盖搜索、筛选、详情、历史导航、目录、错误重试和手机布局。预览截图也使用测试数据，不代表生产桶的软件包清单。

如本机已安装 Edge，可设置 PLAYWRIGHT_CHANNEL=msedge 后运行浏览器测试。
