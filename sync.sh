#!/usr/bin/env bash
#
# sync.sh - 主流程编排脚本
#
# 完整的同步流程：
#   ① 配置加载与验证
#   ② 依赖检查
#   ③ OBS -> 本地缓存同步（download.sh）
#   ④ 导入 aptly Repository 并创建 Snapshot（import.sh）
#   ⑤ 发布 Snapshot（publish.sh）
#
# 支持独立运行各子模块：
#   ./download.sh   只执行同步
#   ./import.sh     只执行导入
#   ./publish.sh    只执行发布
#

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/config.sh"
source "${SCRIPT_DIR}/lib.sh"

trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

# ============================================================
# 函数: print_banner
# 功能: 打印启动横幅
# ============================================================
print_banner() {
    echo -e "${CYAN}"
    echo "============================================"
    echo "   Lingmo OS Repository Sync"
    echo "   OBS -> aptly 全自动同步工具"
    echo "============================================"
    echo -e "${NC}"
}

# ============================================================
# 函数: run_phase
# 功能: 执行单个阶段，并统一记录起止时间
# 参数:
#   $1 - phase_name: 阶段名称
#   $2 - phase_script: 子脚本路径
#   剩余参数 - 传递给子脚本
# ============================================================
run_phase() {
    local phase_name="${1}"
    local phase_script="${2}"
    shift 2

    log_info ">>>>>> 阶段开始: ${phase_name} <<<<<<"
    log_info "调用: ${phase_script} $*"

    if "${phase_script}" "$@"; then
        log_success ">>>>>> 阶段完成: ${phase_name} <<<<<<"
        return 0
    else
        log_error ">>>>>> 阶段失败: ${phase_name} <<<<<<"
        return 1
    fi
}

# ============================================================
# 函数: show_summary
# 功能: 输出同步摘要
# ============================================================
show_summary() {
    local end_time
    end_time=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "${GREEN}"
    echo "============================================"
    echo "   同步完成"
    echo "   结束时间: ${end_time}"
    echo "   日志文件: ${LOG_FILE}"
    echo "============================================"
    echo -e "${NC}"
}

# ============================================================
# 主函数
# ============================================================
main() {
    local start_time
    start_time=$(date '+%Y-%m-%d %H:%M:%S')

    print_banner

    # 初始化日志
    ensure_log_dir

    log_info "===== Lingmo Repository Sync 启动 ====="
    log_info "开始时间: ${start_time}"

    # 1. 配置验证
    log_info "阶段 1/4: 配置验证与依赖检查"
    validate_config
    check_dependencies

    # 2. 同步 OBS 到本地缓存
    log_info "阶段 2/4: OBS 同步"
    if ! run_phase "OBS 同步" "${SCRIPT_DIR}/download.sh"; then
        log_error "OBS 同步失败，终止流程"
        exit 1
    fi

    # 3. 导入并创建快照
    log_info "阶段 3/4: aptly 导入与快照"
    local snapshot_output
    if ! snapshot_output=$(run_phase "aptly 导入" "${SCRIPT_DIR}/import.sh"); then
        log_error "aptly 导入失败，终止流程"
        exit 1
    fi

    # 从 import.sh 的输出中提取 snapshot 名称（最后几行）
    # import.sh 的 stdout 包含多行 log + 最后几行 snapshot 名称
    local snapshot_names
    snapshot_names=$(echo "${snapshot_output}" \
        | grep -v '^\[\(INFO\|WARN\|ERROR\|SUCCESS\)\]' \
        | grep -v '^=====' \
        | grep -v '^$' \
        || true)

    # 4. 发布
    log_info "阶段 4/4: aptly 发布"
    if [[ -n "${snapshot_names}" ]]; then
        # shellcheck disable=SC2086
        if ! run_phase "aptly 发布" "${SCRIPT_DIR}/publish.sh" ${snapshot_names}; then
            log_error "aptly 发布失败"
            exit 1
        fi
    else
        log_warn "未检测到新创建的 Snapshot，跳过发布阶段"
        # 尝试自动模式发布
        if ! run_phase "aptly 发布(自动)" "${SCRIPT_DIR}/publish.sh"; then
            log_error "aptly 发布失败"
            exit 1
        fi
    fi

    # 摘要
    show_summary
    log_success "===== Lingmo Repository Sync 完成 ====="
}

main "$@"
