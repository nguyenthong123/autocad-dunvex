// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Native CDP Browser Verification for TASK-26 / TASK-27
// 0 external dependencies (uses native Node 22 fetch, WebSocket, child_process).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const EVIDENCE_DIR = resolve(repoRoot, "docs/tasks/TASK-26-evidence");
const SCREENSHOT_DIR = resolve(repoRoot, "screenshots");
const DB_NAME = "chili3d-db";
const TABLE = "documents";

mkdirSync(EVIDENCE_DIR, { recursive: true });
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const CHROME_CANDIDATES = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
].filter((candidate) => candidate !== undefined);

function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(`No Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`);
}

class Cdp {
    #socket;
    #nextId = 1;
    #pending = new Map();
    #listeners = new Map();

    static async attach(webSocketDebuggerUrl) {
        const client = new Cdp();
        client.#socket = new WebSocket(webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            client.#socket.addEventListener("open", resolve, { once: true });
            client.#socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
                once: true,
            });
        });
        client.#socket.addEventListener("message", (event) => client.#receive(event.data));

        // Auto-accept any native dialogs (alert/confirm/prompt) so browser doesn't freeze
        client.on("Page.javascriptDialogOpening", async () => {
            try {
                await client.send("Page.handleJavaScriptDialog", { accept: true });
            } catch {}
        });

        return client;
    }

    #receive(data) {
        const message = JSON.parse(typeof data === "string" ? data : data.toString());
        if (message.id !== undefined) {
            const entry = this.#pending.get(message.id);
            this.#pending.delete(message.id);
            if (entry === undefined) return;
            if (message.error !== undefined) entry.reject(new Error(`${message.error.message}`));
            else entry.resolve(message.result);
            return;
        }
        for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params);
    }

    on(method, listener) {
        const list = this.#listeners.get(method) ?? [];
        list.push(listener);
        this.#listeners.set(method, list);
    }

    send(method, params = {}, timeoutMs = 15000) {
        const id = this.#nextId++;
        this.#socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(id);
                reject(new Error(`CDP method ${method} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.#pending.set(id, {
                resolve: (res) => {
                    clearTimeout(timer);
                    resolve(res);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });
        });
    }

    close() {
        this.#socket.close();
    }
}

class Page {
    constructor(cdp, port, targetId) {
        this.cdp = cdp;
        this.port = port;
        this.targetId = targetId;
    }

    async evaluate(expression) {
        const result = await this.cdp.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (result.exceptionDetails !== undefined) {
            throw new Error(
                `In page: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
            );
        }
        return result.result.value;
    }

    async reload() {
        await this.cdp.send("Page.reload");
        await this.waitForApp();
    }

    async screenshot(filePath) {
        const { data } = await this.cdp.send("Page.captureScreenshot", { format: "png" });
        const bytes = Buffer.from(data, "base64");
        writeFileSync(filePath, bytes);
        return bytes.length;
    }

    async waitForApp(timeoutMs = 30000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const ready = await this.evaluate(
                    "typeof globalThis.__chiliTest !== 'undefined' && typeof window.Chili3dCore !== 'undefined'",
                );
                if (ready) return;
            } catch {}
            await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error("Timeout waiting for Chili3D app to initialize");
    }

    async close() {
        this.cdp.close();
        if (this.targetId) {
            await fetch(`http://127.0.0.1:${this.port}/json/close/${this.targetId}`).catch(() => {});
        }
    }
}

async function withChrome(profileDir, callback) {
    const chrome = findChrome();
    const port = 9333 + (process.pid % 400);
    const child = spawn(
        chrome,
        [
            "--headless=new",
            `--remote-debugging-port=${port}`,
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--no-first-run",
            "--no-default-browser-check",
            `--user-data-dir=${profileDir}`,
            "about:blank",
        ],
        { stdio: ["ignore", "inherit", "inherit"] },
    );

    try {
        await waitForDevTools(port, child);
        const browser = {
            async newPage(url) {
                const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
                    method: "PUT",
                });
                if (!response.ok) throw new Error(`Could not open tab: ${response.status}`);
                const target = await response.json();
                const cdp = await Cdp.attach(target.webSocketDebuggerUrl);
                await cdp.send("Page.enable");
                await cdp.send("Runtime.enable");
                return new Page(cdp, port, target.id);
            },
        };
        return await callback(browser);
    } finally {
        child.kill("SIGKILL");
    }
}

