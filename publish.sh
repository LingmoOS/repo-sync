#!/usr/bin/env bash
#
# publish.sh - aptly 发布模块
#
# 负责：
#   1. 自动检测是否已发布
#   2. 首次发布使用 aptly publish snapshot
#   3. 后续发布使用 aptly publish switch
#   4. 支持 Distribution 和 Codename 同时发布
#   5. GPG 签名控制
#

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/config.sh"
source "${SCRIPT_DIR}/lib.sh"

trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

# ============================================================
# 函数: build_signing_args
# 功能: 根据 SIGN 配置构建签名参数数组
# 参数:
#   $1 - 输出数组名称（nameref）
# 使用:
#   declare -a args; build_signing_args args
#   aptly publish ... "${args[@]}"
# ============================================================
build_signing_args() {
    local -n _out="$1"

    if [[ "${SIGN}" != "true" ]]; then
        _out=("--skip-signing")
        return 0
    fi

    _out=("-gpg-key=${GPG_KEY}" "-keyring=${HOME}/.gnupg/pubring.kbx")
}

# ============================================================
# 函数: publish_or_switch
# 功能: 对单个 distribution 执行发布或切换
# 参数:
#   $1 - snapshot_name: Snapshot 名称
#   $2 - distribution:  发布目标（如 stable、lithium）
#   $3 - publish_root:  发布根目录
# 说明:
#   先检查是否已发布，已发布则 switch，否则 publish。
# ============================================================
publish_or_switch() {
    local snapshot_name="${1}"
    local distribution="${2}"
    local publish_root="${3}"
    local sign_args=()

    # 构建 component 参数数组
    # COMPONENT 可能包含多个值如 "main contrib non-free"
    local comp_args=()
    local comp
    for comp in ${COMPONENT}; do
        comp_args+=("-component=${comp}")
    done

    build_signing_args sign_args

    # 检查是否已发布
    if aptly_publish_exists "${distribution}" "."; then
        log_info "Distribution ${distribution} 已发布，执行 switch"

        run_cmd aptly publish switch \
            -distribution="${distribution}" \
            "${sign_args[@]}" \
            "${snapshot_name}" \
            "${publish_root}"
    else
        log_info "Distribution ${distribution} 未发布，执行首次发布"

        run_cmd aptly publish snapshot \
            -distribution="${distribution}" \
            "${comp_args[@]}" \
            "${sign_args[@]}" \
            "${snapshot_name}" \
            "${publish_root}"
    fi

    log_success "Distribution ${distribution} 发布成功 (${snapshot_name})"
}

# ============================================================
# 函数: publish_one_repo
# 功能: 处理单个 Repository 的发布
# 参数:
#   $1 - snapshot_name: Snapshot 名称
#   $2 - distribution:  主 Distribution 名称
#   $3 - publish_root:  发布根目录
# 说明:
#   如果有对应的 Codename，同时发布到 Codename。
# ============================================================
publish_one_repo() {
    local snapshot_name="${1}"
    local distribution="${2}"
    local publish_root="${3}"

    log_info "===== 发布 Repository: ${distribution} ====="

    # 1. 发布到主 Distribution
    publish_or_switch "${snapshot_name}" "${distribution}" "${publish_root}"

    # 2. 如果有 Codename，同时发布到 Codename
    if [[ -n "${CODENAMES[${distribution}]:-}" ]]; then
        local codename="${CODENAMES[${distribution}]}"
        log_info "检测到 Codename: ${codename}，同步发布"

        publish_or_switch "${snapshot_name}" "${codename}" "${publish_root}"
    fi

    log_success "===== Repository ${distribution} 发布完成 ====="
}

# ============================================================
# 函数: get_latest_snapshot
# 功能: 获取指定 Repository 的最新 Snapshot 名称
# 参数:
#   $1 - repo_name: Repository 名称
# 输出: 最新的 Snapshot 名称
# ============================================================
get_latest_snapshot() {
    local repo_name="${1}"

    # 列出所有匹配的 snapshots，按名称排序，取最后一个
    # snapshot 名称格式: repo_name-YYYYMMDD-HHMMSS
    local latest
    latest=$(aptly snapshot list -raw \
        | grep "^${repo_name}-" \
        | sort \
        | tail -n 1 \
        || true)

    if [[ -z "${latest}" ]]; then
        log_error "未找到 Repository ${repo_name} 的 Snapshot"
        return 1
    fi

    echo "${latest}"
}

# ============================================================
# 主函数
# ============================================================
main() {
    log_info "===== 开始 aptly 发布 ====="

    ensure_log_dir

    # 支持从参数传入 snapshot 列表，也支持自动查找
    # 如果未提供参数，自动查找最新的 snapshot
    local i
    local snapshot_name
    local snapshot_found=false

    if [[ $# -ge 1 ]]; then
        # 参数模式：传入 snapshot 名称列表
        local snapshot_list=("$@")
        local idx=0

        for i in "${!REPO_NAMES[@]}"; do
            if [[ $idx -lt ${#snapshot_list[@]} ]]; then
                snapshot_name="${snapshot_list[$idx]}"
                publish_one_repo \
                    "${snapshot_name}" \
                    "${DISTRIBUTIONS[$i]}" \
                    "${PUBLISH_ROOT}"
                ((idx++)) || true
            fi
            snapshot_found=true
        done
    else
        # 自动模式：从 aptly 查找最新 snapshot
        for i in "${!REPO_NAMES[@]}"; do
            snapshot_name=$(get_latest_snapshot "${REPO_NAMES[$i]}")

            if [[ -n "${snapshot_name}" ]]; then
                publish_one_repo \
                    "${snapshot_name}" \
                    "${DISTRIBUTIONS[$i]}" \
                    "${PUBLISH_ROOT}"
                snapshot_found=true
            fi
        done
    fi

    if [[ "${snapshot_found}" != "true" ]]; then
        log_warn "没有找到任何 Snapshot，跳过发布"
    fi

    log_success "===== 所有发布完成 ====="
}

main "$@"
