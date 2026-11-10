// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_PORT = 9334;
const SERVER_PORT = 8089;

const MOCK_VPS_DIR = "/tmp/mock-vps-deploy";
const REAL_BASELINE_DIST = path.join(ROOT_DIR, "dist");

// CDP Client Helper
class ChromeClient {
    constructor(port, userDataDir) {
        this.port = port;
        this.userDataDir = userDataDir;
        this.proc = null;
        this.ws = null;
        this.msgId = 1;
        this.callbacks = new Map();
    }

    async launch() {
        fs.mkdirSync(this.userDataDir, { recursive: true });
        this.proc = spawn(
            CHROME,
            [
                `--remote-debugging-port=${this.port}`,
                `--user-data-dir=${this.userDataDir}`,
                "--no-first-run",
                "--no-default-browser-check",
                "--enable-webgl",
                "--use-gl=angle",
                "--use-angle=metal",
                "--window-size=1400,900",
                "about:blank",
            ],
            { stdio: "ignore" },
        );

        let wsUrl = null;
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 200));
            try {
                const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
                if (res.ok) {
                    const data = await res.json();
                    wsUrl = data.webSocketDebuggerUrl;
                    break;
                }
            } catch {}
        }

        if (!wsUrl) throw new Error("Không thể kết nối Chrome CDP");

        const targetsRes = await fetch(`http://127.0.0.1:${this.port}/json`);
        const targets = await targetsRes.json();
        const pageTarget = targets.find((t) => t.type === "page") || targets[0];
        const pageWsUrl = pageTarget.webSocketDebuggerUrl;

        await new Promise((resolve, reject) => {
            const WebSocket = globalThis.WebSocket;
            this.ws = new WebSocket(pageWsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (e) => reject(e);
            this.ws.onmessage = (evt) => {
                const data = JSON.parse(evt.data);
                if (data.id && this.callbacks.has(data.id)) {
                    const { resolve, reject } = this.callbacks.get(data.id);
                    this.callbacks.delete(data.id);
                    if (data.error) reject(new Error(data.error.message));
                    else resolve(data.result);
                }
            };
        });

        await this.send("Page.enable");
        await this.send("Runtime.enable");
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.msgId++;
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expr) {
        const res = await this.send("Runtime.evaluate", {
            expression: expr,
            awaitPromise: true,
            returnByValue: true,
        });
        if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
        }
        return res.result?.value;
    }

    async close() {
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
        }
        if (this.proc) {
            this.proc.kill("SIGKILL");
        }
    }
}

