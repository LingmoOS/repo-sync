#!/usr/bin/env bash
#
# import.sh - aptly 导入与快照模块
#
# 负责：
#   1. 创建 / 重建 aptly Repository
#   2. 导入 .deb 和 .dsc 软件包
#   3. 创建 Snapshot
#
# 每次重新导入全部，不做增量。
#

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/config.sh"
source "${SCRIPT_DIR}/lib.sh"

trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

# ============================================================
# 函数: drop_repo_completely
# 功能: 尝试完全删除 repository 及其关联的 snapshots
# 参数:
#   $1 - repo_name: aptly Repository 名称
# 返回:
#   0 - 成功删除 repo（clean state）
#   1 - repo 无法删除（有已发布的 snapshot 引用）
# 说明:
#   只删除未被发布的 snapshot；已发布的 snapshot 保留。
#   如果 repo 无法删除，调用方应使用 force-replace 导入。
# ============================================================
drop_repo_completely() {
    local repo_name="${1}"

    # 检查 repo 是否存在
    if ! aptly_repo_exists "${repo_name}"; then
        return 1
    fi

    log_info "开始清理 Repository: ${repo_name}"

    # 查找所有关联的 snapshots（命名约定: repo_name-*）
    local related_snaps
    local snap
    related_snaps=$(aptly snapshot list -raw | grep "^${repo_name}-" || true)

    if [[ -n "${related_snaps}" ]]; then
        while IFS= read -r snap; do
            # 跳过已发布的 snapshot
            if aptly publish list -raw | grep -q "${snap}"; then
                log_info "Snapshot ${snap} 已发布，保留"
                continue
            fi
            log_info "删除 Snapshot: ${snap}"
            aptly snapshot drop "${snap}"
        done <<< "${related_snaps}"
    fi

    # 尝试删除 repository
    log_info "尝试删除 Repository: ${repo_name}"

    if aptly repo drop "${repo_name}"; then
        log_success "Repository ${repo_name} 已完全清理"
        return 0
    fi

    # 如果 repo 还有已发布的 snapshot 引用，则无法删除
    log_warn "Repository ${repo_name} 无法删除（有已发布的 Snapshot 引用）"
    log_warn "将使用 force-replace 模式导入"
    return 1
}

# ============================================================
# 函数: create_repo
# 功能: 创建 aptly Repository
# 参数:
#   $1 - repo_name: Repository 名称
# ============================================================
create_repo() {
    local repo_name="${1}"

    log_info "创建 Repository: ${repo_name}"
    aptly repo create \
        -comment="Lingmo OS ${repo_name} repository" \
        "${repo_name}"

    log_success "Repository ${repo_name} 创建成功"
}

# ============================================================
# 函数: import_debs
# 功能: 将 .deb 文件导入 aptly Repository
# 参数:
#   $1 - repo_name: Repository 名称
#   $2 - cache_dir: 缓存目录
#   $3 - force_replace: 是否使用 -force-replace（可选）
# ============================================================
import_debs() {
    local repo_name="${1}"
    local cache_dir="${2}"
    local force_replace="${3:-false}"
    local add_args=()

    if [[ "${force_replace}" == "true" ]]; then
        add_args+=("--force-replace")
    fi

    log_info "导入 .deb 软件包到 ${repo_name}"

    # 查找所有 .deb
    local deb_files
    deb_files=$(find "${cache_dir}" -name '*.deb' -type f 2>/dev/null)

    if [[ -z "${deb_files}" ]]; then
        log_warn "未找到 .deb 文件"
        return 0
    fi

    # 批量导入（每批 200 个文件，避免命令行过长）
    echo "${deb_files}" | xargs -P 1 -n 200 aptly repo add "${add_args[@]}" "${repo_name}"

    local count
    count=$(echo "${deb_files}" | wc -l)
    log_success "已导入 ${count} 个 .deb 软件包到 ${repo_name}"
}

