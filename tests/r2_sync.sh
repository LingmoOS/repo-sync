#!/usr/bin/env bash
# 在隔离目录中运行实际入口，模拟 rclone；不连接网络，不需要密钥。
set -Eeuo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR=$(mktemp -d /tmp/lingmo-r2-tests.XXXXXX)
cleanup() {
    # 仅删除本测试创建的、已验证的绝对临时目录。
    if [[ "$TEST_DIR" == /tmp/lingmo-r2-tests.* && -d "$TEST_DIR" && ! -L "$TEST_DIR" ]]; then
        rm -rf -- "$TEST_DIR"
    fi
}
trap cleanup EXIT
mkdir -p "$TEST_DIR/bin" "$TEST_DIR/app" "$TEST_DIR/published repo/pool/main"     "$TEST_DIR/published repo/dists/stable" "$TEST_DIR/published repo/dists/lithium"
for script in config.sh lib.sh r2_sync.sh; do
    sed 's/\r$//' "$PROJECT_DIR/$script" > "$TEST_DIR/app/$script"
done
cat >> "$TEST_DIR/app/config.sh" <<'CONFIG'
DISTRIBUTIONS=(stable)
declare -A CODENAMES=([stable]=lithium)
CONFIG
printf 'package contents' > "$TEST_DIR/published repo/pool/main/test.deb"
printf 'Suite: stable\n' > "$TEST_DIR/published repo/dists/stable/Release"
printf 'Suite: lithium\n' > "$TEST_DIR/published repo/dists/lithium/Release"