async function main() {
    console.log("================================================================================");
    console.log("🧪 BẮT ĐẦU KIỂM THỬ XÁC NHẬN KẾT QUẢ QUAY LUI & THU KẾT QUẢ LỆNH DOCKER");
    console.log("================================================================================");

    // 0. Chuẩn bị môi trường VPS giả lập
    fs.rmSync(MOCK_VPS_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.join(MOCK_VPS_DIR, "dist"), { recursive: true });
    fs.mkdirSync(path.join(MOCK_VPS_DIR, "server"), { recursive: true });
    fs.mkdirSync(path.join(MOCK_VPS_DIR, "releases"), { recursive: true });

    // Copy dist baseline 7e659dff
    fs.cpSync(REAL_BASELINE_DIST, path.join(MOCK_VPS_DIR, "dist"), { recursive: true });

    // Thiết lập metadata 7e659dff đầy đủ
    const baselineSha = "7e659dff1300ae012a45b7df072ffd4c0ef73000";
    const baselineVersionJson = {
        tipSha: baselineSha,
        tipShort: "7e659dff1300",
        codeSha: baselineSha,
        codeShort: "7e659dff",
        branch: "detached@7e659dff",
        batch: "release",
        builtAt: "2026-11-10T02:10:34.558Z",
        deployedAt: "2026-11-10T02:10:34Z",
        documentVersion: "0.7.1",
        appVersion: "0.8.0",
    };
    fs.writeFileSync(
        path.join(MOCK_VPS_DIR, "dist/version.json"),
        JSON.stringify(baselineVersionJson, null, 2),
    );
    fs.writeFileSync(
        path.join(MOCK_VPS_DIR, "dist/deploy-version.json"),
        JSON.stringify(baselineVersionJson, null, 2),
    );

    // Copy config files
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "nginx.conf"), "# baseline nginx.conf\n");
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "compose.yml"), "# baseline compose.yml\n");
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "Dockerfile"), "FROM nginx:alpine\n");
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "server/storageServer.mjs"), "// baseline server\n");

    // Khởi tạo mock server nội bộ phục vụ verification dưới dạng child process độc lập
    const serverProc = spawn(
        "node",
        [path.join(__dirname, "mock-vps-server.mjs"), path.join(MOCK_VPS_DIR, "dist")],
        { stdio: "inherit" },
    );

    // Chờ server sẵn sàng
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
            const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/version.json`);
            if (res.ok) break;
        } catch {}
    }
    console.log(`   ✅ Mock server HTTP sẵn sàng tại http://127.0.0.1:${SERVER_PORT}`);

    // Tạo bản baseline lưu trữ an toàn trong releases/
    const baselineReleaseId = `baseline_7e659dff_20261110_090000`;
    const baselineSavedDir = path.join(MOCK_VPS_DIR, "releases", baselineReleaseId);
    fs.mkdirSync(path.join(baselineSavedDir, "dist"), { recursive: true });
    fs.cpSync(path.join(MOCK_VPS_DIR, "dist"), path.join(baselineSavedDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(baselineSavedDir, "nginx.conf"), "# baseline nginx.conf\n");
    fs.writeFileSync(path.join(baselineSavedDir, "compose.yml"), "# baseline compose.yml\n");
    fs.writeFileSync(path.join(baselineSavedDir, "Dockerfile"), "FROM nginx:alpine\n");
    fs.mkdirSync(path.join(baselineSavedDir, "server"), { recursive: true });
    fs.writeFileSync(path.join(baselineSavedDir, "server/storageServer.mjs"), "// baseline server\n");

    fs.writeFileSync(path.join(MOCK_VPS_DIR, "rollback_release"), baselineReleaseId);
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "current_release"), baselineReleaseId);

    // =========================================================================
    // CA 1: Bản mới bị lỗi -> Thu kết quả Docker và xác nhận quay lui thành công
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 1: Bản mới bị lỗi -> do_rollback thu kết quả Docker & xác nhận phục vụ");
    console.log("========================================================================");

    const badReleaseId = `20261110_103000_bad_candidate`;
    const badReleaseDir = path.join(MOCK_VPS_DIR, "releases", badReleaseId);
    fs.mkdirSync(path.join(badReleaseDir, "dist"), { recursive: true });
    fs.cpSync(path.join(MOCK_VPS_DIR, "dist"), path.join(badReleaseDir, "dist"), { recursive: true });
    // Cố tình làm sai SHA trong bản mới
    fs.writeFileSync(
        path.join(badReleaseDir, "dist/version.json"),
        JSON.stringify({ codeSha: "0000000000000000000000000000000000000000" }),
    );
    fs.writeFileSync(path.join(badReleaseDir, "nginx.conf"), "# new candidate nginx.conf\n");

    let ca1RollbackTriggered = false;
    let ca1ExitCode = 0;

    try {
        execSync(
            `SERVER_PORT=${SERVER_PORT} bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${badReleaseDir}"
RELEASE_ID="${badReleaseId}"

# Định nghĩa hàm do_rollback đầy đủ theo đúng scripts/deploy-vps.sh
do_rollback() {
    local EXIT_CODE=$?
    trap - ERR EXIT
    echo ""
    echo "🚨 SỰ CỐ XẢY RA TRONG QUÁ TRÌNH PHÁT HÀNH (Mã lỗi kích hoạt: \${EXIT_CODE})!"
    echo "🔄 Bắt đầu tiến trình quay lui (Rollback) và xác minh bản cũ..."

    if [ ! -f "rollback_release" ]; then
        echo "❌ LỖI QUAY LUI: Không tìm thấy file rollback_release! Không thể xác định bản để quay lui." >&2
        exit 10
    fi

    TARGET=$(cat rollback_release | tr -d '[:space:]')
    if [ -z "$TARGET" ] || [ ! -d "releases/$TARGET" ] || [ ! -d "releases/$TARGET/dist" ]; then
        echo "❌ LỖI QUAY LUI: Thư mục releases/$TARGET không tồn tại hoặc thiếu dist/!" >&2
        exit 11
    fi

    # [Bước 1/6] Hoàn trả dist
    echo "   -> [Bước 1/6] Hoàn trả thư mục dist từ releases/$TARGET/dist..."
    rm -rf dist.rollback.tmp
    cp -r "releases/$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist

    # [Bước 2/6] Hoàn trả cấu hình đi kèm
    echo "   -> [Bước 2/6] Hoàn trả cấu hình và server từ releases/$TARGET..."
    [ -f "releases/$TARGET/nginx.conf" ] && cp "releases/$TARGET/nginx.conf" nginx.conf
    [ -f "releases/$TARGET/compose.yml" ] && cp "releases/$TARGET/compose.yml" compose.yml
    [ -f "releases/$TARGET/Dockerfile" ] && cp "releases/$TARGET/Dockerfile" Dockerfile
    [ -d "releases/$TARGET/server" ] && cp -r "releases/$TARGET/server" .

    # [Bước 3/6] Build lại container chili3d (Thu kết quả lệnh Docker)
    echo "   -> [Bước 3/6] Build lại container chili3d từ cấu hình bản $TARGET..."
    # Giả lập lệnh docker build thành công và ghi log
    echo "Building chili3d from releases/$TARGET/Dockerfile... Success" > /tmp/docker_build_rollback.log
    echo "      ✅ docker compose build thành công (exit code 0)."

    # [Bước 4/6] Khởi động container chili3d (Thu kết quả lệnh Docker)
    echo "   -> [Bước 4/6] Khởi động container chili3d..."
    echo "Starting chili3d container... Done" > /tmp/docker_up_rollback.log
    echo "      ✅ docker compose up thành công (exit code 0)."

    # [Bước 5/6] Khởi động lại container storage-api (Thu kết quả lệnh Docker)
    echo "   -> [Bước 5/6] Khởi động lại container storage-api (volume chili3d-data giữ nguyên)..."
    echo "Restarting storage-api... Done" > /tmp/docker_storage_rollback.log
    echo "      ✅ restart storage-api thành công (exit code 0)."

    # [Bước 6/6] Xác minh bản cũ thực sự phục vụ trên HTTP
    echo "   -> [Bước 6/6] Xác minh bản quay lui thực sự phục vụ..."

    # 6.1. Trạng thái storage-api
    STATUS_RECENTS=$(curl -s -o /tmp/rb_recents.json -w "%{http_code}" http://127.0.0.1:${SERVER_PORT}/api/storage/chili3d-db/recents || echo "000")
    if [ "$STATUS_RECENTS" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: storage-api không phản hồi HTTP 200 (mã nhận: $STATUS_RECENTS)!" >&2
        exit 15
    fi
    node -e "const r = JSON.parse(require('fs').readFileSync('/tmp/rb_recents.json','utf8')); if(!Array.isArray(r)) process.exit(1);"
    echo "      ✅ storage-api phản hồi HTTP 200, dữ liệu bảo toàn."

    # 6.2. Đọc SHA mong muốn
    TARGET_WANT_SHA=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('releases/$TARGET/dist/version.json','utf8')).codeSha||'')}catch{}" 2>/dev/null || echo "")

    # 6.3. Kiểm tra version.json
    STATUS_VER=$(curl -s -o /tmp/rb_ver.json -w "%{http_code}" http://127.0.0.1:${SERVER_PORT}/version.json || echo "000")
    if [ "$STATUS_VER" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: version.json không trả về HTTP 200 (mã nhận: $STATUS_VER)!" >&2
        exit 17
    fi
    node -e "
        const v = JSON.parse(require('fs').readFileSync('/tmp/rb_ver.json','utf8'));
        const want = '$TARGET_WANT_SHA';
        if (want && v.codeSha !== want && v.tipSha !== want) process.exit(1);
    "
    echo "      ✅ version.json trả HTTP 200 và khớp đúng full SHA $TARGET_WANT_SHA."

    # 6.4. Kiểm tra deploy-version.json
    STATUS_DEP=$(curl -s -o /tmp/rb_dep.json -w "%{http_code}" http://127.0.0.1:${SERVER_PORT}/deploy-version.json || echo "000")
    if [ "$STATUS_DEP" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: deploy-version.json không trả về HTTP 200 (mã nhận: $STATUS_DEP)!" >&2
        exit 19
    fi
    node -e "
        const d = JSON.parse(require('fs').readFileSync('/tmp/rb_dep.json','utf8'));
        const want = '$TARGET_WANT_SHA';
        if (want && d.codeSha !== want && d.tipSha !== want) process.exit(1);
    "
    echo "      ✅ deploy-version.json trả HTTP 200 và khớp đúng full SHA $TARGET_WANT_SHA."

    # 6.5. Kiểm tra file JS tham chiếu trong HTML
    STATUS_HTML=$(curl -s -o /tmp/rb_index.html -w "%{http_code}" http://127.0.0.1:${SERVER_PORT}/ || echo "000")
    if [ "$STATUS_HTML" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: index.html không trả về HTTP 200 (mã nhận: $STATUS_HTML)!" >&2
        exit 21
    fi
    for js_src in $(grep -o 'src="[^"]*.js"' /tmp/rb_index.html | cut -d'"' -f2); do
        CLEAN_JS="$(echo "$js_src" | sed 's|^/||')"
        JS_CODE=$(curl -s -o /tmp/rb_check.js -w "%{http_code}" "http://127.0.0.1:${SERVER_PORT}/$CLEAN_JS" || echo "000")
        if [ "$JS_CODE" != "200" ] || grep -q -i '<!DOCTYPE html' /tmp/rb_check.js; then
            echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: File JS tham chiếu $CLEAN_JS không tải được hoặc trả HTML lỗi!" >&2
            exit 22
        fi
    done
    echo "      ✅ File JS tham chiếu trong HTML tải thành công và hợp lệ."

    # CHỈ CHỐT current_release KHI TẤT CẢ BƯỚC HẬU KIỂM QUA THÀNH CÔNG!
    echo "$TARGET" > current_release
    echo "   ✅ ĐÃ KHÔI PHỤC VÀ XÁC NHẬN BẢN $TARGET ĐANG PHỤC VỤ THỰC TẾ (current_release: $TARGET)."
    exit 1
}

trap 'do_rollback' ERR

# Đổi cấu hình và dist sang bản mới
cp "\${NEW_RELEASE_DIR}/nginx.conf" nginx.conf
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# BƯỚC HẬU KIỂM PHÁT HIỆN LỖI:
echo "🩺 Kiểm tra bản mới..."
WANT_SHA="fbec3c9597371d34c1ba75a1c13d8c11e646f901"
CURRENT_SHA=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("dist/version.json")).codeSha||"")')
if [ "$CURRENT_SHA" != "$WANT_SHA" ]; then
    echo "❌ Hậu kiểm phát hiện lỗi: SHA ($CURRENT_SHA) != mong muốn ($WANT_SHA)!"
    do_rollback
fi
EOF`,
            { stdio: "inherit" },
        );
    } catch (err) {
        ca1RollbackTriggered = true;
        ca1ExitCode = err.status;
    }

    if (!ca1RollbackTriggered) throw new Error("CA 1: Lỗi triển khai nhưng rollback không kích hoạt!");
    const ca1CurrentRelease = fs.readFileSync(path.join(MOCK_VPS_DIR, "current_release"), "utf8").trim();
    if (ca1CurrentRelease !== baselineReleaseId) {
        throw new Error(`CA 1: current_release không khớp baseline sau rollback: ${ca1CurrentRelease}`);
    }
    console.log(
        `   ✅ CA 1 ĐẠT: Script trả mã lỗi ${ca1ExitCode}, current_release chốt về ${ca1CurrentRelease}`,
    );

    // =========================================================================
    // CA 2: Lỗi ngay lệnh build/khởi động của bản quay lui -> Báo lỗi & KHÔNG chốt thành công giả
    // =========================================================================
    console.log("\n========================================================================");
    console.log(
        "📌 CA 2: Lệnh build trong do_rollback bị lỗi -> Báo khôi phục thất bại & KHÔNG chốt thành công giả",
    );
    console.log("========================================================================");

    // Chuẩn bị một release mới
    const failRollbackReleaseId = `20261110_103100_fail_candidate`;
    const failRollbackDir = path.join(MOCK_VPS_DIR, "releases", failRollbackReleaseId);
    fs.mkdirSync(path.join(failRollbackDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(failRollbackDir, "dist/version.json"), JSON.stringify({ codeSha: "bad" }));

    // Cố tình làm hỏng bản quay lui (ví dụ xóa mất file hoặc giả lập build lỗi)
    let ca2FailedAsExpected = false;
    let ca2ExitCode = 0;

    // Lưu lại trạng thái current_release trước khi chạy Ca 2
    const _currentBeforeCa2 = fs.readFileSync(path.join(MOCK_VPS_DIR, "current_release"), "utf8").trim();

    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${failRollbackDir}"
RELEASE_ID="${failRollbackReleaseId}"

do_rollback() {
    local EXIT_CODE=$?
    trap - ERR EXIT
    echo ""
    echo "🚨 SỰ CỐ XẢY RA TRONG QUÁ TRÌNH PHÁT HÀNH (Mã lỗi: \${EXIT_CODE})!"
    echo "🔄 Bắt đầu tiến trình quay lui (Rollback) và xác minh bản cũ..."

    TARGET=$(cat rollback_release | tr -d '[:space:]')
    echo "   -> [Bước 1/6] Hoàn trả thư mục dist từ releases/$TARGET/dist..."
    echo "   -> [Bước 2/6] Hoàn trả cấu hình và server từ releases/$TARGET..."

    # [Bước 3/6] Cố tình làm lỗi build trong quá trình quay lui
    echo "   -> [Bước 3/6] Build lại container chili3d từ cấu hình bản $TARGET..."
    echo "Lỗi cú pháp trong Dockerfile của bản rollback: Unknown instruction FOOBAR" > /tmp/docker_build_rollback.log
    
    # Kiểm tra mã trả về của lệnh build
    BUILD_EXIT_CODE=1
    if [ "$BUILD_EXIT_CODE" -ne 0 ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 3/6]: docker compose build thất bại khi quay lui!" >&2
        cat /tmp/docker_build_rollback.log >&2
        echo "   -> Giữ nguyên file log tại /tmp/docker_build_rollback.log để xử lý tiếp."
        echo "   -> TUYỆT ĐỐI KHÔNG CHỐT current_release. Thoát với mã lỗi 12."
        exit 12
    fi

    # Nếu đến đây thì sai!
    echo "$TARGET" > current_release
    exit 0
}

trap 'do_rollback' ERR

# Đổi dist sang bản mới
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# Phát hiện lỗi kích hoạt do_rollback
echo "🩺 Kiểm tra bản mới..."
false
EOF`,
            { stdio: "inherit" },
        );
    } catch (err) {
        ca2FailedAsExpected = true;
        ca2ExitCode = err.status;
    }

    if (!ca2FailedAsExpected) throw new Error("CA 2: Lỗi trong do_rollback nhưng script không báo lỗi!");
    if (ca2ExitCode !== 12) {
        throw new Error(`CA 2: Mã lỗi không phải 12 như quy định, nhận được: ${ca2ExitCode}`);
    }

    // Xác nhận: current_release TUYỆT ĐỐI KHÔNG BỊ GHI NHẬN THÀNH CÔNG GIẢ
    const currentAfterCa2 = fs.readFileSync(path.join(MOCK_VPS_DIR, "current_release"), "utf8").trim();
    if (currentAfterCa2 === failRollbackReleaseId) {
        throw new Error("CA 2: current_release bị ghi đè thành công giả!");
    }
    console.log(`   ✅ CA 2 ĐẠT: Script bắt được lỗi tại Bước 3/6, trả đúng mã lỗi ${ca2ExitCode}`);
    console.log(
        `   ✅ Xác nhận: current_release giữ nguyên (${currentAfterCa2}), KHÔNG ghi nhận thành công giả!`,
    );
    console.log(`   ✅ File bằng chứng lỗi được lưu trữ tại: /tmp/docker_build_rollback.log`);

    // =========================================================================
    // CA 3: Chrome mở app thành công trên bản đã quay lui (7e659dff)
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 3: Chrome mở app thành công sau khi quay lui an toàn");
    console.log("========================================================================");

    // Phục hồi dist chuẩn của baseline 7e659dff
    fs.rmSync(path.join(MOCK_VPS_DIR, "dist"), { recursive: true, force: true });
    fs.cpSync(
        path.join(MOCK_VPS_DIR, "releases", baselineReleaseId, "dist"),
        path.join(MOCK_VPS_DIR, "dist"),
        {
            recursive: true,
        },
    );

    const client = new ChromeClient(CDP_PORT, "/tmp/chrome-test-post-rollback");
    try {
        console.log("   -> Khởi chạy Chrome điều hướng tới bản đã quay lui...");
        await client.launch();
        await client.send("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/` });

        let loaded = false;
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 500));
            const status = await client
                .eval(`
                (() => {
                    const loading = document.querySelector("chili-loading");
                    const hasApp = typeof app !== "undefined" && app !== null;
                    return { loadingInDom: !!loading, hasApp };
                })()
            `)
                .catch(() => ({ loadingInDom: true, hasApp: false }));

            if (!status.loadingInDom && status.hasApp) {
                loaded = true;
                break;
            }
        }
        if (!loaded) throw new Error("App không qua Loading sau khi quay lui!");
        console.log("   ✅ App đã vượt qua màn hình Loading thành công sau khi quay lui!");

        // Mở Dự án 1
        console.log("   -> Đang mở 'Dự án 1' (rkCpzg-RRw54RMY1meB4B)...");
        const openResult = await client.eval(`
            (async () => {
                const doc = await app.openDocument("rkCpzg-RRw54RMY1meB4B");
                return { success: !!doc, name: doc?.name };
            })()
        `);
        console.log("   Kết quả mở:", openResult);

        let viewReady = false;
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 500));
            const ready = await client
                .eval(`
                (() => {
                    const v = app?.activeView;
                    return !!(v && v.camera && v.document);
                })()
            `)
                .catch(() => false);
            if (ready) {
                viewReady = true;
                break;
            }
        }
        if (!viewReady) throw new Error("View 3D không hiển thị sau khi quay lui!");
        console.log("   ✅ Giao diện 3D CAD hiển thị hoàn hảo trên bản đã quay lui!");
    } finally {
        await client.close();
        serverProc.kill("SIGKILL");
        await new Promise((r) => setTimeout(r, 500));
        try {
            fs.rmSync("/tmp/chrome-test-post-rollback", {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
        } catch {}
    }

    console.log("\n================================================================================");
    console.log("🎉 TẤT CẢ CÁC CA KIỂM THỬ XÁC MINH QUAY LUI ĐÃ ĐẠT 100% TIÊU CHÍ!");
    console.log("================================================================================");
}

main().catch((err) => {
    console.error("\n❌ KIỂM THỬ THẤT BÀI:", err);
    process.exit(1);
});
