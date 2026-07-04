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

# OBS rsync 地址（注意：使用 rsync 协议，非 HTTPS）
# 格式：rsync://download.opensuse.org/repositories/home:/LingmoOS/Debian_13/
# 如果 OBS 使用 HTTPS，可搭配 rsync-over-SSH 或配置 local mirror
OBS_URL="rsync://download.opensuse.org/repositories/home:/LingmoOS/Debian_13/"

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
# rsync 选项
# ============================================================
# -a          归档模式（递归 + 保留权限等）
# -v          详细输出
# --delete    删除目标端多余文件
# --safe-links 忽略符号链接指向目标外
# --timeout   网络超时（秒）
# --contimeout 连接超时（秒）
RSYNC_OPTIONS="-av --delete --safe-links --timeout=60 --contimeout=60"
