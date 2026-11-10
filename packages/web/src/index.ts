// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AppBuilder } from "@chili3d/builder";
import { type IApplication, type IDocument, Logger, PubSub, pendingWork, quietFrames } from "@chili3d/core";
import { installApplicationErrorCapture } from "./errorCapture";
import { Loading } from "./loading";
import { parseStartupParams } from "./startupParams";

installApplicationErrorCapture();

const loading = new Loading();
document.body.appendChild(loading);

/**
 * The handle a scripted run drives the app through (`scripts/scenario.mjs`). Only the dev
 * and preview builds have it: the runner asks the page whether anything is still in
 * flight instead of sleeping on a guess, and there is no reason for a production build to
 * carry the door.
 */
function exposeTestSurface(app?: IApplication): void {
    if (__IS_PRODUCTION__) return;
    Object.defineProperty(globalThis, "__chiliTest", {
        value: {
            pendingWork,
            quietFrames,
            settled: () => pendingWork.whenIdle().then(() => quietFrames()),
            app,
            loadDocument: async (data: any) => (app ? app.loadDocument(data) : undefined),
            // The same door a ribbon button knocks on. A scripted run names commands
            // rather than hunting for the button, so re-arranging the ribbon cannot break
            // a scenario that was not about the ribbon.
            dispatch: (commandName: string) => PubSub.default.pub("executeCommand", commandName as never),
            getAiTools: async () => {
                const ai = await import("@chili3d/ai");
                return {
                    bomTools: ai.buildBomTools(),
                    commandTools: ai.buildCommandTools(),
                };
            },
            getComputeBomReport: async () => {
                const appMod = await import("@chili3d/app");
                return appMod.computeBomReport;
            },
            getPerformanceProfiler: async () => {
                const { PerformanceProfiler } = await import("@chili3d/core");
                return PerformanceProfiler.instance;
            },
            getDiagnosticsApi: async () => {
                const ai = await import("@chili3d/ai");
                return {
                    exportRuntimeErrorReports: ai.exportRuntimeErrorReports,
                    listRuntimeErrorReports: ai.listRuntimeErrorReports,
                    exportPerformanceReport: ai.exportPerformanceReport,
                };
            },
            getSessionMemoryApi: async () => {
                const ai = await import("@chili3d/ai");
                return {
                    getSessionMemory: ai.getSessionMemory,
                    updateSessionMemory: ai.updateSessionMemory,
                    recordRuntimeError: ai.recordRuntimeError,
                    listRuntimeErrorReports: ai.listRuntimeErrorReports,
                    clearSessionMemory: ai.clearSessionMemory,
                    clearRuntimeErrorReports: ai.clearRuntimeErrorReports,
                };
            },
            createTestModel: async (doc: IDocument) => {
                const { BoxNode } = await import("@chili3d/app");
                const { FolderNode, Plane, XYZ } = await import("@chili3d/core");
                const plane = new Plane({ origin: XYZ.zero, normal: XYZ.unitZ, xvec: XYZ.unitX });
                const box1 = new BoxNode({ document: doc, plane, dx: 100, dy: 50, dz: 20 });
                box1.name = "Box 100x50x20";
                const box2 = new BoxNode({ document: doc, plane, dx: 200, dy: 50, dz: 50 });
                box2.name = "Box 200x50x50";
                const box3 = new BoxNode({ document: doc, plane, dx: 500, dy: 300, dz: 18 });
                box3.name = "Box 500x300x18";
                const folder = new FolderNode({ document: doc, name: "TestFolder" });
                doc.modelManager.addNode(box1);
                doc.modelManager.addNode(box2);
                doc.modelManager.addNode(box3);
                doc.modelManager.addNode(folder);
                return { box1, box2, box3, folder };
            },
            createExtendedTestModel: async (doc: IDocument) => {
                const { BoxNode } = await import("@chili3d/app");
                const { FolderNode, Material, Plane, XYZ } = await import("@chili3d/core");
                const plane = new Plane({ origin: XYZ.zero, normal: XYZ.unitZ, xvec: XYZ.unitX });

                // 1. Two boxes with SAME size (count=2): 100x50x20
                const boxSame1 = new BoxNode({ document: doc, plane, dx: 100, dy: 50, dz: 20 });
                boxSame1.name = "Box 100x50x20 A";
                const boxSame2 = new BoxNode({ document: doc, plane, dx: 100, dy: 50, dz: 20 });
                boxSame2.name = "Box 100x50x20 B";

                // 2. One box with different size: 500x300x18
                const boxDiff = new BoxNode({ document: doc, plane, dx: 500, dy: 300, dz: 18 });
                boxDiff.name = "Box 500x300x18";

                // 3. Two materials with different color on same size (200x60x30)
                const matWood = new Material({
                    document: doc,
                    id: "mat-wood",
                    name: "Gỗ sồi",
                    color: 0x8b5a2b,
                });
                const matMetal = new Material({
                    document: doc,
                    id: "mat-metal",
                    name: "Thép hộp",
                    color: 0x4682b4,
                });
                doc.modelManager.materials.push(matWood);
                doc.modelManager.materials.push(matMetal);

                const boxWood = new BoxNode({ document: doc, plane, dx: 200, dy: 60, dz: 30 });
                boxWood.name = "Box 200x60x30 Wood";
                (boxWood as any).materialId = "mat-wood";

                const boxMetal = new BoxNode({ document: doc, plane, dx: 200, dy: 60, dz: 30 });
                boxMetal.name = "Box 200x60x30 Metal";
                (boxMetal as any).materialId = "mat-metal";

                // 4. One hidden box: 300x100x25, visible = false
                const boxHidden = new BoxNode({ document: doc, plane, dx: 300, dy: 100, dz: 25 });
                boxHidden.name = "Box 300x100x25 Hidden";
                boxHidden.visible = false;

                // 5. Nested FolderNode: parentFolder -> childFolder -> boxInFolder, parentFolder hidden
                const parentFolder = new FolderNode({ document: doc, name: "ParentFolder" });
                const childFolder = new FolderNode({ document: doc, name: "ChildFolder" });
                const boxInFolder = new BoxNode({ document: doc, plane, dx: 400, dy: 200, dz: 15 });
                boxInFolder.name = "Box 400x200x15 InFolder";

                parentFolder.add(childFolder);
                childFolder.add(boxInFolder);
                parentFolder.visible = false;

                doc.modelManager.addNode(boxSame1);
                doc.modelManager.addNode(boxSame2);
                doc.modelManager.addNode(boxDiff);
                doc.modelManager.addNode(boxWood);
                doc.modelManager.addNode(boxMetal);
                doc.modelManager.addNode(boxHidden);
                doc.modelManager.addNode(parentFolder);

                return {
                    boxSame1,
                    boxSame2,
                    boxDiff,
                    boxWood,
                    boxMetal,
                    boxHidden,
                    parentFolder,
                    childFolder,
                    boxInFolder,
                };
            },
            /**
             * Đợt C1 surface for the reviewer: drive the evidence store on the live page
             * (register the prepared runners, declare criteria, run checks, read status).
             * Dev/preview only, like everything else here.
             */
            governance: async () => {
                const ai = await import("@chili3d/ai");
                return {
                    registerDefaultGeometryRunners: ai.registerDefaultGeometryRunners,
                    getGovernanceStatus: ai.getGovernanceStatus,
                    formatGovernanceStatusLine: ai.formatGovernanceStatusLine,
                    defineTaskCriteria: ai.defineTaskCriteria,
                    runTaskCriterionChecks: ai.runTaskCriterionChecks,
                    evaluateTaskCriteria: ai.evaluateTaskCriteria,
                    approveTaskPlan: ai.approveTaskPlan,
                    invalidateEvidenceForNodeIds: ai.invalidateEvidenceForNodeIds,
                };
            },
        },
        configurable: true,
    });
}

async function handleApplicaionBuilt(app: IApplication) {
    document.body.removeChild(loading);

    const { plugins, fileUrl } = parseStartupParams(window.location.search);
    // A `?url=`/`?plugin=` load is async work like a command's, so it is marked BEFORE the
    // test surface appears: a scripted run that starts on such a page would otherwise ask
    // a page whose document is still loading and be told it had settled.
    const released = pendingWork.begin();
    try {
        exposeTestSurface(app);
        for (const plugin of plugins) {
            Logger.info(`loading plugin from: ${plugin}`);
            await app.pluginManager.loadFromUrl(plugin);
        }
        if (fileUrl) {
            Logger.info(`loading file from: ${fileUrl}`);
            await app.loadFileFromUrl(fileUrl);
        }
    } finally {
        released();
    }
}

// prettier-ignore
new AppBuilder()
    .useCloudStorage("/api/storage")
    .useWasmOcc()
    .useParametric()
    .useThree()
    .useUI()
    .build()
    .then(handleApplicaionBuilt)
    .catch((err) => {
        alert(err.message);
    });