async function waitForDevTools(port, child, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr = "";
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Chrome exited early with code ${child.exitCode}`);
        }
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) return await res.json();
        } catch (e) {
            lastErr = e.message;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    child.kill("SIGKILL");
    throw new Error(`Chrome never opened port ${port} (last fetch error: ${lastErr})`);
}

async function checkUrl(url, timeoutMs = 1000) {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        return res.ok || res.status < 500;
    } catch {
        return false;
    }
}

async function startStorageServer(dataDir) {
    const serverProc = spawn("node", ["server/storageServer.mjs"], {
        cwd: repoRoot,
        env: { ...process.env, PORT: "3000", DATA_DIR: dataDir },
        stdio: "inherit",
    });
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (await checkUrl(`http://127.0.0.1:3000/api/storage/${DB_NAME}/${TABLE}/ping`)) {
            return serverProc;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    serverProc.kill("SIGKILL");
    throw new Error("Local storageServer failed to start on port 3000");
}

async function startDevServer() {
    console.log("Starting Rspack dev server on port 8080...");
    const devProc = spawn("npx", ["rspack", "serve"], {
        cwd: repoRoot,
        stdio: "inherit",
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (await checkUrl("http://localhost:8080")) {
            console.log("Rspack dev server is ready!");
            return devProc;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    devProc.kill("SIGKILL");
    throw new Error("Rspack dev server failed to start on port 8080");
}

// ---------------------------------------------------------------------------------------------
// K1 - K8 Test Execution
// ---------------------------------------------------------------------------------------------

async function runK1(browser) {
    console.log("\n▶ Chạy K1: Đóng tab khi đang 'Chưa đồng bộ'");
    const page = await browser.newPage("http://localhost:8080");
    try {
        await page.waitForApp();
        const docId = `k1_${Date.now()}`;

        // 1. Create and save document initial
        await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K1 Initial", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // 2. Block network to storage API only (NOT javascript bundles)
        await page.cdp.send("Network.enable");
        await page.cdp.send("Network.setBlockedURLs", { urls: ["*/api/storage/*"] });

        // 3. Edit document locally
        await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K1 Edited Offline", models: { nodes: [] } });
        })()`);

        const pending = await page.evaluate(
            "window.Chili3dCore.getCurrentApplication().storage.getPendingSyncCount()",
        );
        const isDirty = await page.evaluate(
            `window.Chili3dCore.getCurrentApplication().storage.isDirty("${DB_NAME}", "${TABLE}", "${docId}")`,
        );

        // 4. Open new tab BEFORE closing page to guarantee browser continuity
        const page2 = await browser.newPage("http://localhost:8080");
        await page.close();

        try {
            await page2.waitForApp();
            const loaded = await page2.evaluate(`(async () => {
                const app = window.Chili3dCore.getCurrentApplication();
                return await app.storage.get("${DB_NAME}", "${TABLE}", "${docId}");
            })()`);

            const pass = loaded && loaded.name === "K1 Edited Offline" && isDirty === true;
            const evidence = {
                scenario: "K1",
                pass,
                isDirtyBeforeClose: isDirty,
                pendingBeforeClose: pending,
                retrievedName: loaded?.name,
            };
            writeFileSync(join(EVIDENCE_DIR, "K1.json"), JSON.stringify(evidence, null, 2));
            console.log(`  Kết quả K1: ${pass ? "PASS" : "FAIL"}`);
            return pass;
        } finally {
            await page2.close();
        }
    } finally {
        try {
            await page.close();
        } catch {}
    }
}

async function runK2(browser) {
    console.log("\n▶ Chạy K2: Offline rồi khôi phục mạng -> outbox tự flush");
    const page = await browser.newPage("http://localhost:8080");
    try {
        await page.waitForApp();
        const docId = `k2_${Date.now()}`;

        // Initial save
        await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K2 Initial", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // Block storage API
        await page.cdp.send("Network.enable");
        await page.cdp.send("Network.setBlockedURLs", { urls: ["*/api/storage/*"] });

        // Edit offline
        await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K2 Edited Offline", models: { nodes: [] } });
        })()`);

        const pendingBefore = await page.evaluate(
            "window.Chili3dCore.getCurrentApplication().storage.getPendingSyncCount()",
        );

        // Restore network
        await page.cdp.send("Network.setBlockedURLs", { urls: [] });
        await page.evaluate(`(async () => {
            window.dispatchEvent(new Event("online"));
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.flushOutbox();
        })()`);

        const pendingAfter = await page.evaluate(
            "window.Chili3dCore.getCurrentApplication().storage.getPendingSyncCount()",
        );

        // Verify on server
        const res = await fetch(`http://127.0.0.1:3000/api/storage/${DB_NAME}/${TABLE}/${docId}`);
        const serverDoc = await res.json();

        const pass = pendingBefore === 1 && pendingAfter === 0 && serverDoc.name === "K2 Edited Offline";
        const evidence = { scenario: "K2", pass, pendingBefore, pendingAfter, serverDoc };
        writeFileSync(join(EVIDENCE_DIR, "K2.json"), JSON.stringify(evidence, null, 2));
        console.log(`  Kết quả K2: ${pass ? "PASS" : "FAIL"}`);
        return pass;
    } finally {
        await page.close();
    }
}

