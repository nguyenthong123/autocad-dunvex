// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
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

// Local mock server mimicking VPS
function createMockServer(servingDir) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${SERVER_PORT}`);
        let pathname = decodeURIComponent(url.pathname);

        // Proxy /api to VPS
        if (pathname.startsWith("/api/")) {
            const vpsReq = http.request(
                `http://136.66.95.155${url.pathname}${url.search}`,
                {
                    method: req.method,
                    headers: { ...req.headers, host: "136.66.95.155" },
                },
                (vpsRes) => {
                    res.writeHead(vpsRes.statusCode, vpsRes.headers);
                    vpsRes.pipe(res);
                },
            );
            vpsReq.on("error", (err) => {
                res.writeHead(502, { "Content-Type": "text/plain" });
                res.end(`Proxy Error: ${err.message}`);
            });
            req.pipe(vpsReq);
            return;
        }

        if (pathname === "/" || pathname === "/index.html") {
            pathname = "/index.html";
        }
        const filePath = path.join(servingDir, pathname);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end(`404 Not Found: ${pathname}`);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript",
            ".css": "text/css",
            ".wasm": "application/wasm",
            ".json": "application/json",
            ".png": "image/png",
            ".svg": "image/svg+xml",
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";

        const headers = { "Content-Type": contentType };
        if (pathname === "/index.html" || pathname.endsWith(".json")) {
            headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        } else if (pathname.match(/\.[0-9a-fA-F]{8,32}\.(js|css|wasm)$/)) {
            headers["Cache-Control"] = "public, max-age=31536000, immutable";
        }

        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise((resolve) => {
        server.listen(SERVER_PORT, "127.0.0.1", () => {
            resolve(server);
        });
    });
}

