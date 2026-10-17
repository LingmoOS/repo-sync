#!/usr/bin/env bash
# 将已发布的 APT 仓库增量上传到 R2，保留远端旧包。
# 用法：R2_SYNC_ENABLED=true ./r2_sync.sh [--dry-run]
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"
# 工作流可能重新生成 config.sh，因此在此也提供默认值。
LOG_DIR="${LOG_DIR:-/var/log/lingmo-repo-sync}"
R2_SYNC_ENABLED="${R2_SYNC_ENABLED:-false}"
R2_BUCKET="${R2_BUCKET:-lingmo-repo}"
RCLONE_REMOTE="${RCLONE_REMOTE:-lingmo_r2}"
R2_SOURCE_DIR="${R2_SOURCE_DIR:-}"
source "${SCRIPT_DIR}/lib.sh"
trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

check_r2_config() {
    local name
    for name in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
        if [[ -z "${!name:-}" ]]; then
            log_error "${name} 未设置"
            return 1
        fi
    done
    if [[ ! "${RCLONE_REMOTE}" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
        log_error "RCLONE_REMOTE 必须以字母开头，仅包含字母、数字或下划线"
        return 1
    fi
    if [[ ! "${R2_BUCKET}" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]; then
        log_error "R2_BUCKET 必须为存储桶名称，不能包含路径"
        return 1
    fi
}

resolve_source_dir() {
    if [[ -z "${R2_SOURCE_DIR}" ]]; then
        local dep aptly_root
        for dep in aptly python3; do
            if ! command -v "${dep}" &>/dev/null; then
                log_error "自动识别发布目录需要 ${dep}，或设置 R2_SOURCE_DIR"
                return 1
            fi
        done
        aptly_root=$(aptly config show | python3 -c '
import json, sys
root = json.load(sys.stdin).get("rootDir")
if not isinstance(root, str) or not root or not root.startswith("/"):
    sys.exit("aptly rootDir must be an absolute path")
print(root.rstrip("/"))
') || return 1
        R2_SOURCE_DIR="${aptly_root}/public"
    fi
    if [[ ! -d "${R2_SOURCE_DIR}/pool" || ! -d "${R2_SOURCE_DIR}/dists" ]]; then
        log_error "发布目录必须包含 pool/ 和 dists/: ${R2_SOURCE_DIR}"
        return 1
    fi
    # 在任何远端操作前检查所有配置的发行分支及其别名。
    if [[ ${#DISTRIBUTIONS[@]} -eq 0 ]]; then
        log_error "DISTRIBUTIONS 不能为空"
        return 1
    fi
    local dist codename
    for dist in "${DISTRIBUTIONS[@]}"; do
        if [[ ! -s "${R2_SOURCE_DIR}/dists/${dist}/Release" ]]; then
            log_error "缺少或为空的 Release: ${dist}"
            return 1
        fi
        codename="${CODENAMES[${dist}]:-}"
        if [[ -n "${codename}" && ! -s "${R2_SOURCE_DIR}/dists/${codename}/Release" ]]; then
            log_error "缺少或为空的 Release: ${codename}"
            return 1
        fi
    done
}

setup_rclone_env() {
    local remote_upper="${RCLONE_REMOTE^^}"
    export "RCLONE_CONFIG_${remote_upper}_TYPE=s3"
    export "RCLONE_CONFIG_${remote_upper}_PROVIDER=Cloudflare"
    export "RCLONE_CONFIG_${remote_upper}_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}"
    export "RCLONE_CONFIG_${remote_upper}_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}"
    export "RCLONE_CONFIG_${remote_upper}_ENDPOINT=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    export "RCLONE_CONFIG_${remote_upper}_REGION=auto"
    # 使用仅限对象读写的凭据时，不尝试创建或检查存储桶。
    export "RCLONE_CONFIG_${remote_upper}_NO_CHECK_BUCKET=true"
}

sync_to_r2() {
    local dry_run="$1"
    local destination="${RCLONE_REMOTE}:${R2_BUCKET}"
    local flags=(
        --transfers 16 --checkers 32 --retries 3 --low-level-retries 5
        --stats 30s --stats-one-line --log-level INFO --copy-links
    )
    local release_filters=(
        --include '/dists/*/Release' --include '/dists/*/Release.gpg'
        --include '/dists/*/InRelease'
    )
    local content_filters=(
        --exclude '/dists/*/Release' --exclude '/dists/*/Release.gpg'
        --exclude '/dists/*/InRelease'
    )
    if [[ "${dry_run}" == true ]]; then
        flags+=(--dry-run)
    fi
    log_info "同步 ${R2_SOURCE_DIR} -> ${destination}"

    # 包先于索引；copy 保留旧包，避免旧客户端索引仍引用的包被删除。
    run_cmd rclone copy "${R2_SOURCE_DIR}/pool/" "${destination}/pool/" "${flags[@]}" || return 1
    # 索引与公钥等其他文件；发布元数据在校验后单独上传。
    run_cmd rclone copy "${R2_SOURCE_DIR}/" "${destination}/" "${flags[@]}" \
        --exclude '/pool/**' "${content_filters[@]}" || return 1
    if [[ "${dry_run}" != true ]]; then
        run_cmd rclone check "${R2_SOURCE_DIR}/" "${destination}/" \
            --one-way --size-only --copy-links "${content_filters[@]}" || return 1
    fi
    # 仅同步 Release 元数据；移除已停用的签名，避免旧 InRelease 遮蔽新 Release。
    run_cmd rclone sync "${R2_SOURCE_DIR}/" "${destination}/" "${flags[@]}" \
        --delete-after "${release_filters[@]}" || return 1
    if [[ "${dry_run}" != true ]]; then
        # Release 文件较小，下载比较内容；包与索引在上一阶段比较存在性及大小。
        run_cmd rclone check "${R2_SOURCE_DIR}/" "${destination}/" \
            --one-way --download --copy-links "${release_filters[@]}" || return 1
        log_success "R2 上传及校验完成"
    else
        log_success "R2 预演完成，未上传文件"
    fi
}

main() {
    local dry_run=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run|-n) dry_run=true ;;
            --help|-h) echo "用法: $0 [--dry-run]"; return 0 ;;
            *) echo "未知参数: $1" >&2; return 2 ;;
        esac
        shift
    done
    if [[ "${R2_SYNC_ENABLED}" == false ]]; then
        echo "R2 同步未启用，设置 R2_SYNC_ENABLED=true 后运行"
        return 0
    fi
    ensure_log_dir
    if [[ "${R2_SYNC_ENABLED}" != true ]]; then
        log_error "R2_SYNC_ENABLED 必须为 true 或 false"
        return 1
    fi
    check_r2_config || return 1
    if ! command -v rclone &>/dev/null; then
        log_error "请先安装 rclone"
        return 1
    fi
    resolve_source_dir || return 1
    setup_rclone_env
    sync_to_r2 "${dry_run}" || return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