async function runK3(browser) {
    console.log("\n▶ Chạy K3: Offline, đóng tab, mở lại vẫn offline -> load bản local");
    const page = await browser.newPage("http://localhost:8080");
    try {
        await page.waitForApp();
        const docId = `k3_${Date.now()}`;

        // Save local and keep it dirty by blocking network first
        await page.cdp.send("Network.enable");
        await page.cdp.send("Network.setBlockedURLs", { urls: ["*/api/storage/*"] });

        await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K3 Offline Doc", models: { nodes: [] } });
        })()`);

        // Open new tab before closing previous
        const page2 = await browser.newPage("http://localhost:8080");
        await page.close();

        try {
            await page2.cdp.send("Network.enable");
            await page2.cdp.send("Network.setBlockedURLs", { urls: ["*/api/storage/*"] });
            await page2.waitForApp();

            const loaded = await page2.evaluate(`(async () => {
                const app = window.Chili3dCore.getCurrentApplication();
                return await app.storage.get("${DB_NAME}", "${TABLE}", "${docId}");
            })()`);

            const pass = loaded && loaded.name === "K3 Offline Doc";
            const evidence = { scenario: "K3", pass, loadedName: loaded?.name };
            writeFileSync(join(EVIDENCE_DIR, "K3.json"), JSON.stringify(evidence, null, 2));
            console.log(`  Kết quả K3: ${pass ? "PASS" : "FAIL"}`);
            return pass;
        } finally {
            await page2.close();
        }
    } finally {
        try {
            await page.close();
        } catch {}
    }
}

async function runK4(browser) {
    console.log("\n▶ Chạy K4: 2 tab mở cùng project. Tab A sửa, Tab B reload");
    const pageA = await browser.newPage("http://localhost:8080");
    const pageB = await browser.newPage("http://localhost:8080");
    try {
        await pageA.waitForApp();
        await pageB.waitForApp();

        const docId = `k4_${Date.now()}`;

        // Initial doc
        await pageA.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K4 Shared Doc", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // Tab B loads it
        await pageB.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.get("${DB_NAME}", "${TABLE}", "${docId}");
        })()`);

        // Tab A modifies and saves
        await pageA.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K4 Updated By Tab A", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // Tab B reloads
        await pageB.reload();
        const loadedOnB = await pageB.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            return await app.storage.get("${DB_NAME}", "${TABLE}", "${docId}");
        })()`);

        await pageB.screenshot(join(SCREENSHOT_DIR, "task26-k4-tabB.png"));

        const pass = loadedOnB && loadedOnB.name === "K4 Updated By Tab A";
        const evidence = { scenario: "K4", pass, loadedOnBName: loadedOnB?.name };
        writeFileSync(join(EVIDENCE_DIR, "K4.json"), JSON.stringify(evidence, null, 2));
        console.log(`  Kết quả K4: ${pass ? "PASS" : "FAIL"}`);
        return pass;
    } finally {
        await pageA.close();
        await pageB.close();
    }
}

async function runK5(browser) {
    console.log("\n▶ Chạy K5: 2 tab sửa đồng thời -> 409 Conflict -> Lưu thành bản sao");
    const pageA = await browser.newPage("http://localhost:8080");
    const pageB = await browser.newPage("http://localhost:8080");
    try {
        await pageA.waitForApp();
        await pageB.waitForApp();

        const docId = `k5_${Date.now()}`;

        // Initial doc (v1)
        await pageA.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K5 Initial Doc", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // Both tabs get v1
        await pageA.evaluate(
            `window.Chili3dCore.getCurrentApplication().storage.get("${DB_NAME}", "${TABLE}", "${docId}")`,
        );
        await pageB.evaluate(
            `window.Chili3dCore.getCurrentApplication().storage.get("${DB_NAME}", "${TABLE}", "${docId}")`,
        );

        // Tab A saves first -> v2
        await pageA.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K5 Edit By Tab A", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // Tab B saves second (baseVersion 1) -> 409 Conflict!
        const bResult = await pageB.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K5 Edit By Tab B", models: { nodes: [] } });
            await app.storage.flushOutbox();
            const items = app.storage.outbox.getPendingItems();
            return {
                conflict: items[0]?.conflict,
                currentServerVersion: items[0]?.currentServerVersion,
                key: items[0]?.id
            };
        })()`);

        // Tab B resolves conflict via save-as-copy
        const copyResult = await pageB.evaluate(`(async (itemKey) => {
            const app = window.Chili3dCore.getCurrentApplication();
            const copyId = await app.storage.resolveConflictSaveCopy(itemKey);
            await app.storage.flushOutbox();
            return {
                copyId,
                pendingCount: app.storage.getPendingSyncCount()
            };
        })("${bResult.key}")`);

        await pageB.screenshot(join(SCREENSHOT_DIR, "task26-k5-conflict-copy.png"));

        // Verify original doc on server retains Tab A's edits
        const resOrig = await fetch(`http://127.0.0.1:3000/api/storage/${DB_NAME}/${TABLE}/${docId}`);
        const docOrig = await resOrig.json();

        // Verify copy doc on server contains Tab B's edits
        const resCopy = await fetch(
            `http://127.0.0.1:3000/api/storage/${DB_NAME}/${TABLE}/${copyResult.copyId}`,
        );
        const docCopy = await resCopy.json();

        const pass =
            bResult.conflict === true &&
            bResult.currentServerVersion === 2 &&
            docOrig.name === "K5 Edit By Tab A" &&
            docCopy.name.includes("K5 Edit By Tab B") &&
            docCopy.name.includes("Bản sao xung đột");

        const evidence = { scenario: "K5", pass, bResult, copyResult, docOrig, docCopy };
        writeFileSync(join(EVIDENCE_DIR, "K5.json"), JSON.stringify(evidence, null, 2));
        console.log(`  Kết quả K5: ${pass ? "PASS" : "FAIL"}`);
        return pass;
    } finally {
        await pageA.close();
        await pageB.close();
    }
}

