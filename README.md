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

### 方案一：全自动（推荐）

```bash
./sync.sh
```

一键完成：同步 -> 导入 -> 创建快照 -> 发布。

### 方案二：分步执行

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
curl -fsSL https://repo.lingmo.dev/public-key.asc | gpg --dearmor > /etc/apt/trusted.gpg.d/lingmo.gpg

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

## 扩展指南

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

可在 `sync.sh` 发布阶段后增加：

```bash
# 使用 rclone 同步到 R2
rclone sync /var/www/aptly r2:lingmo-repo
```

### Cloudflare Pages 部署

可在 `sync.sh` 发布阶段后增加：

```bash
# 使用 wrangler 部署
wrangler pages publish /var/www/aptly
```
