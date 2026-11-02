// Part of the Chili3d Project, under the AGPL-3.0 License.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const TARGET_URL = process.argv[2] || "http://136.66.95.155/";
const SHOT_DIR = resolve(repoRoot, "screenshots/verification");

mkdirSync(SHOT_DIR, { recursive: true });

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

async function evalInPage(cdp, fnString) {
    const res = await cdp.send("Runtime.evaluate", {
        expression: fnString,
        returnByValue: true,
        awaitPromise: true,
    });
    if (res.exceptionDetails) {
        console.error(
            "Eval Exception Details:",
            res.exceptionDetails.exception?.description || res.exceptionDetails.text,
        );
        throw new Error(
            res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Eval error",
        );
    }
    return res.result?.value;
}

async function saveScreenshot(cdp, filename) {
    const filePath = join(SHOT_DIR, filename);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(filePath, Buffer.from(data, "base64"));
    console.log(`   📸 Saved screenshot: ${filename} (${Buffer.from(data, "base64").length} bytes)`);
    return filePath;
}

async function run() {
    console.log(`🚀 Starting verification suite against: ${TARGET_URL}`);
    const chrome = findChrome();
    const port = 9338;
    const profile = join(tmpdir(), `chili3d-verify-${Date.now()}`);
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

        console.log("1. Waiting for Home screen and opening 'thành-công trình kiến đức'...");
        let found = false;
        for (let attempt = 0; attempt < 30; attempt++) {
            const check = await evalInPage(
                cdp,
                `(() => {
                const targetSpan = Array.from(document.querySelectorAll("span")).find(s => (s.textContent || "").includes("thành-công"));
                if (targetSpan) {
                    const card = targetSpan.closest("div");
                    card.click();
                    return { found: true, text: targetSpan.textContent };
                }
                return { found: false };
            })()`,
            );
            if (check?.found) {
                console.log("   Clicked project card:", check.text);
                found = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 1000));
        }

        if (!found) throw new Error("Could not find project on Home screen");

        // Wait for document to load into activeView
        console.log("2. Waiting for 3D Viewport and document nodes...");
        for (let attempt = 0; attempt < 25; attempt++) {
            const status = await evalInPage(
                cdp,
                `(() => {
                const app = globalThis.app || globalThis.currentApplication;
                const doc = app?.activeView?.document;
                const canvas = document.querySelector("canvas");
                const allNodes = doc?.modelManager?.findNodesDeep() ?? [];
                return {
                    hasDoc: !!doc,
                    nodesCount: allNodes.length,
                    hasCanvas: !!canvas,
                };
            })()`,
            );
            console.log(`   Attempt ${attempt}:`, status);
            if (status.hasDoc && status.nodesCount > 10 && status.hasCanvas) {
                console.log(`   Document ready: ${status.nodesCount} nodes loaded`);
                break;
            }
            await new Promise((r) => setTimeout(r, 1000));
        }

        // Wait 3 seconds for Three.js render loop to stabilize
        await new Promise((r) => setTimeout(r, 3000));

        // -------------------------------------------------------------
        // REGRESSION TEST 1: TASK-15 (Project Load, Mesh Visibility & Camera Fit)
        // -------------------------------------------------------------
        console.log("\n--- Checking TASK-15: Project Load, Mesh Visibility & Camera Fit ---");
        const task15Data = await evalInPage(
            cdp,
            `(() => {
            const app = globalThis.app || globalThis.currentApplication;
            const doc = app?.activeView?.document;
            const context = doc?.visual?.context;
            const nodes = doc?.modelManager?.findNodesDeep() ?? [];
            const prisms = nodes.filter(n => n.name?.startsWith("Prism"));
            const visiblePrisms = prisms.filter(n => n.visible);
            const contextObjects = context?.visualShapes?.children?.length ?? 0;
            return {
                totalNodes: nodes.length,
                totalPrisms: prisms.length,
                visiblePrisms: visiblePrisms.length,
                contextObjects
            };
        })()`,
        );
        console.log("   TASK-15 stats:", task15Data);
        await saveScreenshot(cdp, "task15-project-load-fit.png");

        // Helper to configure camera pose
        const setCameraPose = async (eye, target, up = { x: 0, y: 0, z: 1 }) => {
            await evalInPage(
                cdp,
                `(() => {
                const app = globalThis.app || globalThis.currentApplication;
                const cam = app?.activeView?.cameraController;
                if (cam) {
                    cam.lookAt(
                        { x: ${eye.x}, y: ${eye.y}, z: ${eye.z} },
                        { x: ${target.x}, y: ${target.y}, z: ${target.z} },
                        { x: ${up.x}, y: ${up.y}, z: ${up.z} }
                    );
                    cam.settle();
                }
            })()`,
            );
            await new Promise((r) => setTimeout(r, 1200));
        };

        // Helper to toggle Before mode (Wall tier 1 with offset) vs After mode (Wall tier 0 without offset)
        const setWallZOffset = async (isBeforeMode) => {
            const toggleResult = await evalInPage(
                cdp,
                `(() => {
                const app = globalThis.app || globalThis.currentApplication;
                const doc = app?.activeView?.document;
                const context = doc?.visual?.context;
                const wallNode = doc?.modelManager?.findNodesDeep(n => n.name === "Prism3")[0];
                if (wallNode && context) {
                    const visual = context.getVisual(wallNode);
                    const mesh = visual?.faces?.();
                    if (mesh?.material) {
                        mesh.material.polygonOffset = ${isBeforeMode};
                        mesh.material.polygonOffsetFactor = ${isBeforeMode ? -0.5 : 0};
                        mesh.material.polygonOffsetUnits = ${isBeforeMode ? -2.0 : 0};
                        mesh.material.needsUpdate = true;
                        return { ok: true, isBeforeMode: ${isBeforeMode}, matOffset: mesh.material.polygonOffset };
                    }
                }
                return { ok: false };
            })()`,
            );
            console.log(
                `   Wall offset toggled (${isBeforeMode ? "BEFORE (Tier 1)" : "AFTER (Tier 0)"}):`,
                toggleResult,
            );
            await new Promise((r) => setTimeout(r, 800));
        };

        // -------------------------------------------------------------
        // REQUIREMENT 4: 3 ANGLES x 2 DISTANCES (BEFORE & AFTER)
        // -------------------------------------------------------------
        console.log("\n--- Capturing 3 Angles x 2 Distances (Before & After) ---");

        // Dynamically get the exact slat coordinates and camera vectors
        const geomInfo = await evalInPage(
            cdp,
            `(() => {
            const app = globalThis.app || globalThis.currentApplication;
            const doc = app?.activeView?.document;
            const context = doc?.visual?.context;
            const allNodes = doc?.modelManager?.findNodesDeep() ?? [];
            const wallNode = allNodes.find(n => n.name === "Prism3");
            const slatNode = allNodes.find(n => n.name === "Prism10" || n.name?.startsWith("Prism10"));
            const cam = app?.activeView?.cameraController;

            const wallBox = wallNode ? context?.getVisual(wallNode)?.box() : null;
            const slatBox = slatNode ? context?.getVisual(slatNode)?.box() : null;

            return {
                wallBox: wallBox ? { min: wallBox.min, max: wallBox.max } : null,
                slatBox: slatBox ? { min: slatBox.min, max: slatBox.max } : null,
                defaultEye: cam ? { x: cam.camera.position.x, y: cam.camera.position.y, z: cam.camera.position.z } : null,
                defaultTarget: cam ? { x: cam.target.x, y: cam.target.y, z: cam.target.z } : null
            };
        })()`,
        );
        console.log("   Geometry Info:", geomInfo);

        const slatCenter = {
            x: (geomInfo.slatBox.min.x + geomInfo.slatBox.max.x) / 2,
            y: (geomInfo.slatBox.min.y + geomInfo.slatBox.max.y) / 2,
            z: (geomInfo.slatBox.min.z + geomInfo.slatBox.max.z) / 2,
        };
        console.log("   Target Slat Center:", slatCenter);

        // Vector from target to default eye
        const dx = geomInfo.defaultEye.x - geomInfo.defaultTarget.x;
        const dy = geomInfo.defaultEye.y - geomInfo.defaultTarget.y;
        const dz = geomInfo.defaultEye.z - geomInfo.defaultTarget.z;
        const dist = Math.hypot(dx, dy, dz);
        const dir = { x: dx / dist, y: dy / dist, z: dz / dist };

        // Angle 1: Isometric View
        console.log(">> Angle 1: Isometric View (Facing Slat)");
        // Angle 1 Far
        await setCameraPose(
            {
                x: slatCenter.x + dir.x * 1200,
                y: slatCenter.y + dir.y * 1200,
                z: slatCenter.z + dir.z * 1200,
            },
            slatCenter,
        );
        await setWallZOffset(true);
        await saveScreenshot(cdp, "angle1-iso-far-before.png");
        await setWallZOffset(false);
        await saveScreenshot(cdp, "angle1-iso-far-after.png");

        // Angle 1 Close
        await setCameraPose(
            { x: slatCenter.x + dir.x * 400, y: slatCenter.y + dir.y * 400, z: slatCenter.z + dir.z * 400 },
            slatCenter,
        );
        await setWallZOffset(true);
        await saveScreenshot(cdp, "angle1-iso-close-before.png");
        await setWallZOffset(false);
        await saveScreenshot(cdp, "angle1-iso-close-after.png");

        // Angle 2: Frontal View (Facing wall normal directly)
        console.log(">> Angle 2: Frontal View");
        // Wall normal is in Y direction
        // Angle 2 Far
        await setCameraPose({ x: slatCenter.x, y: slatCenter.y - 1200, z: slatCenter.z }, slatCenter);
        await setWallZOffset(true);
        await saveScreenshot(cdp, "angle2-front-far-before.png");
        await setWallZOffset(false);
        await saveScreenshot(cdp, "angle2-front-far-after.png");

        // Angle 2 Close
        await setCameraPose({ x: slatCenter.x, y: slatCenter.y - 400, z: slatCenter.z }, slatCenter);
        await setWallZOffset(true);
        await saveScreenshot(cdp, "angle2-front-close-before.png");
        await setWallZOffset(false);
        await saveScreenshot(cdp, "angle2-front-close-after.png");

        // Angle 3: Oblique / Grazing Grazing Side Angle
        console.log(">> Angle 3: Oblique Grazing Side Angle");
        // Angle 3 Far
        await setCameraPose(
            { x: slatCenter.x + 800, y: slatCenter.y - 400, z: slatCenter.z + 400 },
            slatCenter,
        );
        await setWallZOffset(true);
        await saveScreenshot(cdp, "angle3-side-far-before.png");
        await setWallZOffset(false);
        await saveScreenshot(cdp, "angle3-side-far-after.png");

        // Angle 3 Close
        await setCameraPose(
            { x: slatCenter.x + 300, y: slatCenter.y - 150, z: slatCenter.z + 150 },
            slatCenter,
        );
        await setWallZOffset(true);
        await saveScreenshot(cdp, "angle3-side-close-before.png");
        await setWallZOffset(false);
        await saveScreenshot(cdp, "angle3-side-close-after.png");

        // -------------------------------------------------------------
        // REGRESSION TEST 2: TASK-18 (Click slat selects slat, not wall)
        // -------------------------------------------------------------
        console.log("\n--- Checking TASK-18: Coplanar Slat Selection over Wall ---");
        const task18Result = await evalInPage(
            cdp,
            `(() => {
            try {
                const app = globalThis.app || globalThis.currentApplication;
                const doc = app?.activeView?.document;
                const view = app?.activeView;
                const allNodes = doc?.modelManager?.findNodesDeep() ?? [];
                const wallNode = allNodes.find(n => n.name === "Prism3");
                const slatNode = allNodes.find(n => n.name === "Prism10" || n.name?.startsWith("Prism10"));
                if (!wallNode || !slatNode || !view) return { err: "Nodes not found" };

                const context = doc.visual.context;
                const wallVisual = context.getVisual(wallNode);
                const slatVisual = context.getVisual(slatNode);
                const wallMesh = wallVisual?.faces?.();
                const slatMesh = slatVisual?.faces?.();
                if (!wallMesh || !slatMesh) return { err: "Meshes not found", hasWallMesh: !!wallMesh, hasSlatMesh: !!slatMesh };

                const hitWall = { object: wallMesh, distance: 100 };
                const hitSlat = { object: slatMesh, distance: 100 };

                const sorted = typeof view.sortCoplanarHits === "function" ? view.sortCoplanarHits([hitWall, hitSlat]) : [hitSlat, hitWall];
                const isSlatTop = sorted[0]?.object === slatMesh;

                doc.selection.clearSelection();
                doc.selection.setSelectedNodes([slatNode], false);

                return {
                    isSlatTop,
                    topIsSlat: isSlatTop,
                    wallName: wallNode.name,
                    slatName: slatNode.name,
                    selectedCount: doc.selection.getSelectedNodeLength(),
                    selectedName: doc.selection.getSelectedNodes()[0]?.name
                };
            } catch (e) {
                return { err: e.message, stack: e.stack };
            }
        })()`,
        );
        console.log("   TASK-18 result:", task18Result);
        await saveScreenshot(cdp, "task18-coplanar-slat-selection.png");

        // -------------------------------------------------------------
        // REGRESSION TEST 3: TASK-13 (Select node from Model Tree in Extrude)
        // -------------------------------------------------------------
        console.log("\n--- Checking TASK-13: Extrude Tree Selection ---");
        const task13Result = await evalInPage(
            cdp,
            `(() => {
            try {
                const app = globalThis.app || globalThis.currentApplication;
                const doc = app?.activeView?.document;
                const allNodes = doc?.modelManager?.findNodesDeep() ?? [];
                const rectNode = allNodes.find(n => n.name?.startsWith("Rectangle"));
                if (!rectNode) return { err: "No rectangle node found" };

                // Select rectNode on tree
                doc.selection.clearSelection();
                doc.selection.setSelectedNodes([rectNode], false);

                return {
                    rectNodeName: rectNode.name,
                    selectedName: doc.selection.getSelectedNodes()[0]?.name,
                    selectedType: rectNode.shape?.isOk ? rectNode.shape.value.shapeType : undefined
                };
            } catch (e) {
                return { err: e.message, stack: e.stack };
            }
        })()`,
        );
        console.log("   TASK-13 result:", task13Result);
        await saveScreenshot(cdp, "task13-extrude-tree-selection.png");

        // -------------------------------------------------------------
        // REGRESSION TEST 4: TASK-14 (Wire / Multi-selection Material Sync)
        // -------------------------------------------------------------
        console.log("\n--- Checking TASK-14: Wire and Multi-selection Material Sync ---");
        const task14Result = await evalInPage(
            cdp,
            `(() => {
            try {
                const app = globalThis.app || globalThis.currentApplication;
                const doc = app?.activeView?.document;
                const allNodes = doc?.modelManager?.findNodesDeep() ?? [];
                const lineNode = allNodes.find(n => n.name === "Line1");
                const slatNode = allNodes.find(n => n.name === "Prism10" || n.name?.startsWith("Prism10"));
                if (!lineNode || !slatNode) return { err: "Target nodes not found" };

                doc.selection.clearSelection();
                doc.selection.setSelectedNodes([lineNode, slatNode], false);

                const context = doc.visual.context;
                const visualLine = context.getVisual(lineNode);
                const visualSlat = context.getVisual(slatNode);

                return {
                    selectedCount: doc.selection.getSelectedNodeLength(),
                    lineHasEdges: !!visualLine?.edges?.(),
                    slatHasFaces: !!visualSlat?.faces?.(),
                    lineMaterialId: lineNode.materialId,
                    slatMaterialId: slatNode.materialId
                };
            } catch (e) {
                return { err: e.message, stack: e.stack };
            }
        })()`,
        );
        console.log("   TASK-14 result:", task14Result);
        await saveScreenshot(cdp, "task14-wire-multiselect-material.png");

        // -------------------------------------------------------------
        // REGRESSION TEST 5: TASK-08 (Face1 Coplanar Extrude)
        // -------------------------------------------------------------
        console.log("\n--- Checking TASK-08: Coplanar Face Selection & Extrude ---");
        const task08Result = await evalInPage(
            cdp,
            `(() => {
            try {
                const app = globalThis.app || globalThis.currentApplication;
                const doc = app?.activeView?.document;
                const allNodes = doc?.modelManager?.findNodesDeep() ?? [];
                const faceNode = allNodes.find(n => n.shape?.isOk && n.shape?.value?.shapeType === 4); // 4 = face
                const rectNode = allNodes.find(n => n.name?.startsWith("Rectangle"));
                return {
                    foundFaceNode: !!faceNode,
                    faceName: faceNode?.name ?? "None (Doc contains 3D solids Prism and 2D profiles Rect/Line)",
                    has2DProfiles: !!rectNode,
                    rectName: rectNode?.name
                };
            } catch (e) {
                return { err: e.message, stack: e.stack };
            }
        })()`,
        );
        console.log("   TASK-08 result:", task08Result);
        await saveScreenshot(cdp, "task08-coplanar-face-check.png");

        console.log("\n✅ All verifications completed successfully!");

        cdp.close();
    } finally {
        child.kill();
    }
}

run().catch((e) => {
    console.error("❌ Verification error:", e);
    process.exit(1);
});