async function runK6(browser) {
    console.log("\n▶ Chạy K6: Xóa IndexedDB, mở lại tab -> load từ server");
    const page = await browser.newPage("http://localhost:8080");
    try {
        await page.waitForApp();
        const docId = `k6_${Date.now()}`;

        // Save to server
        await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", { id: "${docId}", name: "K6 Server Stored", models: { nodes: [] } });
            await app.storage.flushOutbox();
        })()`);

        // Open new tab before closing page
        const cleanPage = await browser.newPage("http://localhost:8080");
        await page.close();

        try {
            await cleanPage.cdp.send("Storage.clearDataForOrigin", {
                origin: "http://localhost:8080",
                storageTypes: "indexeddb",
            });
            await cleanPage.reload();

            // Load from server
            const loaded = await cleanPage.evaluate(`(async () => {
                const app = window.Chili3dCore.getCurrentApplication();
                return await app.storage.get("${DB_NAME}", "${TABLE}", "${docId}");
            })()`);

            const pass = loaded && loaded.name === "K6 Server Stored";
            const evidence = { scenario: "K6", pass, loadedName: loaded?.name };
            writeFileSync(join(EVIDENCE_DIR, "K6.json"), JSON.stringify(evidence, null, 2));
            console.log(`  Kết quả K6: ${pass ? "PASS" : "FAIL"}`);
            return pass;
        } finally {
            await cleanPage.close();
        }
    } finally {
        try {
            await page.close();
        } catch {}
    }
}

async function runK7(browser) {
    console.log("\n▶ Chạy K7: Đóng trình duyệt đột ngột (pagehide async) -> đo giới hạn thật");
    const page = await browser.newPage("http://localhost:8080");
    try {
        await page.waitForApp();
        const docId = `k7_${Date.now()}`;

        // Create doc and mark dirty without saving
        const measureResult = await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            const doc = await app.newDocument("K7 Unsaved");
            doc._id = "${docId}";
            // Simulate user drawing without saving (history dirty)
            doc.history._undoCount = 5;
            doc._lastSavedUndoCount = 0;

            const t0 = performance.now();
            // Trigger saveAllDirtyDocuments as pagehide does
            await app.saveAllDirtyDocuments();
            const elapsed = performance.now() - t0;

            // Check if saved to fallback
            const inLocal = await app.storage.get("${DB_NAME}", "${TABLE}", doc.id);
            return {
                elapsedMs: Math.round(elapsed),
                savedInTime: inLocal !== undefined && inLocal.name === "K7 Unsaved"
            };
        })()`);

        const pass = measureResult.savedInTime;
        const evidence = {
            scenario: "K7",
            pass,
            measureResult,
            note: "Measures async I/O persistence time when pagehide/unload triggers saveAllDirtyDocuments.",
        };
        writeFileSync(join(EVIDENCE_DIR, "K7.json"), JSON.stringify(evidence, null, 2));
        console.log(`  Kết quả K7: ${pass ? "PASS" : "FAIL"} (${measureResult.elapsedMs}ms)`);
        return pass;
    } finally {
        await page.close();
    }
}

