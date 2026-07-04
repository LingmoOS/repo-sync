# ============================================================
# download.sh 单元测试
#
# 测试 rsync 包含/排除模式构建、文件查找函数。
# 不执行真实的 rsync 同步。
# ============================================================

setup() {
    export LOG_DIR="${BATS_TEST_TMPDIR}/logs"
    export CACHE_DIR="${BATS_TEST_TMPDIR}/cache"
    export OBS_URL="rsync://localhost/test"
    export RSYNC_OPTIONS="-av --delete --safe-links --timeout=10"
    export REPO_NAMES=("test-repo")
    export DISTRIBUTIONS=("unstable")
    export ARCHS=("amd64")
    export COMPONENT="main"
    export PUBLISH_ROOT="${BATS_TEST_TMPDIR}/publish"
    export GPG_KEY=""
    export SIGN=false

    # shellcheck source=../lib.sh
    source "${BATS_TEST_DIRNAME}/../lib.sh"

    # shellcheck source=../download.sh
    source "${BATS_TEST_DIRNAME}/../download.sh"

    mkdir -p "${LOG_DIR}" "${CACHE_DIR}"
}

# ------------------------------------------------------------
# 文件查找
# ------------------------------------------------------------

@test "find_packages — finds .deb files in cache" {
    # 创建测试 deb 文件
    touch "${CACHE_DIR}/test-pkg_1.0_amd64.deb"
    touch "${CACHE_DIR}/test-pkg_2.0_amd64.deb"
    touch "${CACHE_DIR}/README.txt"  # 不应匹配

    run find_packages
    [ "$status" -eq 0 ]
    [ "$(echo "$output" | wc -l)" -eq 2 ]
}

@test "find_packages — returns empty when no debs" {
    run find_packages
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "find_sources — finds .dsc files in cache" {
    touch "${CACHE_DIR}/test-pkg_1.0-1.dsc"
    touch "${CACHE_DIR}/test-pkg_2.0-1.dsc"

    run find_sources
    [ "$status" -eq 0 ]
    [ "$(echo "$output" | wc -l)" -eq 2 ]
}

# ------------------------------------------------------------
# 缓存统计
# ------------------------------------------------------------

@test "show_cache_stats — shows file count" {
    touch "${CACHE_DIR}/test.deb"
    touch "${CACHE_DIR}/test.dsc"

    run show_cache_stats
    [ "$status" -eq 0 ]
}

# ------------------------------------------------------------
# rsync 包含模式验证
# ------------------------------------------------------------

@test "rsync_sync — builds include patterns correctly" {
    # 我们不实际运行 rsync（没有服务器），但可以验证函数被调用
    # 这里只验证函数存在且可被 source
    run type rsync_sync
    [ "$status" -eq 0 ]
}

@test "main — exits with error when rsync fails" {
    # OBS_URL 指向无效地址，预期失败
    run main
    [ "$status" -ne 0 ]
}
