#!/usr/bin/env bash
#
# config.sh - 配置文件
#
# shellcheck disable=SC2034
# 本文件被各脚本 source 加载，变量在 sourcing 脚本中使用
#
# 说明：
#   所有配置集中在此文件中，各脚本通过 source 加载。
#   修改配置后无需改动其他脚本。
#

# ============================================================
# OBS 仓库配置
# ============================================================

# OBS 仓库 HTTPS 地址
# wget 会递归下载此 URL 下的所有文件
OBS_URL="https://download.opensuse.org/repositories/home:/LingmoOS/Debian_13/"

# ============================================================
# 本地缓存目录
# ============================================================

# rsync 下载后存放的本地路径
CACHE_DIR="/var/cache/lingmo-repo-sync"

# ============================================================
# aptly Repository 名称列表
# ============================================================
# 每个名称对应一个 aptly 仓库，用于导入不同等级的软件包
# 顺序必须与 DISTRIBUTIONS 数组一一对应
REPO_NAMES=(
    "lingmo-stable"
    "lingmo-testing"
    "lingmo-unstable"
    "lingmo-experimental"
)

# ============================================================
# Distribution 列表（与 REPO_NAMES 一一对应）
# ============================================================
DISTRIBUTIONS=(
    "stable"
    "testing"
    "unstable"
    "experimental"
)

# ============================================================
# Codename 映射（distribution -> codename）
# ============================================================
# 用于同时发布两个 Distribution 指向同一 Snapshot
# 例如：stable 和 lithium 同时发布
declare -A CODENAMES=(
    ["stable"]="lithium"
    ["testing"]="boron"
)

# ============================================================
# 架构列表（可扩展）
# ============================================================
# 目前仅 amd64，后续可添加 arm64、riscv64
ARCHS=("amd64")

# ============================================================
# Component
# ============================================================
COMPONENT="main"

# ============================================================
# aptly 发布根目录
# ============================================================
# aptly publish 输出的根路径，通常为 Web 服务器文档根目录
PUBLISH_ROOT="/var/www/aptly"

# ============================================================
# GPG 签名配置
# ============================================================

# GPG 密钥 ID 或邮箱
GPG_KEY=""

# 是否启用 GPG 签名（true / false）
# 若为 true，必须设置 GPG_KEY
SIGN=false

# ============================================================
# lftp 选项
# ============================================================
# --continue        断点续传
# --parallel=8      并行下载数
# --no-recursion    不递归子目录（mirror 自带递归）
# --verbose         显示详情
# --use-pget-n=8    每个文件分 8 块并行下载
LFTP_OPTIONS="--continue --parallel=8 --verbose"

# 日志目录，可通过环境变量覆盖。
LOG_DIR="${LOG_DIR:-/var/log/lingmo-repo-sync}"

# Cloudflare R2：密钥仅通过环境变量提供。
R2_SYNC_ENABLED="${R2_SYNC_ENABLED:-false}"
R2_BUCKET="${R2_BUCKET:-lingmo-repo}"
RCLONE_REMOTE="${RCLONE_REMOTE:-lingmo_r2}"
# 留空时读取当前用户的 aptly config show，使用 rootDir/public。
# 自定义 aptly filesystem endpoint 时，显式填写其实际发布目录。
R2_SOURCE_DIR="${R2_SOURCE_DIR:-}"