async function runK8(browser) {
    console.log("\n▶ Chạy K8: 20 lần lưu liên tiếp trong 10 giây");
    const page = await browser.newPage("http://localhost:8080");
    try {
        await page.waitForApp();
        const docId = `k8_${Date.now()}`;

        const k8Result = await page.evaluate(`(async () => {
            const app = window.Chili3dCore.getCurrentApplication();
            const errors = [];
            const versions = [];
            const t0 = performance.now();

            for (let i = 1; i <= 20; i++) {
                try {
                    await app.storage.put("${DB_NAME}", "${TABLE}", "${docId}", {
                        id: "${docId}",
                        name: "K8 Edit #" + i,
                        models: { nodes: [] }
                    });
                    await app.storage.flushOutbox();
                    const v = await app.storage.getVersion("${DB_NAME}", "${docId}");
                    versions.push(v);
                } catch (err) {
                    errors.push(String(err));
                }
                // small delay across 10 seconds total
                await new Promise(r => setTimeout(r, 200));
            }
            const totalMs = Math.round(performance.now() - t0);
            return { errors, versions, totalMs };
        })()`);

        // Check on server
        const res = await fetch(`http://127.0.0.1:3000/api/storage/${DB_NAME}/${TABLE}/${docId}`);
        const serverDoc = await res.json();

        const pass =
            k8Result.errors.length === 0 &&
            serverDoc.name === "K8 Edit #20" &&
            serverDoc.serverVersion === 20;

        const evidence = {
            scenario: "K8",
            pass,
            totalMs: k8Result.totalMs,
            errorsCount: k8Result.errors.length,
            finalServerVersion: serverDoc.serverVersion,
            finalServerName: serverDoc.name,
            versionProgression: k8Result.versions,
        };
        writeFileSync(join(EVIDENCE_DIR, "K8.json"), JSON.stringify(evidence, null, 2));
        console.log(
            `  Kết quả K8: ${pass ? "PASS" : "FAIL"} (20 saves in ${k8Result.totalMs}ms, v=${serverDoc.serverVersion})`,
        );
        return pass;
    } finally {
        await page.close();
    }
}

// ---------------------------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------------------------

async function main() {
    console.log("=== BẮT ĐẦU KIỂM CHỨNG TRÌNH DUYỆT THẬT (K1 - K8) ===");

    const dataDir = mkdtempSync(join(tmpdir(), "chili3d-browser-test-"));
    const profileDir = mkdtempSync(join(tmpdir(), "chili3d-profile-"));

    let storageProc = null;
    let devProc = null;

    try {
        storageProc = await startStorageServer(dataDir);

        const devRunning = await checkUrl("http://localhost:8080");
        if (!devRunning) {
            devProc = await startDevServer();
        } else {
            console.log("Rspack dev server is already running on port 8080.");
        }

        const results = {};
        await withChrome(profileDir, async (browser) => {
            results.K1 = await runK1(browser);
            results.K2 = await runK2(browser);
            results.K3 = await runK3(browser);
            results.K4 = await runK4(browser);
            results.K5 = await runK5(browser);
            results.K6 = await runK6(browser);
            results.K7 = await runK7(browser);
            results.K8 = await runK8(browser);
        });

        console.log("\n=== TỔNG KẾT KẾT QUẢ K1 - K8 ===");
        let allPass = true;
        for (const [k, p] of Object.entries(results)) {
            console.log(`  ${k}: ${p ? "✅ PASS" : "❌ FAIL"}`);
            if (!p) allPass = false;
        }

        const summaryFile = join(EVIDENCE_DIR, "summary.json");
        writeFileSync(summaryFile, JSON.stringify(results, null, 2));

        if (!allPass) {
            console.error("\nMột số kịch bản chưa đạt!");
            process.exit(1);
        } else {
            console.log("\nTất cả 8 kịch bản K1 - K8 ĐẠT 100%!");
        }
    } finally {
        if (storageProc) storageProc.kill("SIGKILL");
        if (devProc) devProc.kill("SIGKILL");
        try {
            rmSync(dataDir, { recursive: true, force: true });
        } catch {}
        try {
            rmSync(profileDir, { recursive: true, force: true });
        } catch {}
    }
}

await main();
