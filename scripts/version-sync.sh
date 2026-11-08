#!/usr/bin/env bash
# Part of the Chili3d Project, under the AGPL-3.0 License.
# See LICENSE file in the project root for full license information.

# Version-file hygiene for dist/ bundles. Sourced by scripts/deploy-vps.sh and by
# scripts/version-sync.test.sh. Reviewer 08/11: "two files identical to each other"
# is NOT sufficient — each file's EMBEDDED SHA must match the verified build metadata,
# otherwise both files are regenerated FROM that metadata (never from a bare HEAD).
#
# sync_version_files <dist_dir> <repo_dir> <tip_sha> <branch_name>
#   0 = kept (already correct) or regenerated correctly; 1 = refuse to proceed
#   (missing/foreign build evidence, or regeneration failed verification).

version_file_state() { # <file> <want_sha> -> ok | stale | missing|broken
    local f="$1" want="$2"
    [ -f "$f" ] || { echo "missing"; return; }
    node -e '
        const fs = require("fs");
        const [path, want] = process.argv.slice(1);
        try {
            const v = JSON.parse(fs.readFileSync(path, "utf8"));
            process.stdout.write(v.codeSha === want && v.tipSha === want ? "ok" : "stale");
        } catch {
            process.stdout.write("broken");
        }
    ' "$f" "$want" 2>/dev/null || echo "broken"
}

sync_version_files() {
    local DIST="$1" REPO="$2" TIP="$3" BRANCH="$4"
    local META="$DIST/.build-meta.json"

    if [ ! -f "$META" ]; then
        echo "   ❌ dist/ không có .build-meta.json — không chứng minh được bundle build từ SHA nào."
        echo "      Chạy: FORCE_BUILD=1 bash scripts/deploy-vps.sh (build lại để gắn bằng chứng)."
        return 1
    fi

    local META_SHA META_AT
    META_SHA="$(node -e '
        const fs = require("fs");
        try { process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).sha || ""); } catch { }
    ' "$META" 2>/dev/null)"
    META_AT="$(node -e '
        const fs = require("fs");
        try { process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).builtAt || ""); } catch { }
    ' "$META" 2>/dev/null)"

    if [ -z "$META_SHA" ]; then
        echo "   ❌ .build-meta.json không đọc được SHA build."
        return 1
    fi
    if [ "$META_SHA" != "$TIP" ]; then
        echo "   ❌ dist build từ ${META_SHA}, HEAD là ${TIP} — KHÔNG ghi SHA hiện tại vào gói cũ."
        echo "      Build lại (FORCE_BUILD=1) hoặc checkout đúng SHA đã build rồi deploy."
        return 1
    fi

    # BOTH files must EXIST, PARSE, and EMBED the bundle SHA — and carry identical bytes.
    local S1 S2 NEEDS_REGEN=0
    S1="$(version_file_state "$DIST/version.json" "$META_SHA")"
    S2="$(version_file_state "$DIST/deploy-version.json" "$META_SHA")"
    if [ "$S1" != "ok" ] || [ "$S2" != "ok" ]; then
        NEEDS_REGEN=1
    elif ! cmp -s "$DIST/version.json" "$DIST/deploy-version.json"; then
        NEEDS_REGEN=1
    fi

    if [ "$NEEDS_REGEN" -eq 0 ]; then
        echo "   -> version.json + deploy-version.json cùng ghi đúng SHA bundle ${META_SHA:0:8} — giữ nguyên."
        return 0
    fi

    echo "   ↻ version metadata lệch bằng chứng build (version.json=$S1, deploy-version.json=$S2)"
    echo "     — sinh lại CẢ HAI từ metadata build đã xác minh ${META_SHA:0:8}."

    local APP_VER DOC_VER DEPLOYED_AT
    APP_VER="$(node -p "require('$REPO/package.json').version" 2>/dev/null)" || { echo "   ❌ không đọc được package.json"; return 1; }
    DOC_VER="$(node -p "require('$REPO/package.json').documentVersion" 2>/dev/null)"
    DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    META_SHA="$META_SHA" BRANCH="$BRANCH" BATCH="${BATCH_LABEL:-release}" BUILT_AT="$META_AT" \
    DEPLOYED_AT="$DEPLOYED_AT" DOC_VER="$DOC_VER" APP_VER="$APP_VER" DIST="$DIST" node -e '
        const fs = require("fs");
        const d = process.env;
        const o = {
            tipSha: d.META_SHA,
            tipShort: d.META_SHA.slice(0, 12),
            codeSha: d.META_SHA,
            codeShort: d.META_SHA.slice(0, 8),
            branch: d.BRANCH,
            batch: d.BATCH,
            builtAt: d.BUILT_AT || undefined,
            deployedAt: d.DEPLOYED_AT,
            documentVersion: d.DOC_VER,
            appVersion: d.APP_VER,
        };
        const json = JSON.stringify(o, null, 2) + "\n";
        fs.writeFileSync(`${d.DIST}/version.json`, json);
        fs.writeFileSync(`${d.DIST}/deploy-version.json`, json);
    ' || { echo "   ❌ ghi version metadata thất bại"; return 1; }

    # Post-write verification: BOTH files parse, embed the bundle SHA, identical bytes.
    for f in version.json deploy-version.json; do
        [ "$(version_file_state "$DIST/$f" "$META_SHA")" = "ok" ] || { echo "   ❌ hậu kiểm $f FAIL"; return 1; }
    done
    cmp -s "$DIST/version.json" "$DIST/deploy-version.json" || { echo "   ❌ hai file không cùng nội dung"; return 1; }
    echo "   -> đã đồng bộ cả hai file về SHA bundle ${META_SHA:0:8}"
    return 0
}
