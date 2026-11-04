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
function exposeTestSurface(): void {
    if (__IS_PRODUCTION__) return;
    Object.defineProperty(globalThis, "__chiliTest", {
        value: {
            pendingWork,
            quietFrames,
            settled: () => pendingWork.whenIdle().then(() => quietFrames()),
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
        exposeTestSurface();
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