cat > "$TEST_DIR/bin/rclone" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "$RCLONE_CONFIG_LINGMO_R2_PROVIDER" == Cloudflare ]]
[[ "$RCLONE_CONFIG_LINGMO_R2_ACCESS_KEY_ID" == test-access ]]
[[ "$RCLONE_CONFIG_LINGMO_R2_SECRET_ACCESS_KEY" == test-secret ]]
[[ "$RCLONE_CONFIG_LINGMO_R2_ENDPOINT" == https://test-account.r2.cloudflarestorage.com ]]
printf '%s\t' "$@" >> "$CALLS"
printf '\n' >> "$CALLS"
count=$(wc -l < "$CALLS")
if [[ "$count" == "${FAIL_AT:-0}" ]]; then exit 17; fi
MOCK
chmod +x "$TEST_DIR/bin/rclone"
export PATH="$TEST_DIR/bin:$PATH"
export LOG_DIR="$TEST_DIR/logs" R2_SOURCE_DIR="$TEST_DIR/published repo"
export R2_SYNC_ENABLED=true R2_ACCOUNT_ID=test-account R2_ACCESS_KEY_ID=test-access
export R2_SECRET_ACCESS_KEY=test-secret R2_BUCKET=test-bucket RCLONE_REMOTE=lingmo_r2
export CALLS="$TEST_DIR/calls" FAIL_AT=0
OUTPUT="$TEST_DIR/output"
passed=0

check() {
    local expected="$1" name="$2"
    shift 2
    : > "$CALLS"
    local status=0
    "$@" > "$OUTPUT" 2>&1 || status=$?
    if [[ "$expected" == success && "$status" != 0 ]] || [[ "$expected" == failure && "$status" == 0 ]]; then
        echo "FAIL: $name (status=$status)"
        cat "$OUTPUT"
        exit 1
    fi
    if grep -q 'test-secret|test-access' "$OUTPUT"; then
        echo "FAIL: credentials appeared in logs"
        exit 1
    fi
    passed=$((passed + 1))
    echo "PASS: $name"
}
assert_calls() { [[ $(wc -l < "$CALLS") -eq "$1" ]]; }

check success 'disabled: no credentials or remote calls' env R2_SYNC_ENABLED=false R2_ACCOUNT_ID= bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
check success 'help: no remote calls' bash "$TEST_DIR/app/r2_sync.sh" --help
assert_calls 0
check failure 'reject unknown arguments' bash "$TEST_DIR/app/r2_sync.sh" --unknown
assert_calls 0
check failure 'reject invalid enable value' env R2_SYNC_ENABLED=yes bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
check failure 'missing credentials' env R2_SECRET_ACCESS_KEY= bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
check failure 'reject bucket path' env R2_BUCKET=test-bucket/subdir bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
check failure 'reject invalid remote name' env RCLONE_REMOTE=bad-name bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
check failure 'reject missing source' env R2_SOURCE_DIR="$TEST_DIR/missing" bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
mv "$R2_SOURCE_DIR/dists/lithium/Release" "$TEST_DIR/alias-release"
check failure 'reject incomplete codename before upload' bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
mv "$TEST_DIR/alias-release" "$R2_SOURCE_DIR/dists/lithium/Release"
: > "$R2_SOURCE_DIR/dists/stable/Release"
check failure 'reject empty Release before upload' bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 0
printf 'Suite: stable\n' > "$R2_SOURCE_DIR/dists/stable/Release"

check success 'dry run: every upload is simulated, no post-upload checks' bash "$TEST_DIR/app/r2_sync.sh" --dry-run
assert_calls 3
[[ $(grep -c -- '--dry-run' "$CALLS") -eq 3 ]]
! grep -q '^check' "$CALLS"

check success 'upload: packages, indexes, verification, Release, verification' bash "$TEST_DIR/app/r2_sync.sh"
assert_calls 5
[[ $(cut -f1 "$CALLS" | paste -sd, -) == copy,copy,check,sync,check ]]
sed -n '1p' "$CALLS" | grep -Fq "$R2_SOURCE_DIR/pool/"
sed -n '2p' "$CALLS" | grep -Fq '/dists/*/InRelease'
sed -n '3p' "$CALLS" | grep -Fq -- '--size-only'
sed -n '4p' "$CALLS" | grep -Fq -- '--include'
sed -n '4p' "$CALLS" | grep -Fq -- '--delete-after'
sed -n '5p' "$CALLS" | grep -Fq -- '--download'
! grep -q -- '--delete-excluded' "$CALLS"

for failed_phase in 1 2 3 4 5; do
    check failure "phase $failed_phase failure propagates and stops subsequent stages"         env FAIL_AT="$failed_phase" bash "$TEST_DIR/app/r2_sync.sh"
    assert_calls "$failed_phase"
    ! grep -q 'R2 上传及校验完成' "$OUTPUT"
done

# 自动探测使用当前用户 aptly 的 JSON 配置，而非 PUBLISH_ROOT。
# Python 在 Linux CI 中可用；本地没有 python3 时显式跳过这组检查。
if command -v python3 &>/dev/null && python3 -c 'import json' 2>/dev/null; then
    mkdir -p "$TEST_DIR/aptly root"
    ln -s "$R2_SOURCE_DIR" "$TEST_DIR/aptly root/public"
    export MOCK_APTLY_ROOT="$TEST_DIR/aptly root"
    cat > "$TEST_DIR/bin/aptly" <<'MOCK'
#!/usr/bin/env bash
[[ "$*" == 'config show' ]] || exit 1
if [[ "${BAD_JSON:-false}" == true ]]; then echo broken; exit 0; fi
python3 -c 'import os,json; print(json.dumps({"rootDir": os.environ["MOCK_APTLY_ROOT"]}))'
MOCK
    chmod +x "$TEST_DIR/bin/aptly"
    check success 'auto detect aptly public directory with spaces' env R2_SOURCE_DIR= bash "$TEST_DIR/app/r2_sync.sh" --dry-run
    assert_calls 3
    grep -Fq "$MOCK_APTLY_ROOT/public/pool/" "$CALLS"
    check failure 'invalid aptly config prevents remote operations' env R2_SOURCE_DIR= BAD_JSON=true bash "$TEST_DIR/app/r2_sync.sh"
    assert_calls 0
else
    echo 'SKIP: aptly JSON auto detection (python3 unavailable)'
fi

echo "R2 tests passed: $passed"
