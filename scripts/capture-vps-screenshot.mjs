// Part of the Chili3d Project, under the AGPL-3.0 License.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const TARGET_URL = process.argv[2] || "http://136.66.95.155/";
const OUT_FILE = process.argv[3] || resolve(repoRoot, "screenshots/task19-before.png");

const CHROME_CANDIDATES = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
].filter(Boolean);

function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error("No Chrome found.");
}

class Cdp {
    #socket;
    #nextId = 1;
    #pending = new Map();

    static async attach(url) {
        const client = new Cdp();
        client.#socket = new WebSocket(url);
        await new Promise((resolve, reject) => {
            client.#socket.addEventListener("open", resolve, { once: true });
            client.#socket.addEventListener("error", reject, { once: true });
        });
        client.#socket.addEventListener("message", (event) => {
            const msg = JSON.parse(event.data.toString());
            if (msg.id !== undefined) {
                const entry = client.#pending.get(msg.id);
                client.#pending.delete(msg.id);
                if (entry) {
                    if (msg.error) entry.reject(new Error(msg.error.message));
                    else entry.resolve(msg.result);
                }
            }
        });
        return client;
    }

    send(method, params = {}) {
        const id = this.#nextId++;
        this.#socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    }

    close() {
        this.#socket?.close();
    }
}

async function run() {
    console.log(`📸 Taking screenshot of ${TARGET_URL} -> ${OUT_FILE}`);
    const chrome = findChrome();
    const port = 9334;
    const profile = join(tmpdir(), `chili3d-shot-${Date.now()}`);
    mkdirSync(profile, { recursive: true });

    const child = spawn(
        chrome,
        [
            "--headless=new",
            `--remote-debugging-port=${port}`,
            "--use-gl=swiftshader",
            "--enable-unsafe-swiftshader",
            "--no-first-run",
            "--no-default-browser-check",
            "--window-size=1600,1000",
            `--user-data-dir=${profile}`,
            "about:blank",
        ],
        { stdio: "ignore" },
    );

    for (let i = 0; i < 50; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
    }

    try {
        const newTabRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(TARGET_URL)}`, {
            method: "PUT",
        });
        const target = await newTabRes.json();
        const cdp = await Cdp.attach(target.webSocketDebuggerUrl);

        await cdp.send("Page.enable");
        await cdp.send("Runtime.enable");
        await cdp.send("Page.bringToFront");
        await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 1600,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false,
        });

        console.log("   Waiting for Home screen documents to render...");
        let found = false;
        for (let attempt = 0; attempt < 30; attempt++) {
            const check = await cdp.send("Runtime.evaluate", {
                expression: `(() => {
                    const titles = Array.from(document.querySelectorAll("span")).map(s => s.textContent || "");
                    const targetSpan = Array.from(document.querySelectorAll("span")).find(s => (s.textContent || "").includes("thành-công"));
                    if (targetSpan) {
                        const card = targetSpan.closest("div");
                        card.click();
                        return { found: true, text: targetSpan.textContent };
                    }
                    return { found: false, allSpans: titles.filter(t => t.length > 2).slice(0, 10) };
                })()`,
                returnByValue: true,
            });
            if (check.result.value?.found) {
                console.log("   Clicked project:", check.result.value.text);
                found = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 1000));
        }

        if (!found) {
            console.warn("   Could not find project on home screen within timeout");
        }

        // Wait for 3D Editor and Three.js canvas to render
        console.log("   Waiting for 3D viewport canvas...");
        for (let attempt = 0; attempt < 15; attempt++) {
            const hasCanvas = await cdp.send("Runtime.evaluate", {
                expression: `(() => {
                    const canvas = document.querySelector("canvas");
                    const app = globalThis.currentApplication;
                    const doc = app?.activeView?.document;
                    return {
                        hasCanvas: !!canvas,
                        hasDoc: !!doc,
                        docName: doc?.name,
                        nodesCount: doc?.models?.nodes?.length,
                    };
                })()`,
                returnByValue: true,
            });
            console.log("   Status:", hasCanvas.result.value);
            if (hasCanvas.result.value?.hasDoc) {
                break;
            }
            await new Promise((r) => setTimeout(r, 1500));
        }

        // Extra time for textures and materials to settle
        await new Promise((r) => setTimeout(r, 5000));

        // Take screenshot
        mkdirSync(dirname(OUT_FILE), { recursive: true });
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(OUT_FILE, Buffer.from(data, "base64"));
        console.log(`✅ Screenshot saved to ${OUT_FILE} (${Buffer.from(data, "base64").length} bytes)`);

        cdp.close();
    } finally {
        child.kill();
    }
}

run().catch((e) => {
    console.error("❌ Error capturing screenshot:", e);
    process.exit(1);
});
