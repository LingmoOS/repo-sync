# ============================================================
# lib.sh 单元测试
#
# 使用 bats 测试框架。
# 运行: bats tests/
#
# 这些测试验证 lib.sh 中的工具函数行为是否正确，
# 不依赖外部工具（rsync、aptly）的实际调用。
# ============================================================

setup() {
    # 每个测试前加载被测模块
    export LOG_DIR="${BATS_TEST_TMPDIR}/logs"
    export CACHE_DIR="${BATS_TEST_TMPDIR}/cache"
    export OBS_URL="rsync://localhost/test"
    export REPO_NAMES=("test-repo")
    export DISTRIBUTIONS=("unstable")
    export ARCHS=("amd64")
    export COMPONENT="main"
    export PUBLISH_ROOT="${BATS_TEST_TMPDIR}/publish"
    export GPG_KEY=""
    export SIGN=false
    export RSYNC_OPTIONS="-av --delete"

    # shellcheck source=../lib.sh
    source "${BATS_TEST_DIRNAME}/../lib.sh"
}

# ------------------------------------------------------------
# 日志函数
# ------------------------------------------------------------

@test "ensure_log_dir — creates log directory" {
    run ensure_log_dir
    [ -d "${LOG_DIR}" ]
}

@test "log_info — writes to log file and stdout" {
    ensure_log_dir
    run log_info "hello world"
    [ "$status" -eq 0 ]
    grep -q "hello world" "${LOG_FILE}"
}

@test "log_error — writes to log file and stderr" {
    ensure_log_dir
    run log_error "error msg"
    [ "$status" -eq 0 ]
    grep -q "error msg" "${LOG_FILE}"
}

@test "log_warn — writes to log file" {
    ensure_log_dir
    run log_warn "warn msg"
    [ "$status" -eq 0 ]
    grep -q "warn msg" "${LOG_FILE}"
}

@test "log_success — writes to log file" {
    ensure_log_dir
    run log_success "success msg"
    [ "$status" -eq 0 ]
    grep -q "success msg" "${LOG_FILE}"
}

# ------------------------------------------------------------
# 日志级别标记
# ------------------------------------------------------------

@test "log_info — contains [INFO] prefix" {
    ensure_log_dir
    run log_info "test"
    grep -q '\[INFO\]' "${LOG_FILE}"
}

@test "log_error — contains [ERROR] prefix" {
    ensure_log_dir
    run log_error "test"
    grep -q '\[ERROR\]' "${LOG_FILE}"
}

@test "log_warn — contains [WARN] prefix" {
    ensure_log_dir
    run log_warn "test"
    grep -q '\[WARN\]' "${LOG_FILE}"
}

@test "log_success — contains [SUCCESS] prefix" {
    ensure_log_dir
    run log_success "test"
    grep -q '\[SUCCESS\]' "${LOG_FILE}"
}

# ------------------------------------------------------------
# 时间戳
# ------------------------------------------------------------

@test "get_timestamp — returns YYYYMMDD-HHMMSS format" {
    run get_timestamp
    [ "$status" -eq 0 ]
    # 格式: 8位数字-6位数字
    [[ "$output" =~ ^[0-9]{8}-[0-9]{6}$ ]]
}

# ------------------------------------------------------------
# 配置验证
# ------------------------------------------------------------

@test "validate_config — fails when OBS_URL is empty" {
    OBS_URL=""
    run validate_config
    [ "$status" -ne 0 ]
}

@test "validate_config — fails when REPO_NAMES is empty" {
    REPO_NAMES=()
    run validate_config
    [ "$status" -ne 0 ]
}

@test "validate_config — fails when DISTRIBUTIONS count mismatches" {
    REPO_NAMES=("a" "b")
    DISTRIBUTIONS=("x")
    run validate_config
    [ "$status" -ne 0 ]
}

@test "validate_config — fails when ARCHS is empty" {
    ARCHS=()
    run validate_config
    [ "$status" -ne 0 ]
}

@test "validate_config — passes with minimal valid config" {
    run validate_config
    [ "$status" -eq 0 ]
}

# ------------------------------------------------------------
# 目录管理
# ------------------------------------------------------------

@test "ensure_cache_dir — creates cache directory" {
    run ensure_cache_dir
    [ -d "${CACHE_DIR}" ]
}

@test "ensure_cache_dir — succeeds if directory already exists" {
    mkdir -p "${CACHE_DIR}"
    run ensure_cache_dir
    [ "$status" -eq 0 ]
}

# ------------------------------------------------------------
# 命令执行
# ------------------------------------------------------------

@test "run_cmd — echoes the command" {
    ensure_log_dir
    run run_cmd true
    [ "$status" -eq 0 ]
    grep -q "执行: true" "${LOG_FILE}"
}

@test "run_cmd — returns 0 on success" {
    run run_cmd true
    [ "$status" -eq 0 ]
}

@test "run_cmd — returns non-zero on failure" {
    run run_cmd false
    [ "$status" -ne 0 ]
}
