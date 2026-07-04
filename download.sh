#!/usr/bin/env bash
#
# download.sh - OBS 同步下载模块
#
# 通过 rsync 将 OBS 仓库同步到本地缓存目录。
# 支持按架构和文件类型过滤，节省带宽和磁盘空间。
#

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/config.sh"
source "${SCRIPT_DIR}/lib.sh"

trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

# ============================================================
# 函数: rsync_sync
# 功能: 执行 rsync 同步
# 参数: 无（使用全局配置）
# 返回: 0 成功，非 0 失败
# ============================================================
rsync_sync() {
    local include_patterns=(
        "*/"                   # 遍历所有子目录
        "*.deb"                # 二进制包
        "*.dsc"                # 源码包描述文件
        "*.orig.tar.*"         # 原始源码 tarball
        "*.debian.tar.*"       # Debian 修改 tarball
        "*.diff.gz"            # Debian diff
        "*.tar.xz"             # 通用源码压缩包
        "*.tar.gz"             # 通用源码压缩包
        "*.tar.bz2"            # 通用源码压缩包
        "Release"              # 仓库 Release 文件
        "Release.gpg"          # GPG 签名的 Release
        "InRelease"            # 内嵌签名的 Release
        "Packages*"            # 包索引（含 .gz/.xz/.bz2）
        "Sources*"             # 源码索引（含 .gz/.xz/.bz2）
        "*.buildinfo"          # 构建信息
        "*.changes"            # 变更文件
    )

    local rsync_args=()
    # 将 RSYNC_OPTIONS 字符串安全拆分为数组
    # shellcheck disable=SC2206
    read -ra rsync_args <<< "${RSYNC_OPTIONS}"

    # 添加包含模式
    local pattern
    for pattern in "${include_patterns[@]}"; do
        rsync_args+=(--include="${pattern}")
    done

    # 排除所有其他文件
    rsync_args+=(--exclude="*")

    # 源和目标
    rsync_args+=("${OBS_URL}" "${CACHE_DIR}/")

    log_info "开始 rsync 同步..."
    log_info "源: ${OBS_URL}"
    log_info "目标: ${CACHE_DIR}"

    if run_cmd rsync "${rsync_args[@]}"; then
        log_success "OBS 同步完成"
        return 0
    else
        log_error "OBS 同步失败"
        return 1
    fi
}

# ============================================================
# 函数: show_cache_stats
# 功能: 显示缓存目录统计信息
# ============================================================
show_cache_stats() {
    local file_count
    local total_size

    file_count=$(find "${CACHE_DIR}" -type f 2>/dev/null | wc -l)
    total_size=$(du -sh "${CACHE_DIR}" 2>/dev/null | cut -f1)

    log_info "缓存文件数: ${file_count}"
    log_info "缓存大小: ${total_size}"
}

# ============================================================
# 函数: find_packages
# 功能: 查找缓存目录中的 .deb 文件
# 输出: 文件路径列表（每行一个）
# ============================================================
find_packages() {
    find "${CACHE_DIR}" -name '*.deb' -type f 2>/dev/null
}

# ============================================================
# 函数: find_sources
# 功能: 查找缓存目录中的 .dsc 文件
# 输出: 文件路径列表（每行一个）
# ============================================================
find_sources() {
    find "${CACHE_DIR}" -name '*.dsc' -type f 2>/dev/null
}

# ============================================================
# 主函数
# ============================================================
main() {
    log_info "===== 开始 OBS 仓库同步 ====="

    ensure_log_dir
    ensure_cache_dir

    if ! rsync_sync; then
        exit 1
    fi

    show_cache_stats
    log_success "===== OBS 仓库同步完成 ====="
}

main "$@"