# ============================================================
# 函数: import_sources
# 功能: 将 .dsc 源码包导入 aptly Repository
# 参数:
#   $1 - repo_name: Repository 名称
#   $2 - cache_dir: 缓存目录
#   $3 - force_replace: 是否使用 -force-replace（可选）
# 说明:
#   aptly 在导入 .dsc 时会自动查找同目录下的关联文件
#   （orig.tar.*、debian.tar.*、diff.gz）
# ============================================================
import_sources() {
    local repo_name="${1}"
    local cache_dir="${2}"
    local force_replace="${3:-false}"
    local add_args=()

    if [[ "${force_replace}" == "true" ]]; then
        add_args+=("--force-replace")
    fi

    log_info "导入源码包到 ${repo_name}"

    # 查找所有 .dsc
    local dsc_files
    dsc_files=$(find "${cache_dir}" -name '*.dsc' -type f 2>/dev/null)

    if [[ -z "${dsc_files}" ]]; then
        log_warn "未找到 .dsc 文件"
        return 0
    fi

    # 批量导入（每批 100 个文件）
    echo "${dsc_files}" | xargs -P 1 -n 100 aptly repo add "${add_args[@]}" "${repo_name}"

    local count
    count=$(echo "${dsc_files}" | wc -l)
    log_success "已导入 ${count} 个源码包到 ${repo_name}"
}

# ============================================================
# 函数: create_snapshot
# 功能: 从 Repository 创建 Snapshot
# 参数:
#   $1 - repo_name: Repository 名称
# 返回: 输出 snapshot 名称（供后续使用）
# ============================================================
create_snapshot() {
    local repo_name="${1}"
    local timestamp
    local snapshot_name

    timestamp=$(get_timestamp)
    snapshot_name="${repo_name}-${timestamp}"

    log_info "创建 Snapshot: ${snapshot_name}"

    aptly snapshot create \
        "${snapshot_name}" \
        from repo "${repo_name}"

    log_success "Snapshot ${snapshot_name} 创建成功"

    # 输出 snapshot 名称，供调用者捕获
    echo "${snapshot_name}"
}

# ============================================================
# 函数: process_one_repo
# 功能: 处理单个 Repository 的完整流程
# 参数:
#   $1 - repo_name: Repository 名称
#   $2 - dist: Distribution 名称
# 输出: 最后一行是创建的 snapshot 名称
# ============================================================
process_one_repo() {
    local repo_name="${1}"
    local dist="${2}"
    local snapshot_name
    local force_replace=false

    log_info "===== 处理 Repository: ${repo_name} (${dist}) ====="

    # 1. 尝试重建 repository（完全删除 + 新建）
    if drop_repo_completely "${repo_name}"; then
        # 成功删除，创建新 repo
        create_repo "${repo_name}"
        force_replace=false
    else
        # repo 无法删除或不存在
        if aptly_repo_exists "${repo_name}"; then
            # repo 存在但有已发布的 snapshot 引用，使用 force-replace
            log_info "Repository ${repo_name} 保留现有仓库，使用 force-replace 模式"
            force_replace=true
        else
            # repo 不存在，直接创建
            create_repo "${repo_name}"
            force_replace=false
        fi
    fi

    # 2. 导入软件包
    import_debs "${repo_name}" "${CACHE_DIR}" "${force_replace}"
    import_sources "${repo_name}" "${CACHE_DIR}" "${force_replace}"

    # 3. 显示 repo 统计
    aptly repo show "${repo_name}"

    # 4. 创建 snapshot
    snapshot_name=$(create_snapshot "${repo_name}")

    log_success "===== Repository ${repo_name} 处理完成 ====="

    # 输出 snapshot 名称
    echo "${snapshot_name}"
}

# ============================================================
# 主函数
# ============================================================
main() {
    log_info "===== 开始 aptly 导入与快照 ====="

    ensure_log_dir

    # 依次处理每个 Repository
    local i
    local snapshot_names=()
    local snapshot_name

    for i in "${!REPO_NAMES[@]}"; do
        snapshot_name=$(process_one_repo \
            "${REPO_NAMES[$i]}" \
            "${DISTRIBUTIONS[$i]}")
        snapshot_names+=("${snapshot_name}")
    done

    # 输出所有创建的 snapshot 名称（供 publish.sh 使用）
    local snap
    for snap in "${snapshot_names[@]}"; do
        echo "${snap}"
    done

    log_success "===== 所有 Repository 导入与快照完成 ====="
}

main "$@"
