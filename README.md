# Lingmo Repo Sync

OBS Open Build Service -> aptly Debian 仓库自动同步工具。

## 目录结构

```
repo-sync/
├── sync.sh          # 主流程编排（入口）
├── config.sh        # 配置文件
├── lib.sh           # 共享函数库
├── download.sh      # OBS rsync 同步模块
├── import.sh        # aptly 导入与快照模块
├── publish.sh       # aptly 发布模块
├── README.md
├── systemd/
│   ├── lingmo-sync.service
│   └── lingmo-sync.timer
└── logs/            # 按日期生成的日志
```

## 架构概览

```
OBS (远程)
  |
  | rsync
  v
本地缓存 (/var/cache/lingmo-repo-sync)
  |
  | aptly repo add
  v
aptly Repository (lingmo-stable, lingmo-testing, ...)
  |
  | aptly snapshot create
  v
Snapshot (lingmo-unstable-20260704-153000)
  |
  | aptly publish snapshot / switch
  v
Published Repository (/var/www/aptly)
  |
  |--> stable (Distribution)
  |--> lithium (Codename, 与 stable 指向同一 Snapshot)
  |--> testing
  |--> boron
  |--> unstable
  |--> experimental
```

## 安装

### 1. 安装依赖

```bash
apt-get update
apt-get install -y rsync aptly gnupg gzip bzip2 xz-utils
```

### 2. 部署脚本

```bash
# 将项目部署到目标路径
cp -r repo-sync /usr/local/bin/lingmo-repo-sync
cd /usr/local/bin/lingmo-repo-sync
chmod +x *.sh

# 创建必要目录
mkdir -p /var/cache/lingmo-repo-sync
mkdir -p /var/www/aptly
```

### 3. 配置

编辑 `config.sh`：

```bash
OBS_URL="rsync://download.opensuse.org/repositories/home:/LingmoOS/Debian_13/"
CACHE_DIR="/var/cache/lingmo-repo-sync"
GPG_KEY="your-gpg-key-id"
SIGN=true
PUBLISH_ROOT="/var/www/aptly"
```

## 初始化 aptly

### 配置 aptly

```bash
aptly config show
```

默认配置位于 `~/.aptly.conf`。确保 `rootDir` 指向合适位置：

```json
{
  "rootDir": "/var/lib/aptly",
  "downloadConcurrency": 4,
  "databaseOpenAttempts": 10
}
```

### 验证配置

```bash
./sync.sh
```

首次运行会自动创建所有 Repository。

## 首次发布

### 运行：

```bash
./sync.sh
```

该脚本将：同步 -> 导入 -> 创建快照 -> 发布。

### 分步运行：

```bash
# 1. 同步 OBS
./download.sh

# 2. 导入并创建快照
./import.sh

# 3. 发布
./publish.sh
```

### 验证发布

```bash
# 查看发布的仓库
aptly publish list

# 查看本地仓库
aptly repo list

# 查看快照列表
aptly snapshot list
```

## GPG 签名配置

### 1. 生成 GPG 密钥（如果没有）

```bash
gpg --full-generate-key
```

### 2. 导出公钥

```bash
gpg --export --armor YOUR_KEY_ID > /var/www/aptly/public-key.asc
```

### 3. 客户端信任

```bash
# 客户端添加公钥
curl -fsSL https://download.opensuse.org/repositories/home:LingmoOS/Debian_13/Release.key | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/home_LingmoOS.gpg > /dev/null

# 或
apt-key add public-key.asc
```

### 4. 配置 config.sh

```bash
GPG_KEY="YOUR_KEY_ID"
SIGN=true
```

## Distribution 与 Codename

支持同时发布两个 Distribution 指向同一 Snapshot：

| Distribution | Codename |
|-------------|----------|
| stable      | lithium  |
| testing     | boron    |
| unstable    | -        |
| experimental| -        |

例如 `stable` 和 `lithium` 会同时发布同一个 Snapshot，
用户可选择使用 `deb https://repo.lingmo.dev stable main` 或
`deb https://repo.lingmo.dev lithium main`。

Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name repo.lingmo.dev;

    root /var/www/aptly;
    autoindex on;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

客户端 sources.list：

```
deb https://repo.lingmo.dev stable main
deb-src https://repo.lingmo.dev stable main
```

或使用 Codename：

```
deb https://repo.lingmo.dev lithium main
deb-src https://repo.lingmo.dev lithium main
```

## systemd 自动同步

### 启用 Timer（每小时同步一次）