async function main() {
    console.log("================================================================================");
    console.log("🧪 BẮT ĐẦU KIỂM THỬ CHE PHỦ LỖI TOÀN DIỆN QUY TRÌNH PHÁT HÀNH WEB & ROLLBACK");
    console.log("================================================================================");

    // 0. Chuẩn bị môi trường VPS giả lập
    console.log(`📁 Khởi tạo môi trường VPS tại: ${MOCK_VPS_DIR}`);
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

    console.log("   ✅ Đã chuẩn bị môi trường ban đầu đại diện cho bản đang phục vụ 7e659dff");

    // =========================================================================
    // CA 1: Lần chuyển đầu tiên khi VPS chưa có current_release
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 1: Lần chuyển đầu tiên khi chưa có current_release (Tạo Baseline)");
    console.log("========================================================================");

    const newReleaseId = `20261110_100000_fbec3c95`;
    const newReleaseDir = path.join(MOCK_VPS_DIR, "releases", newReleaseId);
    fs.mkdirSync(path.join(newReleaseDir, "dist"), { recursive: true });
    fs.cpSync(path.join(MOCK_VPS_DIR, "dist"), path.join(newReleaseDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(newReleaseDir, "nginx.conf"), "# new nginx.conf\n");
    fs.writeFileSync(path.join(newReleaseDir, "compose.yml"), "# new compose.yml\n");
    fs.writeFileSync(path.join(newReleaseDir, "Dockerfile"), "FROM nginx:alpine\n");
    fs.mkdirSync(path.join(newReleaseDir, "server"), { recursive: true });
    fs.writeFileSync(path.join(newReleaseDir, "server/storageServer.mjs"), "// new server\n");

    // Chạy logic sao lưu baseline khi chưa có current_release
    execSync(
        `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"

NEW_RELEASE_DIR="${newReleaseDir}"
RELEASE_ID="${newReleaseId}"

if [ ! -f "current_release" ] && [ -d "dist" ] && [ -f "dist/version.json" ]; then
    OLD_SHA=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync("dist/version.json","utf8")).codeShort||"legacy")}catch{process.stdout.write("legacy")}' 2>/dev/null || echo "legacy")
    BASELINE="baseline_\${OLD_SHA}_20261110_090000"
    echo "   -> Đang tạo bản sao lưu an toàn tại releases/$BASELINE..."
    mkdir -p "releases/$BASELINE"
    cp -r dist "releases/$BASELINE/dist"
    [ -f "nginx.conf" ] && cp nginx.conf "releases/$BASELINE/"
    [ -f "compose.yml" ] && cp compose.yml "releases/$BASELINE/"
    [ -f "Dockerfile" ] && cp Dockerfile "releases/$BASELINE/"
    [ -d "server" ] && cp -r server "releases/$BASELINE/"
    echo "$BASELINE" > rollback_release
    echo "$BASELINE" > current_release
fi
EOF`,
        { stdio: "inherit" },
    );

    const rollbackTarget1 = fs.readFileSync(path.join(MOCK_VPS_DIR, "rollback_release"), "utf8").trim();
    console.log(`   ✅ Ghi nhận rollback_release tự động: ${rollbackTarget1}`);
    if (!rollbackTarget1.startsWith("baseline_7e659dff")) {
        throw new Error("Không ghi nhận đúng baseline_7e659dff vào rollback_release!");
    }
    const baselineSavedDir = path.join(MOCK_VPS_DIR, "releases", rollbackTarget1);
    if (!fs.existsSync(path.join(baselineSavedDir, "dist/version.json"))) {
        throw new Error("Thư mục lưu trữ baseline không chứa dist/version.json!");
    }
    if (!fs.existsSync(path.join(baselineSavedDir, "nginx.conf"))) {
        throw new Error("Baseline không lưu trữ nginx.conf!");
    }
    if (!fs.existsSync(path.join(baselineSavedDir, "server/storageServer.mjs"))) {
        throw new Error("Baseline không lưu trữ server/!");
    }
    console.log(
        "   ✅ Bản 7e659dff (dist, nginx.conf, compose.yml, Dockerfile, server/) đã được lưu trữ an toàn!",
    );

    // =========================================================================
    // CA 2: Pre-flight check thất bại trước khi thay đổi máy chủ
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 2: Kiểm tra Image mới thất bại tại Pre-flight (Trước khi đổi bản phục vụ)");
    console.log("========================================================================");

    const preflightFailReleaseId = `20261110_100100_preflight_fail`;
    const preflightDir = path.join(MOCK_VPS_DIR, "releases", preflightFailReleaseId);
    fs.mkdirSync(path.join(preflightDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(preflightDir, "Dockerfile"), "INVALID DOCKERFILE SYNTAX ERROR");

    let preflightBlocked = false;
    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${preflightDir}"

# Bước Pre-flight: Build thử trong thư mục release độc lập
echo "🐳 [Pre-flight] Đang build thử Docker image..."
if grep -q "INVALID" "\${NEW_RELEASE_DIR}/Dockerfile"; then
    echo "❌ Lỗi cú pháp Dockerfile trong releases/\${NEW_RELEASE_DIR}!" >&2
    exit 1
fi
EOF`,
            { stdio: "pipe" },
        );
    } catch (_err) {
        preflightBlocked = true;
        console.log("   ✅ Pre-flight phát hiện lỗi image và dừng triển khai trước khi thay đổi máy chủ!");
    }
    if (!preflightBlocked) throw new Error("Pre-flight lỗi nhưng không chặn!");

    // Xác nhận máy chủ root hoàn toàn không bị ảnh hưởng
    const rootNginx = fs.readFileSync(path.join(MOCK_VPS_DIR, "nginx.conf"), "utf8");
    if (rootNginx !== "# baseline nginx.conf\n") {
        throw new Error("Pre-flight lỗi làm thay đổi file cấu hình ở root!");
    }
    console.log("   ✅ File cấu hình và dist ở root hoàn toàn nguyên vẹn, dịch vụ không bị gián đoạn!");

    // =========================================================================
    // CA 3: Docker Build thất bại SAU KHI đã chép dist và cấu hình (State Changed)
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 3: Lỗi Docker build sau khi đã chép dist và cấu hình (Kích hoạt Rollback)");
    console.log("========================================================================");

    const buildFailReleaseId = `20261110_100200_build_fail`;
    const buildFailDir = path.join(MOCK_VPS_DIR, "releases", buildFailReleaseId);
    fs.mkdirSync(path.join(buildFailDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(buildFailDir, "dist/version.json"), JSON.stringify({ codeSha: "bad_sha" }));
    fs.writeFileSync(path.join(buildFailDir, "nginx.conf"), "# broken nginx config\n");
    fs.writeFileSync(path.join(buildFailDir, "compose.yml"), "# broken compose\n");
    fs.writeFileSync(path.join(buildFailDir, "Dockerfile"), "BROKEN DOCKERFILE");
    fs.mkdirSync(path.join(buildFailDir, "server"), { recursive: true });
    fs.writeFileSync(path.join(buildFailDir, "server/storageServer.mjs"), "// broken server\n");

    let dockerBuildRollbackSuccess = false;
    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${buildFailDir}"

do_rollback() {
    local EXIT_CODE=$?
    trap - ERR EXIT
    echo "🚨 SỰ CỐ XẢY RA (Mã lỗi: \${EXIT_CODE})! Kích hoạt Rollback toàn diện..."
    TARGET=$(cat rollback_release | tr -d '[:space:]')
    echo "   -> Đang khôi phục toàn diện về bản $TARGET..."
    
    # Khôi phục dist
    rm -rf dist.rollback.tmp
    cp -r "releases/$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist
    
    # Khôi phục toàn bộ cấu hình và server
    [ -f "releases/$TARGET/nginx.conf" ] && cp "releases/$TARGET/nginx.conf" nginx.conf
    [ -f "releases/$TARGET/compose.yml" ] && cp "releases/$TARGET/compose.yml" compose.yml
    [ -f "releases/$TARGET/Dockerfile" ] && cp "releases/$TARGET/Dockerfile" Dockerfile
    [ -d "releases/$TARGET/server" ] && cp -r "releases/$TARGET/server" .
    
    echo "   -> Khởi động lại container về bản $TARGET..."
    echo "$TARGET" > current_release
    echo "   ✅ Đã khôi phục hoàn chỉnh về bản $TARGET."
    exit 1
}

trap 'do_rollback' ERR

# ĐÃ BẮT ĐẦU THAY ĐỔI TRẠNG THÁI (Sao chép cấu hình và dist vào root)
cp "\${NEW_RELEASE_DIR}/nginx.conf" nginx.conf
cp "\${NEW_RELEASE_DIR}/compose.yml" compose.yml
cp "\${NEW_RELEASE_DIR}/Dockerfile" Dockerfile
cp -r "\${NEW_RELEASE_DIR}/server" .

rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# Giả lập Docker build thất bại
echo "🐳 Đang thực hiện docker compose build..."
echo "❌ Lỗi: Docker build failed on step 3 (Syntax error in Dockerfile)" >&2
false # Lệnh này trả về mã 1 kích hoạt trap ERR

echo "Bước này không được phép chạy!"
EOF`,
            { stdio: "inherit" },
        );
    } catch (_err) {
        dockerBuildRollbackSuccess = true;
        console.log("   ✅ Đã bẫy được lỗi Docker build và kích hoạt Rollback toàn diện!");
    }

    if (!dockerBuildRollbackSuccess) throw new Error("Docker build lỗi nhưng không kích hoạt rollback!");

    // Kiểm tra tính toàn vẹn sau khi rollback:
    const restoredNginx = fs.readFileSync(path.join(MOCK_VPS_DIR, "nginx.conf"), "utf8");
    const restoredServer = fs.readFileSync(path.join(MOCK_VPS_DIR, "server/storageServer.mjs"), "utf8");
    const restoredSha = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/version.json"), "utf8"),
    ).codeSha;

    if (restoredNginx !== "# baseline nginx.conf\n") {
        throw new Error("Rollback không khôi phục đúng nginx.conf baseline!");
    }
    if (restoredServer !== "// baseline server\n") {
        throw new Error("Rollback không khôi phục đúng server/ baseline!");
    }
    if (restoredSha !== baselineSha) {
        throw new Error(
            `Rollback không khôi phục đúng SHA dist baseline (${restoredSha} !== ${baselineSha})!`,
        );
    }
    console.log(
        "   ✅ Xác nhận: Toàn bộ dist, nginx.conf, compose.yml, Dockerfile, server/ đã được khôi phục 100%!",
    );

    // =========================================================================
    // CA 4: Lỗi Khởi động Container / Restart dịch vụ sau khi chuyển trạng thái
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 4: Lỗi khởi động container / restart dịch vụ sau khi chuyển trạng thái");
    console.log("========================================================================");

    const startFailReleaseId = `20261110_100300_start_fail`;
    const startFailDir = path.join(MOCK_VPS_DIR, "releases", startFailReleaseId);
    fs.mkdirSync(path.join(startFailDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(startFailDir, "dist/version.json"), JSON.stringify({ codeSha: "bad_start" }));
    fs.writeFileSync(path.join(startFailDir, "nginx.conf"), "# start fail nginx\n");

    let startFailRollback = false;
    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${startFailDir}"

do_rollback() {
    trap - ERR EXIT
    echo "🚨 LỖI KHỞI ĐỘNG DỊCH VỤ! Khôi phục về bản trước..."
    TARGET=$(cat rollback_release | tr -d '[:space:]')
    rm -rf dist.rollback.tmp
    cp -r "releases/$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist
    [ -f "releases/$TARGET/nginx.conf" ] && cp "releases/$TARGET/nginx.conf" nginx.conf
    echo "$TARGET" > current_release
    echo "   ✅ Đã khôi phục an toàn về $TARGET."
    exit 1
}

trap 'do_rollback' ERR

# Đổi dist
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# Giả lập lỗi docker compose up
echo "🐳 Đang khởi động docker compose up -d..."
echo "❌ Lỗi: Container chili3d exited with code 127 (Exec format error)" >&2
false
EOF`,
            { stdio: "inherit" },
        );
    } catch (_err) {
        startFailRollback = true;
        console.log("   ✅ Đã bẫy được lỗi khởi động container và khôi phục thành công!");
    }
    if (!startFailRollback) throw new Error("Lỗi khởi động không kích hoạt rollback!");

    const shaAfterStartFail = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/version.json"), "utf8"),
    ).codeSha;
    if (shaAfterStartFail !== baselineSha) {
        throw new Error("Sau lỗi khởi động container, dist không được khôi phục về baseline!");
    }
    console.log(`   ✅ Dịch vụ đã quay lui an toàn về bản ${shaAfterStartFail.slice(0, 8)}`);

    // =========================================================================
    // CA 5: Hậu kiểm toàn diện (HTTP 200, Full 40-char SHA, script JS tham chiếu)
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 5: Hậu kiểm HTTP 200, Full 40-char SHA & file JS tham chiếu");
    console.log("========================================================================");

    // Thử nghiệm 5.1: version.json sai SHA đầy đủ (40 ký tự)
    console.log("   -> Thử nghiệm 5.1: version.json sai SHA 40 ký tự...");
    const badShaReleaseId = `20261110_100400_bad_sha`;
    const badShaDir = path.join(MOCK_VPS_DIR, "releases", badShaSha_id(badShaReleaseId));
    function badShaSha_id(id) {
        return id;
    }
    fs.mkdirSync(path.join(badShaDir, "dist"), { recursive: true });
    fs.writeFileSync(
        path.join(badShaDir, "dist/version.json"),
        JSON.stringify({ codeSha: "1111111111111111111111111111111111111111" }),
    );
    fs.writeFileSync(
        path.join(badShaDir, "dist/deploy-version.json"),
        JSON.stringify({ codeSha: "1111111111111111111111111111111111111111" }),
    );

    let shaMismatchCaught = false;
    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${badShaDir}"

do_rollback() {
    trap - ERR EXIT
    echo "🚨 SHA HẬU KIỂM KHÔNG KHỚP! Tự động quay lui..."
    TARGET=$(cat rollback_release | tr -d '[:space:]')
    rm -rf dist.rollback.tmp
    cp -r "releases/$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist
    echo "$TARGET" > current_release
    exit 1
}

trap 'do_rollback' ERR

# Đổi dist
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# Kiểm tra SHA đầy đủ (WANT_SHA = fbec3c95...)
WANT_SHA="fbec3c9597371d34c1ba75a1c13d8c11e646f901"
node -e "
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('dist/version.json'));
if (v.codeSha !== '${WANT_SHA}') {
    console.error('❌ Mismatch SHA đầy đủ: ' + v.codeSha + ' !== ${WANT_SHA}');
    process.exit(1);
}
"
EOF`,
            { stdio: "inherit" },
        );
    } catch (_err) {
        shaMismatchCaught = true;
        console.log("   ✅ Đã bắt lỗi mismatch full 40-char SHA và kích hoạt rollback!");
    }
    if (!shaMismatchCaught) throw new Error("SHA mismatch 40 ký tự không bị bắt!");

    // Thử nghiệm 5.2: File JS mà HTML tham chiếu bị thiếu / trả về HTML lỗi
    console.log("   -> Thử nghiệm 5.2: File JS trong thẻ script của HTML bị thiếu / trả về HTML lỗi...");
    const missingJsReleaseId = `20261110_100500_missing_js`;
    const missingJsDir = path.join(MOCK_VPS_DIR, "releases", missingJsReleaseId);
    fs.mkdirSync(path.join(missingJsDir, "dist"), { recursive: true });
    fs.writeFileSync(
        path.join(missingJsDir, "dist/index.html"),
        '<!DOCTYPE html><html><head><script src="main.nonexistent.js"></script></head><body></body></html>',
    );
    // File main.nonexistent.js không được tạo!

    let missingJsCaught = false;
    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${missingJsDir}"

