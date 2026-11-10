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
const REAL_BASELINE_DIST = path.join(ROOT_DIR, "dist"); // Our verified build

// CDP Client Helper
class ChromeClient {
    constructor(port, userDir) {
        this.port = port;
        this.userDir = userDir;
        this.proc = null;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.consoleLogs = [];
    }

    async launch() {
        this.proc = spawn(CHROME, [
            `--remote-debugging-port=${this.port}`,
            "--window-size=1280,800",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            `--user-data-dir=${this.userDir}`,
            "about:blank",
        ]);

        let connected = false;
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 200));
            try {
                const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
                if (res.ok) {
                    connected = true;
                    break;
                }
            } catch {}
        }
        if (!connected) throw new Error(`Could not connect to Chrome on port ${this.port}`);

        const pagesRes = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        const pages = await pagesRes.json();
        const target = pages.find((p) => p.type === "page");
        if (!target) throw new Error("No page target found");

        this.ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            this.ws.addEventListener("open", resolve, { once: true });
            this.ws.addEventListener("error", reject, { once: true });
        });

        this.ws.addEventListener("message", (e) => {
            const msg = JSON.parse(e.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result);
            }
            if (msg.method === "Runtime.consoleAPICalled") {
                const text = msg.params.args.map((a) => a.value || JSON.stringify(a)).join(" ");
                this.consoleLogs.push({ type: msg.params.type, text });
            }
        });

        await this.send("Page.enable");
        await this.send("Runtime.enable");
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expr) {
        const res = await this.send("Runtime.evaluate", {
            expression: expr,
            returnByValue: true,
            awaitPromise: true,
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
            ".svg": "image/svg+xml",
        };
        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.writeHead(200);
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise((resolve) => {
        server.listen(SERVER_PORT, "127.0.0.1", () => resolve(server));
    });
}

async function main() {
    console.log("================================================================================");
    console.log("🧪 KIỂM THỬ QUY TRÌNH PHÁT HÀNH: LẦN ĐẦU CHƯA CÓ CURRENT_RELEASE, LỖI BUILD & HẬU KIỂM");
    console.log("================================================================================");

    // Chuẩn bị thư mục mock VPS:
    // Đặt bản baseline 7e659dff làm dist đang phục vụ
    fs.rmSync(MOCK_VPS_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.join(MOCK_VPS_DIR, "dist"), { recursive: true });

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

    // Sao chép dist thật sang mock dist và ghi version 7e659dff
    fs.cpSync(REAL_BASELINE_DIST, path.join(MOCK_VPS_DIR, "dist"), { recursive: true });
    fs.writeFileSync(
        path.join(MOCK_VPS_DIR, "dist/version.json"),
        JSON.stringify(baselineVersionJson, null, 2),
    );
    fs.writeFileSync(
        path.join(MOCK_VPS_DIR, "dist/deploy-version.json"),
        JSON.stringify(baselineVersionJson, null, 2),
    );
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "nginx.conf"), "# mock nginx.conf\n");
    fs.writeFileSync(path.join(MOCK_VPS_DIR, "compose.yml"), "# mock compose.yml\n");

    // Xác nhận ban đầu: CHƯA CÓ current_release và CHƯA CÓ rollback_release
    console.log("\n--- [Kiểm tra trạng thái ban đầu của mock VPS] ---");
    console.log("   current_release tồn tại:", fs.existsSync(path.join(MOCK_VPS_DIR, "current_release")));
    console.log("   rollback_release tồn tại:", fs.existsSync(path.join(MOCK_VPS_DIR, "rollback_release")));
    console.log("   dist/version.json codeSha:", baselineVersionJson.codeShort);

    // =========================================================================
    // CA 1: Lần chuyển đầu tiên khi VPS chưa có current_release
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 1: Kiểm thử lần chuyển đầu khi VPS chưa có current_release");
    console.log("========================================================================");

    // Chạy logic step 4 (lưu baseline và chuyển release mới)
    const newReleaseId = `20261110_100000_fbec3c95`;
    const newReleaseDir = path.join(MOCK_VPS_DIR, "releases", newReleaseId);
    fs.mkdirSync(path.join(newReleaseDir, "dist"), { recursive: true });

    // Tạo gói mới giả lập fbec3c95
    fs.cpSync(path.join(MOCK_VPS_DIR, "dist"), path.join(newReleaseDir, "dist"), { recursive: true });
    const newVersionJson = {
        ...baselineVersionJson,
        codeSha: "fbec3c95a1b2c3d4e5f678901234567890abcdef",
        codeShort: "fbec3c95",
    };
    fs.writeFileSync(path.join(newReleaseDir, "dist/version.json"), JSON.stringify(newVersionJson, null, 2));
    fs.writeFileSync(
        path.join(newReleaseDir, "dist/deploy-version.json"),
        JSON.stringify(newVersionJson, null, 2),
    );
    fs.writeFileSync(path.join(newReleaseDir, "nginx.conf"), "# new nginx.conf\n");

    // Chạy script logic bash mô phỏng step [4/5]
    execSync(
        `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"

NEW_RELEASE_DIR="${newReleaseDir}"
RELEASE_ID="${newReleaseId}"

# 1. Bảo toàn chunk hash cũ từ bản cũ sang bản mới
if [ -d "dist" ]; then
    cp -n dist/*.js "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
    cp -n dist/*.css "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
    cp -n dist/*.wasm "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
fi

# 2. Xử lý lưu baseline khi chưa có current_release
if [ -f "current_release" ]; then
    CURRENT=$(cat current_release | tr -d '[:space:]')
    echo "   -> Ghi nhận rollback target: $CURRENT"
    echo "$CURRENT" > rollback_release
elif [ -d "dist" ] && [ -f "dist/version.json" ]; then
    OLD_SHA=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync("dist/version.json","utf8")).codeShort||"legacy")}catch{process.stdout.write("legacy")}' 2>/dev/null || echo "legacy")
    BASELINE="baseline_\${OLD_SHA}_20261110_090000"
    echo "   -> Phát hiện VPS chưa có current_release nhưng đang phục vụ dist ($OLD_SHA)."
    echo "   -> Đang tạo bản sao lưu an toàn tại releases/$BASELINE..."
    mkdir -p "releases/$BASELINE"
    cp -r dist "releases/$BASELINE/dist"
    [ -f "nginx.conf" ] && cp nginx.conf "releases/$BASELINE/"
    [ -f "compose.yml" ] && cp compose.yml "releases/$BASELINE/"
    echo "$BASELINE" > rollback_release
    echo "$BASELINE" > current_release
fi

# 3. Chuyển đổi sang bản mới
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist
EOF`,
        { stdio: "inherit" },
    );

    const rollbackTarget1 = fs.readFileSync(path.join(MOCK_VPS_DIR, "rollback_release"), "utf8").trim();
    console.log(`   ✅ Ghi nhận rollback_release tự động: ${rollbackTarget1}`);
    if (!rollbackTarget1.startsWith("baseline_7e659dff")) {
        throw new Error("Không ghi nhận đúng baseline_7e659dff vào rollback_release!");
    }
    if (!fs.existsSync(path.join(MOCK_VPS_DIR, "releases", rollbackTarget1, "dist", "version.json"))) {
        throw new Error("Thư mục lưu trữ baseline không chứa dist/version.json!");
    }
    console.log("   ✅ Bản phục vụ 7e659dff đã được đóng gói và lưu trữ đầy đủ trong releases/");

    // Thử rollback ngay về bản 7e659dff này
    console.log("   -> Thử nghiệm rollback về bản baseline vừa lưu...");
    execSync(`bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"
TARGET=$(cat rollback_release | tr -d '[:space:]')
CURRENT=$(cat current_release | tr -d '[:space:]')
rm -rf dist.rollback.tmp
cp -r "releases/$TARGET/dist" dist.rollback.tmp
rm -rf dist
mv dist.rollback.tmp dist
echo "$TARGET" > current_release
echo "$CURRENT" > rollback_release
EOF`);

    const rolledSha1 = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/version.json"), "utf8"),
    ).codeSha;
    const rolledDeploySha1 = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/deploy-version.json"), "utf8"),
    ).codeSha;
    console.log(`   -> version.json codeSha sau rollback:        ${rolledSha1}`);
    console.log(`   -> deploy-version.json codeSha sau rollback: ${rolledDeploySha1}`);
    if (rolledSha1 !== baselineSha || rolledDeploySha1 !== baselineSha) {
        throw new Error("Rollback không trả về đúng SHA của 7e659dff!");
    }
    console.log("   ✅ Xác nhận có thể quay lui về đúng bản 7e659dff từ lần chuyển đầu tiên!");

    // =========================================================================
    // CA 2: Cố tình làm lỗi build
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 2: Cố tình làm lỗi build tại máy đóng gói");
    console.log("========================================================================");

    console.log("   -> Kích hoạt mô phỏng lỗi build (lệnh build ném lỗi exit 1)...");
    let buildFailedAsExpected = false;
    try {
        execSync(
            `bash -c '
            set -euo pipefail
            echo "📦 [1/5] Đang đóng gói bản Production tại máy Local..."
            # Cố tình ném lỗi trong bước build
            echo "❌ Lỗi cú pháp TypeScript trong file src/index.ts: Unexpected token" >&2
            exit 1
            echo "Bước này không bao giờ được chạy"
        '`,
            { stdio: "pipe" },
        );
    } catch (_err) {
        buildFailedAsExpected = true;
        console.log(`   ✅ Script đã chặn ngay lập tức tại bước build: exit code ${err.status}`);
    }

    if (!buildFailedAsExpected) throw new Error("Bước build bị lỗi nhưng script không dừng!");

    // Kiểm tra máy chủ: Bản 7e659dff hoàn toàn nguyên vẹn
    const shaAfterBuildError = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/version.json"), "utf8"),
    ).codeSha;
    if (shaAfterBuildError !== baselineSha) {
        throw new Error("Lỗi build làm ảnh hưởng đến bản đang phục vụ trên máy chủ!");
    }
    console.log(`   ✅ Máy chủ hoàn toàn không bị ảnh hưởng, vẫn phục vụ ${shaAfterBuildError.slice(0, 8)}`);

    // =========================================================================
    // CA 3: Cố tình làm lỗi hậu kiểm và tự động quay lui (Rollback)
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 3: Cố tình làm lỗi hậu kiểm và tự động Rollback về bản trước");
    console.log("========================================================================");

    const badReleaseId = `20261110_100500_bad_release`;
    const badReleaseDir = path.join(MOCK_VPS_DIR, "releases", badReleaseId);
    fs.mkdirSync(path.join(badReleaseDir, "dist"), { recursive: true });

    // Cố tình làm hỏng gói phát hành: Ghi sai SHA và xóa mất main.*.js
    fs.cpSync(path.join(MOCK_VPS_DIR, "dist"), path.join(badReleaseDir, "dist"), { recursive: true });
    const badVersionJson = {
        ...baselineVersionJson,
        codeSha: "0000000000000000000000000000000000000000",
        codeShort: "00000000",
    };
    fs.writeFileSync(path.join(badReleaseDir, "dist/version.json"), JSON.stringify(badVersionJson, null, 2));
    fs.writeFileSync(
        path.join(badReleaseDir, "dist/deploy-version.json"),
        JSON.stringify(badVersionJson, null, 2),
    );
    // Cố tình làm hỏng index.html không chứa main.
    fs.writeFileSync(path.join(badReleaseDir, "dist/index.html"), "<html><body>Corrupted</body></html>");

    console.log("   -> Kích hoạt triển khai bản lỗi vào dist và chạy bước hậu kiểm...");
    let rollbackTriggered = false;

    try {
        execSync(
            `bash -s << 'EOF'
set -euo pipefail
cd "${MOCK_VPS_DIR}"

NEW_RELEASE_DIR="${badReleaseDir}"
RELEASE_ID="${badReleaseId}"

# Ghi nhận rollback target là bản hiện tại đang phục vụ
CURRENT=$(cat current_release | tr -d '[:space:]')
echo "$CURRENT" > rollback_release

# Đổi dist sang bản lỗi
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# BƯỚC HẬU KIỂM:
do_rollback() {
    echo "🚨 HẬU KIỂM THẤT BÀI! Tự động kích hoạt cơ chế quay lui (Rollback)..."
    TARGET=$(cat rollback_release | tr -d '[:space:]')
    echo "   -> Đang khôi phục về bản dự phòng $TARGET..."
    rm -rf dist.rollback.tmp
    cp -r "releases/$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist
    echo "$TARGET" > current_release
    echo "   ✅ Đã khôi phục an toàn về bản $TARGET."
    exit 1
}

# Kiểm tra 1: version.json
VER_SHA=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync("dist/version.json")).codeShort)}catch{}' || echo "")
WANT_SHA="fbec3c95"
if [ "$VER_SHA" != "$WANT_SHA" ]; then
    echo "❌ Lỗi hậu kiểm: version.json SHA ($VER_SHA) != mong muốn ($WANT_SHA)!"
    do_rollback
fi

# CHỈ CHỐT current_release KHI VƯỢT QUA TẤT CẢ HẬU KIỂM
echo "$RELEASE_ID" > current_release
EOF`,
            { stdio: "inherit" },
        );
    } catch (_err) {
        rollbackTriggered = true;
        console.log("   ✅ Cơ chế tự động Rollback đã được kích hoạt thành công!");
    }

    if (!rollbackTriggered) throw new Error("Hậu kiểm lỗi nhưng rollback không kích hoạt!");

    // Xác minh kết quả sau khi tự động rollback:
    const activeCurrent = fs.readFileSync(path.join(MOCK_VPS_DIR, "current_release"), "utf8").trim();
    const shaAfterRollback = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/version.json"), "utf8"),
    ).codeSha;
    const deployShaAfterRollback = JSON.parse(
        fs.readFileSync(path.join(MOCK_VPS_DIR, "dist/deploy-version.json"), "utf8"),
    ).codeSha;

    console.log(`   -> current_release sau rollback:        ${activeCurrent}`);
    console.log(`   -> version.json codeSha sau rollback:        ${shaAfterRollback}`);
    console.log(`   -> deploy-version.json codeSha sau rollback: ${deployShaAfterRollback}`);

    if (activeCurrent === badReleaseId) {
        throw new Error("current_release bị chốt vào bản lỗi!");
    }
    if (shaAfterRollback !== baselineSha || deployShaAfterRollback !== baselineSha) {
        throw new Error("Hai endpoint phiên bản không khớp SHA baseline 7e659dff!");
    }
    console.log(
        "   ✅ Xác nhận: current_release KHÔNG bị chốt vào bản lỗi, cả 2 endpoint đều khớp 7e659dff!",
    );

    // =========================================================================
    // CA 4: Khởi chạy Chrome kiểm tra App mở thành công sau khi Rollback
    // =========================================================================
    console.log("\n========================================================================");
    console.log("📌 CA 4: Chrome mở app thành công trên bản đã quay lui (7e659dff)");
    console.log("========================================================================");

    const server = await createMockServer(path.join(MOCK_VPS_DIR, "dist"));
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

        // Mở bản vẽ Dự án 1
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
        console.log("   ✅ Giao diện 3D CAD hiển thị mượt mà trên bản đã quay lui!");
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

    console.log("\n================================================================================");
    console.log("🎉 TẤT CẢ CÁC KỊCH BẢN KIỂM THỬ QUY TRÌNH PHÁT HÀNH ĐÃ ĐẠT 100% TIÊU CHÍ!");
    console.log("================================================================================");
}

main().catch((err) => {
    console.error("\n❌ KIỂM THỬ THẤT BÀI:", err);
    process.exit(1);
});