```bash
cp systemd/lingmo-sync.service /etc/systemd/system/
cp systemd/lingmo-sync.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable lingmo-sync.timer
systemctl start lingmo-sync.timer
```

### 查看状态

```bash
# 检查 timer 状态
systemctl status lingmo-sync.timer

# 查看 timer 列表
systemctl list-timers lingmo-sync*

# 手动触发同步
systemctl start lingmo-sync.service
```

### 查看日志

```bash
journalctl -u lingmo-sync.service -f
```

## 日志

日志同时输出到：

- **控制台**：彩色输出（INFO/WARN/ERROR/SUCCESS）
- **日志文件**：`logs/repo-sync-YYYY-MM-DD.log`

日志格式：

```
[INFO] 2026-07-04 15:30:00 - OBS 同步完成
[SUCCESS] 2026-07-04 15:30:00 - Snapshot lingmo-unstable-20260704-153000 创建成功
[ERROR] 2026-07-04 15:30:00 - rsync 同步失败
[WARN] 2026-07-04 15:30:00 - 未找到 .deb 文件
```

## 故障排查

### rsync 连接失败

```bash
# 测试 rsync 可达性
rsync -av --list-only rsync://download.opensuse.org/repositories/home:/LingmoOS/Debian_13/

# 检查网络
ping download.opensuse.org

# 如果使用 HTTP 镜像而非 rsync，需修改 OBS_URL
# OBS_URL 必须使用 rsync:// 协议
```

### aptly Repository 冲突

```bash
# 手动检查仓库状态
aptly repo list

# 手动删除
aptly repo drop lingmo-stable

# 删除相关快照
aptly snapshot drop lingmo-stable-20260704-153000

# 重新运行
./sync.sh
```

### 发布失败

```bash
# 检查发布状态
aptly publish list

# 手动切换
aptly publish switch -distribution=stable lingmo-stable-20260704-153000 /var/www/aptly

# 强制重新发布
aptly publish drop stable
./publish.sh
```

### GPG 签名错误

```bash
# 检查密钥
gpg --list-keys

# 确 config.sh 中 GPG_KEY 正确
# SIGN=true 时必须设置 GPG_KEY

# 测试签名
echo "test" | gpg --clearsign -u YOUR_KEY_ID
```

### 磁盘空间不足

```bash
# 检查缓存大小
du -sh /var/cache/lingmo-repo-sync

# 检查 aptly 数据
du -sh /var/lib/aptly

# 手动清理旧快照
aptly snapshot list -raw | grep -v "$(aptly publish list -raw | awk '{print $4}')" | xargs -r aptly snapshot drop

# 清理 apt 缓存
apt-get clean
```

### 软件包未更新

```bash
# 检查缓存中是否有新文件
ls -la /var/cache/lingmo-repo-sync/*.deb | head

# 检查 aptly repo 内容
aptly repo show lingmo-unstable

# 检查最新快照内容
aptly snapshot show lingmo-unstable-20260704-153000
```

## 扩展

### 添加新架构

编辑 `config.sh`：

```bash
ARCHS=("amd64" "arm64" "riscv64")
```

确保 OBS 配置了对应架构的构建。

### 添加新 Repository

编辑 `config.sh`：

```bash
REPO_NAMES=(
    "lingmo-stable"
    "lingmo-testing"
    "lingmo-unstable"
    "lingmo-experimental"
    "lingmo-backports"
)

DISTRIBUTIONS=(
    "stable"
    "testing"
    "unstable"
    "experimental"
    "backports"
)

declare -A CODENAMES=(
    ["stable"]="lithium"
    ["testing"]="boron"
)
```

### 添加 Codename

编辑 `config.sh`：

```bash
declare -A CODENAMES=(
    ["stable"]="lithium"
    ["testing"]="boron"
    ["unstable"]="carbon"
)
```

### 添加 Component

编辑 `config.sh`：

```bash
COMPONENT="main contrib non-free"
```

### 集成 AppStream

在 `import.sh` 的 `process_one_repo` 函数中增加 AppStream 生成步骤：

```bash
# 从已发布的仓库生成 AppStream 元数据
appstream-generator /var/www/aptly/dists/stable
```

### 同步到 Cloudflare R2

R2 上传由 `r2_sync.sh` 完成，`sync.sh` 在本地发布成功后调用它。
依赖 `rclone`；自动识别 aptly 发布目录还需要 `python3` 和 `aptly`。

**GitHub Actions 配置**

在仓库 Settings → Secrets and variables → Actions 中配置：

