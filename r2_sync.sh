#!/usr/bin/env bash
#
# r2_sync.sh - Cloudflare R2 同步模块
#
# 职责：
#   将 aptly 发布目录（PUBLISH_ROOT）同步到 Cloudflare R2 存储桶。
#   使用 rclone 作为传输工具（兼容 S3 API，原生支持 R2）。
#
# 前提：
#   1. 已安装 rclone（>=1.60）
#   2. 已配置 rclone remote：
#        rclone config create cloudflare-r2 s3 \
#          provider Cloudflare \
#          access_key_id "$R2_ACCESS_KEY_ID" \
#          secret_access_key "$R2_SECRET_ACCESS_KEY" \
#          endpoint "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
#          acl private
#      或通过环境变量 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY 自动配置。
#   3. R2_SYNC_ENABLED=true（config.sh 中或环境变量覆盖）
#
# 用法：
#   ./r2_sync.sh              同步 PUBLISH_ROOT -> R2
#   ./r2_sync.sh --dry-run    预演，不实际传输
#

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/config.sh"
source "${SCRIPT_DIR}/lib.sh"

trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

# ============================================================
# 函数: check_r2_config
# 功能: 校验 R2 所需配置是否完整
# ============================================================
check_r2_config() {
    local -i errors=0

    if [[ -z "${R2_ACCOUNT_ID:-}" ]]; then
        log_error "R2_ACCOUNT_ID 未设置"
        ((errors++)) || true
    fi
    if [[ -z "${R2_ACCESS_KEY_ID:-}" ]]; then
        log_error "R2_ACCESS_KEY_ID 未设置"
        ((errors++)) || true
    fi
    if [[ -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
        log_error "R2_SECRET_ACCESS_KEY 未设置"
        ((errors++)) || true
    fi
    if [[ -z "${R2_BUCKET:-}" ]]; then
        log_error "R2_BUCKET 未设置"
        ((errors++)) || true
    fi
    if [[ ! -d "${PUBLISH_ROOT}" ]]; then
        log_error "PUBLISH_ROOT 不存在: ${PUBLISH_ROOT}"
        ((errors++)) || true
    fi

    if [[ ${errors} -gt 0 ]]; then
        log_error "R2 配置校验失败，共 ${errors} 个错误"
        return 1
    fi

    log_success "R2 配置校验通过"
}

# ============================================================
# 函数: setup_rclone_config
# 功能: 通过环境变量动态生成 rclone 配置（无需持久化配置文件）
#       使用 rclone 的环境变量覆盖机制
# ============================================================
setup_rclone_env() {
    local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    # 通过 RCLONE_CONFIG_<REMOTE>_<KEY> 动态注入配置
    # 这样无需修改 rclone.conf 文件，适合 CI/CD 环境
    local remote_upper
    remote_upper=$(echo "${RCLONE_REMOTE}" | tr '[:lower:]-' '[:upper:]_')

    export "RCLONE_CONFIG_${remote_upper}_TYPE=s3"
    export "RCLONE_CONFIG_${remote_upper}_PROVIDER=Cloudflare"
    export "RCLONE_CONFIG_${remote_upper}_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}"
    export "RCLONE_CONFIG_${remote_upper}_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}"
    export "RCLONE_CONFIG_${remote_upper}_ENDPOINT=${endpoint}"
    export "RCLONE_CONFIG_${remote_upper}_ACL=private"
    # 禁用 checksum 校验中的 MD5（R2 不支持 multipart MD5）
    export "RCLONE_CONFIG_${remote_upper}_NO_CHECK_BUCKET=true"

    log_info "rclone 远端配置: ${RCLONE_REMOTE} -> ${endpoint}/${R2_BUCKET}"
}

# ============================================================
# 函数: get_rclone_flags
# 功能: 构建 rclone sync 的公共参数
# 参数:
#   $1 - dry_run: "true" | "false"
#   $2 - output array nameref
# ============================================================
build_rclone_flags() {
    local dry_run="${1}"
    local -n _flags="$2"

    _flags=(
        --transfers 16          # 并行传输数
        --checkers 32           # 并行校验数
        --retries 3             # 失败重试次数
        --low-level-retries 5   # 低层重试次数
        --stats 30s             # 每 30s 输出一次进度
        --stats-one-line        # 单行进度显示
        --log-level INFO
        # 内容类型推断
        --use-server-modtime=false
        # 删除目标中不在源里的文件（镜像同步）
        --delete-after
        # 跳过不支持的符号链接
        --skip-links
    )

    # deb 文件不压缩传输（已压缩）
    _flags+=(--no-gzip-encoding)

    if [[ "${dry_run}" == "true" ]]; then
        _flags+=(--dry-run)
        log_info "[DRY-RUN] 预演模式，不会实际上传"
    fi
}

# ============================================================
# 函数: sync_to_r2
# 功能: 将 PUBLISH_ROOT 同步到 R2 存储桶
# 参数:
#   $1 - dry_run: "true" | "false"（可选，默认 false）
# ============================================================
sync_to_r2() {
    local dry_run="${1:-false}"
    local rclone_dest="${RCLONE_REMOTE}:${R2_BUCKET}"

    log_info "开始同步到 R2"
    log_info "  源目录 : ${PUBLISH_ROOT}"
    log_info "  目标   : ${rclone_dest}"

    # 统计本地文件数
    local file_count
    file_count=$(find "${PUBLISH_ROOT}" -type f | wc -l)
    log_info "  本地文件数: ${file_count}"

    local -a flags
    build_rclone_flags "${dry_run}" flags

    # 执行同步
    run_cmd rclone sync \
        "${PUBLISH_ROOT}/" \
        "${rclone_dest}/" \
        "${flags[@]}"

    log_success "R2 同步完成"

    # 输出存储桶统计
    if [[ "${dry_run}" != "true" ]]; then
        log_info "R2 存储桶文件统计："
        rclone size "${rclone_dest}/" \
            --log-level ERROR \
            || true
    fi
}

# ============================================================
# 函数: verify_r2_sync
# 功能: 校验关键文件是否已上传到 R2
# ============================================================
verify_r2_sync() {
    local rclone_dest="${RCLONE_REMOTE}:${R2_BUCKET}"
    local -i errors=0

    log_info "校验 R2 同步结果..."

    # 检查每个 distribution 的 Release 文件是否存在
    local dist
    for dist in "${DISTRIBUTIONS[@]}"; do
        local release_path="dists/${dist}/Release"

        if rclone ls "${rclone_dest}/${release_path}" \
            --log-level ERROR &>/dev/null; then
            log_success "  ✓ ${release_path}"
        else
            log_warn "  ✗ ${release_path} 不存在（可能尚未发布）"
        fi
    done

    if [[ ${errors} -gt 0 ]]; then
        log_error "R2 校验失败"
        return 1
    fi

    log_success "R2 校验通过"
}

# ============================================================
# 主函数
# ============================================================
main() {
    local dry_run="false"

    # 参数解析
    while [[ $# -gt 0 ]]; do
        case "${1}" in
            --dry-run|-n)
                dry_run="true"
                shift
                ;;
            -h|--help)
                echo "用法: $0 [--dry-run]"
                echo "  --dry-run  预演模式，不实际上传"
                exit 0
                ;;
            *)
                log_warn "未知参数: ${1}"
                shift
                ;;
        esac
    done

    ensure_log_dir

    log_info "===== 开始 Cloudflare R2 同步 ====="

    # 检查是否启用
    if [[ "${R2_SYNC_ENABLED:-false}" != "true" ]]; then
        log_warn "R2 同步未启用（R2_SYNC_ENABLED=false），跳过"
        log_warn "如需启用，请在 config.sh 中设置 R2_SYNC_ENABLED=true"
        exit 0
    fi

    # 检查 rclone 是否安装
    if ! command -v rclone &>/dev/null; then
        log_error "rclone 未安装，请先安装: https://rclone.org/install/"
        exit 1
    fi

    log_info "rclone 版本: $(rclone version --check 2>&1 | head -1 || rclone version | head -1)"

    # 配置校验
    check_r2_config

    # 注入 rclone 环境变量配置
    setup_rclone_env

    # 执行同步
    sync_to_r2 "${dry_run}"

    # 同步后校验
    if [[ "${dry_run}" != "true" ]]; then
        verify_r2_sync
    fi

    log_success "===== Cloudflare R2 同步完成 ====="
}

main "$@"