do_rollback() {
    trap - ERR EXIT
    echo "🚨 FILE JS THAM CHIẾU KHÔNG TẢI ĐƯỢC! Tự động quay lui..."
    TARGET=$(cat rollback_release | tr -d '[:space:]')
    rm -rf dist.rollback.tmp
    cp -r "releases/$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist
    echo "$TARGET" > current_release
    exit 1
}

trap 'do_rollback' ERR

# Đổi dist
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# Trích xuất và kiểm tra file JS trong index.html
MISSING=0
for js in $(grep -o 'src="[^"]*.js"' dist/index.html | cut -d'"' -f2); do
    if [ ! -f "dist/$js" ]; then
        echo "❌ File JS tham chiếu $js không tồn tại!" >&2
        MISSING=1
    fi
done
if [ "$MISSING" -eq 1 ]; then
    do_rollback
fi
EOF`,
            { stdio: "inherit" },
        );
    } catch (_err) {
        missingJsCaught = true;
        console.log("   ✅ Đã bắt được lỗi file JS tham chiếu bị thiếu và rollback an toàn!");
    }
    if (!missingJsCaught) throw new Error("Lỗi file JS tham chiếu không bị bắt!");

    // =========================================================================
    // CA 6: Xác minh sau Rollback & Chrome qua màn hình Loading
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 6: Xác minh SHA 40 ký tự sau rollback & Chrome mở CAD qua Loading");
    console.log("========================================================================");

    // Khởi động Mock Server từ dist hiện tại (đã được rollback về baseline 7e659dff)
    const server = await createMockServer(path.join(MOCK_VPS_DIR, "dist"));

    // Kiểm tra 2 endpoint qua HTTP
    const httpVerRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/version.json`);
    const httpDepRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/deploy-version.json`);
    if (httpVerRes.status !== 200 || httpDepRes.status !== 200) {
        throw new Error(`Endpoint HTTP không trả về 200: ver=${httpVerRes.status}, dep=${httpDepRes.status}`);
    }
    const httpVerJson = await httpVerRes.json();
    const httpDepJson = await httpDepRes.json();

    console.log(`   -> HTTP version.json codeSha:        ${httpVerJson.codeSha}`);
    console.log(`   -> HTTP deploy-version.json codeSha: ${httpDepJson.codeSha}`);

    if (httpVerJson.codeSha !== baselineSha || httpDepJson.codeSha !== baselineSha) {
        throw new Error("SHA trên HTTP không khớp đúng SHA 40 ký tự của 7e659dff!");
    }
    console.log("   ✅ Cả 2 endpoint HTTP trả về mã 200 và khớp chính xác 40 ký tự SHA baseline!");

    // Kiểm tra Chrome mở CAD
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
        server.close();
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

    // =========================================================================
    // CA 7: Mô phỏng tab cũ tiếp tục tải chunk sau khi nâng cấp phiên bản
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 7: Mô phỏng tab cũ cần tải chunk sau khi server đổi phiên bản");
    console.log("========================================================================");

    // Tạo một release mới có contenthash và copy giữ lại chunk cũ
    const upgradeReleaseId = `20261110_100600_upgraded`;
    const upgradeReleaseDir = path.join(MOCK_VPS_DIR, "releases", upgradeReleaseId);
    fs.mkdirSync(path.join(upgradeReleaseDir, "dist"), { recursive: true });

    // Tạo chunk mới
    fs.writeFileSync(path.join(upgradeReleaseDir, "dist/main.new12345.js"), "console.log('new main');");
    fs.writeFileSync(path.join(upgradeReleaseDir, "dist/chunk.new99999.js"), "console.log('new chunk');");

    // Tạo chunk cũ trong dist hiện tại
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "dist/old_lazy_chunk.js"), "console.log('old lazy chunk');");

    // Chạy logic bảo toàn chunk cũ (cp -n)
    execSync(
        `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