| 类型 | 名称 | 内容 |
|------|------|------|
| Variable | `R2_SYNC_ENABLED` | `true`，启用上传 |
| Secret | `R2_ACCOUNT_ID` | Cloudflare 账户 ID |
| Secret | `R2_ACCESS_KEY_ID` | R2 S3 Access Key ID |
| Secret | `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key |
| Secret | `R2_BUCKET` | 已创建的专用仓库桶，默认 `lingmo-repo` |

凭据需具备目标桶的对象读取、写入和删除权限；脚本不会创建桶。
使用 R2 的 S3 凭据，不能用 Pages 的 `CF_API_TOKEN` 代替。
配置完成后运行 Sync 工作流。仅在本地发布成功、非 Pull Request 且开关开启时上传；
工作流的 `dry_run` 输入只下载 OBS，因此会跳过 R2。缺少凭据或上传、校验失败会使工作流失败。
同一工作流的运行串行执行，避免交错发布。

**本地或服务器运行**

通过环境变量注入凭据，不将真实密钥写入配置或提交到 Git：

```bash
export R2_SYNC_ENABLED=true
export R2_ACCOUNT_ID="你的账户 ID"
export R2_ACCESS_KEY_ID="你的 Access Key ID"
export R2_SECRET_ACCESS_KEY="你的 Secret Access Key"
export R2_BUCKET="lingmo-repo"

# 请使用执行 aptly 发布的同一个用户运行。
bash r2_sync.sh --dry-run
bash r2_sync.sh
```

未设置 `R2_SOURCE_DIR` 时，脚本解析当前用户 `aptly config show` 的 `rootDir`，
同步其 `public/` 子目录。它不会假定 `PUBLISH_ROOT=/var/www/aptly` 就是实际输出位置。
如果使用自定义 aptly filesystem endpoint，可显式设置：

```bash
export R2_SOURCE_DIR="/实际的发布目录"
bash r2_sync.sh --dry-run
```

目录需要包含 `pool/`、`dists/`，以及配置中每个发行分支和别名的非空 `Release` 文件。
`LOG_DIR` 默认是 `/var/log/lingmo-repo-sync`，普通用户可覆盖到有写入权限的目录。
如果发布时使用 sudo，同步也要使用相同用户，并通过 sudo 的 `--preserve-env` 显式传递 R2 环境变量。

**上传及校验方式**

1. 上传 `pool/` 软件包。
2. 上传索引、公钥及其他文件，暂不更新 `Release`、`Release.gpg`、`InRelease`。
3. 检查包和索引在远端存在且大小一致；失败即停止。
4. 同步 Release 元数据，并删除远端已不在本地的 Release/签名文件，避免旧 `InRelease` 继续生效。
5. 下载 Release 元数据比较内容，失败返回非零状态。

旧软件包和普通索引文件会保留，避免正在使用旧索引的客户端找不到包；这也意味着桶空间会增长，需另行安排清理。
包和普通索引的检查只比较存在性和大小，不是逐字节完整性检查。
多文件更新并非原子操作，发布过程中仍可能有短暂的索引不一致；同步期间应保持本地发布目录不变，避免手动并发运行。
`--dry-run` 会模拟所有上传和元数据删除操作，跳过上传后校验，不写入远端对象。
上传成功不自动启用公共访问或部署 Pages；客户端访问域名需要另行配置。

测试（使用模拟 rclone，无需网络和真实凭据）：

```bash
bash tests/r2_sync.sh
```

### Cloudflare Pages 软件包搜索网站

网站包含软件包搜索、分支和架构筛选、软件包详情、下载及 APT 接入说明；API 从 R2 读取真实 Release 和 Packages 索引。

当前 Cloudflare Pages 项目 `lingmo-repo-index` 是 Direct Upload 项目，而 Pages 高级 Worker 模式需要 Git 集成项目；现有项目无法转换。请新建 Git 集成项目 `lingmo-packages`，连接仓库 `LingmoOS/repo-sync`，根目录设为 `pages-app`，构建命令 `npm run build`，输出目录 `dist`，并将 `REPO_BUCKET` 指向 R2 桶 `lingmo-repo`。

GitHub Actions 需设置 Variable `PAGES_ENABLED=true`、`PAGES_PROJECT_MODE=git`、`CF_PAGES_PROJECT=lingmo-packages`，以及 Secrets `CF_API_TOKEN`、`R2_ACCOUNT_ID`。如果不想双重部署，可在 Pages 项目中关闭 Git 自动部署，由工作流负责部署及 API 检查。更多说明见 [pages-app/README.md](pages-app/README.md)。
