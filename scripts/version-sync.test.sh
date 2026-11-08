#!/usr/bin/env bash
# Part of the Chili3d Project, under the AGPL-3.0 License.
# See LICENSE file in the project root for full license information.

# Scenario tests for scripts/version-sync.sh (Reviewer 08/11, point 1):
#   A) BẮT BUỘC: .build-meta.json đúng SHA (= tip) nhưng CẢ HAI file version ghi SHA cũ
#      → packager phải sinh lại, và cả hai file cuối cùng ghi đúng SHA của bundle.
#   B) hai file đã đúng + giống nhau → giữ nguyên (không chạm bytes).
#   C) thiếu deploy-version.json → sinh lại cả hai từ metadata build.
#   D) không có .build-meta.json → từ chối (refuse), không ghi gì.
#   E) meta SHA ≠ HEAD → từ chối, file cũ không bị ghi đè HEAD mới.

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version-sync.sh
source "$HERE/version-sync.sh"

SHA_OK="$(node -e 'console.log("f".repeat(40))')"
SHA_OLD="$(node -e 'console.log("a".repeat(40))')"
PASS=0; FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

mkdist() {
    DIST="$(mktemp -d "${TMPDIR:-/tmp}/vsync-XXXX")"
    REPO="$(mktemp -d "${TMPDIR:-/tmp}/vsync-repo-XXXX")"
    printf '{"version":"9.9.9","documentVersion":"8.8.8"}' > "$REPO/package.json"
}
cleanup() { rm -rf "$DIST" "$REPO"; }
file_sha_of() { node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).codeSha||"")}catch{}' "$1"; }

# ---------- A: meta đúng SHA, cả hai file version ghi SHA CŨ ----------
mkdist
printf '{"sha":"%s","builtAt":"2026-11-08T00:00:00.000Z"}' "$SHA_OK" > "$DIST/.build-meta.json"
for f in version.json deploy-version.json; do
    printf '{"tipSha":"%s","codeSha":"%s","branch":"dev","batch":"TASK-41"}' "$SHA_OLD" "$SHA_OLD" > "$DIST/$f"
done
if sync_version_files "$DIST" "$REPO" "$SHA_OK" "release/x" >/dev/null 2>&1; then
    c1="$(file_sha_of "$DIST/version.json")"; c2="$(file_sha_of "$DIST/deploy-version.json")"
    if [ "$c1" = "$SHA_OK" ] && [ "$c2" = "$SHA_OK" ] && cmp -s "$DIST/version.json" "$DIST/deploy-version.json"; then
        ok "A) meta đúng + hai file SHA cũ → sinh lại, cả hai ghi SHA bundle, cùng bytes"
    else
        bad "A) file không được regenerate đúng SHA bundle ($c1|$c2)"
    fi
else
    bad "A) sync_version_files trả lỗi"
fi
cleanup

# ---------- B: đã đúng → giữ nguyên ----------
mkdist
printf '{"sha":"%s","builtAt":"2026-11-08T00:00:00.000Z"}' "$SHA_OK" > "$DIST/.build-meta.json"
META_SHA="$SHA_OK" BRANCH="b" BATCH="t" BUILT_AT="x" DEPLOYED_AT="y" DOC_VER="8.8.8" APP_VER="9.9.9" DIST="$DIST" node -e '
    const fs=require("fs");const d=process.env;const o={tipSha:d.META_SHA,codeSha:d.META_SHA,branch:d.BRANCH};
    const j=JSON.stringify(o,null,2)+"\n";fs.writeFileSync(`${d.DIST}/version.json`,j);fs.writeFileSync(`${d.DIST}/deploy-version.json`,j);'
B1="$(shasum -a 256 < "$DIST/version.json")"
sync_version_files "$DIST" "$REPO" "$SHA_OK" "release/x" >/dev/null 2>&1 || bad "B) trả lỗi"
B2="$(shasum -a 256 < "$DIST/version.json")"
[ "$B1" = "$B2" ] && ok "B) hai file đã đúng → giữ nguyên bytes" || bad "B) file bị ghi lại dù đã đúng"
cleanup

# ---------- C: thiếu deploy-version.json ----------
mkdist
printf '{"sha":"%s"}' "$SHA_OK" > "$DIST/.build-meta.json"
printf '{"tipSha":"%s","codeSha":"%s"}' "$SHA_OLD" "$SHA_OLD" > "$DIST/version.json"
sync_version_files "$DIST" "$REPO" "$SHA_OK" "r" >/dev/null 2>&1
c="$(file_sha_of "$DIST/deploy-version.json")"
[ "$c" = "$SHA_OK" ] && ok "C) thiếu deploy-version.json → sinh lại đủ hai file đúng SHA" || bad "C) deploy-version.json: '$c'"
cleanup

# ---------- D: không có bằng chứng build ----------
mkdist
printf '{"tipSha":"%s","codeSha":"%s"}' "$SHA_OK" "$SHA_OK" > "$DIST/version.json"
printf '{"tipSha":"%s","codeSha":"%s"}' "$SHA_OK" "$SHA_OK" > "$DIST/deploy-version.json"
if sync_version_files "$DIST" "$REPO" "$SHA_OK" "r" >/dev/null 2>&1; then
    bad "D) phải từ chối khi thiếu .build-meta.json"
else
    ok "D) thiếu bằng chứng build → từ chối (không deploy)"
fi
cleanup

# ---------- E: meta SHA ≠ HEAD ----------
mkdist
printf '{"sha":"%s"}' "$SHA_OLD" > "$DIST/.build-meta.json"
printf '{"tipSha":"%s","codeSha":"%s"}' "$SHA_OLD" "$SHA_OLD" > "$DIST/version.json"
printf '{"tipSha":"%s","codeSha":"%s"}' "$SHA_OLD" "$SHA_OLD" > "$DIST/deploy-version.json"
if sync_version_files "$DIST" "$REPO" "$SHA_OK" "r" >/dev/null 2>&1; then
    bad "E) phải từ chối khi meta build khác HEAD"
else
    c="$(file_sha_of "$DIST/version.json")"
    [ "$c" = "$SHA_OLD" ] && ok "E) meta ≠ HEAD → từ chối, KHÔNG ghi HEAD mới vào gói cũ" || bad "E) file bị ghi đè dù phải từ chối"
fi
cleanup

echo "== version-sync scenarios: $PASS pass / $FAIL fail =="
[ "$FAIL" -eq 0 ]