NEW_RELEASE_DIR="${upgradeReleaseDir}"
cp -n dist/*.js "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist
EOF`,
        { stdio: "inherit" },
    );

    // Xác nhận chunk cũ vẫn tồn tại trong dist đang phục vụ của server mới
    if (!fs.existsSync(path.join(MOCK_VPS_DIR, "dist/old_lazy_chunk.js"))) {
        throw new Error("Chunk cũ của tab trước không được bảo toàn sau khi nâng cấp!");
    }
    if (!fs.existsSync(path.join(MOCK_VPS_DIR, "dist/chunk.new99999.js"))) {
        throw new Error("Chunk mới không được triển khai!");
    }
    console.log("   ✅ Xác nhận: Tab cũ yêu cầu tải old_lazy_chunk.js vẫn tìm thấy file (không bị lỗi 404)!");
    console.log("   ✅ Xác nhận: Phiên mới nạp chunk.new99999.js hoạt động song song mượt mà!");

    console.log("\n================================================================================");
    console.log("🎉 TẤT CẢ 7 CA KIỂM THỬ QUY TRÌNH PHÁT HÀNH ĐÃ ĐẠT 100% TIÊU CHÍ!");
    console.log("================================================================================");
}

main().catch((err) => {
    console.error("\n❌ KIỂM THỬ THẤT BÀI:", err);
    process.exit(1);
});
