#!/usr/bin/env bash
#
# sync.sh - main orchestration script
#
# Phases:
#   1. Config validation and dependency checks
#   2. OBS sync to local cache (download.sh)
#   3. aptly import and snapshot creation (import.sh)
#   4. aptly publish (publish.sh)
#   5. Sync to Cloudflare R2 (r2_sync.sh, needs R2_SYNC_ENABLED=true)
#   6. Generate Cloudflare Pages directory index (pages_index.sh, needs PAGES_ENABLED=true)
#

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/config.sh"
source "${SCRIPT_DIR}/lib.sh"

trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

print_banner() {
    echo -e "${CYAN}"
    echo "============================================"
    echo "   Lingmo OS Repository Sync"
    echo "   OBS -> aptly -> R2 -> Pages"
    echo "============================================"
    echo -e "${NC}"
}

run_phase() {
    local phase_name="${1}"
    local phase_script="${2}"
    shift 2

    log_info ">>>>>> Phase start: ${phase_name} <<<<<<"
    log_info "Calling: ${phase_script} $*"

    if "${phase_script}" "$@"; then
        log_success ">>>>>> Phase done: ${phase_name} <<<<<<"
        return 0
    else
        log_error ">>>>>> Phase failed: ${phase_name} <<<<<<"
        return 1
    fi
}

show_summary() {
    local end_time
    end_time=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "${GREEN}"
    echo "============================================"
    echo "   Sync complete"
    echo "   End time : ${end_time}"
    echo "   Log file : ${LOG_FILE}"
    echo "   R2 sync  : ${R2_SYNC_ENABLED:-false}"
    echo "   Pages    : ${PAGES_ENABLED:-false}"
    echo "============================================"
    echo -e "${NC}"
}

main() {
    local start_time
    start_time=$(date '+%Y-%m-%d %H:%M:%S')

    print_banner
    ensure_log_dir

    log_info "===== Lingmo Repository Sync start ====="
    log_info "Start time: ${start_time}"

    # Phase 1: config validation
    log_info "Phase 1/6: config validation and dependency checks"
    validate_config
    check_dependencies

    # Phase 2: OBS sync
    log_info "Phase 2/6: OBS sync"
    if ! run_phase "OBS sync" "${SCRIPT_DIR}/download.sh"; then
        log_error "OBS sync failed, aborting"
        exit 1
    fi

    # Phase 3: aptly import + snapshot
    log_info "Phase 3/6: aptly import and snapshot"
    local snapshot_output
    if ! snapshot_output=$(run_phase "aptly import" "${SCRIPT_DIR}/import.sh"); then
        log_error "aptly import failed, aborting"
        exit 1
    fi

    local snapshot_names
    snapshot_names=$(echo "${snapshot_output}" \
        | grep -v '^\[\(INFO\|WARN\|ERROR\|SUCCESS\)\]' \
        | grep -v '^=====' \
        | grep -v '^$' \
        || true)

    # Phase 4: publish
    log_info "Phase 4/6: aptly publish"
    if [[ -n "${snapshot_names}" ]]; then
        # shellcheck disable=SC2086
        if ! run_phase "aptly publish" "${SCRIPT_DIR}/publish.sh" ${snapshot_names}; then
            log_error "aptly publish failed"
            exit 1
        fi
    else
        log_warn "No new snapshots detected, attempting auto publish"
        if ! run_phase "aptly publish (auto)" "${SCRIPT_DIR}/publish.sh"; then
            log_error "aptly publish failed"
            exit 1
        fi
    fi

    # Phase 5: R2 sync
    log_info "Phase 5/6: Cloudflare R2 sync"
    if [[ "${R2_SYNC_ENABLED:-false}" == "true" ]]; then
        if ! run_phase "R2 sync" "${SCRIPT_DIR}/r2_sync.sh"; then
            log_warn "R2 sync failed, continuing (local publish unaffected)"
        fi
    else
        log_info "R2 sync disabled (R2_SYNC_ENABLED=false), skipping"
    fi

    # Phase 6: Pages index generation
    log_info "Phase 6/6: Cloudflare Pages index generation"
    if [[ "${PAGES_ENABLED:-false}" == "true" ]]; then
        if ! run_phase "Pages index" "${SCRIPT_DIR}/pages_index.sh"; then
            log_warn "Pages index generation failed, continuing"
        fi
    else
        log_info "Pages index disabled (PAGES_ENABLED=false), skipping"
    fi

    show_summary
    log_success "===== Lingmo Repository Sync complete ====="
}

main "$@"
