// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { Home } from "../src/home/home";

rs.mock("../src/home/home.module.css", () => ({
    root: "home-root",
    actions: "home-actions",
    actionButton: "home-action-btn",
    actionButtonIcon: "home-action-icon",
    actionButtonName: "home-action-name",
    container: "home-container",
    content: "home-content",
    settings: "home-settings",
    subContent: "home-sub-content",
    videoItem: "home-video-item",
    videoItemImg: "home-video-img",
    videoItemRight: "home-video-right",
    videoItemTitle: "home-video-title",
    videoItemDate: "home-video-date",
    recentItem: "home-recent-item",
    recentItemImg: "home-recent-img",
    recentItemRight: "home-recent-right",
    recentItemTitle: "home-recent-title",
    recentItemDate: "home-recent-date",
    deleteButton: "home-delete-btn",
    authButton: "home-auth-btn",
    userMenu: "home-user-menu",
    userName: "home-user-name",
    logoutBtn: "home-logout-btn",
}));

describe("Home — Multi-document switching (TASK-17)", () => {
    let mockApp: any;
    let home: Home;
    let pubCalls: Array<{ channel: string; data?: any }>;

    beforeEach(() => {
        pubCalls = [];
        rs.spyOn(PubSub.default, "pub").mockImplementation(((channel: any, ...args: any[]) => {
            pubCalls.push({ channel, data: args[0] });
            if (channel === "showPermanent" && typeof args[0] === "function") {
                args[0]();
            }
        }) as any);

        const docA: any = { id: "doc-A", name: "Dự án A" };
        const docB: any = { id: "doc-B", name: "Dự án B" };

        const viewA: any = {
            document: docA,
            width: 100,
            height: 100,
            resize: rs.fn(),
            update: rs.fn(),
            cameraController: {
                fitContent: rs.fn(),
            },
        };

        const viewB: any = {
            document: docB,
            width: 100,
            height: 100,
            resize: rs.fn(),
            update: rs.fn(),
            cameraController: {
                fitContent: rs.fn(),
            },
        };

        docA.application = { activeView: viewA };
        docB.application = { activeView: viewB };

        mockApp = {
            documents: new Set([docA, docB]),
            views: [viewA, viewB],
            activeView: viewB, // currently at Doc B
            storage: {
                get: rs.fn().mockResolvedValue([]),
                delete: rs.fn().mockResolvedValue(undefined),
            },
            openDocument: rs.fn().mockImplementation(async (id: string) => {
                const doc = { id, name: `Doc ${id}`, application: {} as any };
                const view = {
                    document: doc,
                    width: 100,
                    height: 100,
                    resize: rs.fn(),
                    update: rs.fn(),
                    cameraController: { fitContent: rs.fn() },
                };
                doc.application.activeView = view;
                mockApp.documents.add(doc);
                mockApp.views.push(view);
                mockApp.activeView = view;
                return doc;
            }),
        };

        home = new Home(mockApp);
    });

    afterEach(() => {
        rs.restoreAllMocks();
    });

    test("handleDocumentClick switches activeView to target document when already open", () => {
        const item = { id: "doc-A", name: "Dự án A", date: Date.now() };
        (home as any).handleDocumentClick(item);

        // Must switch activeView to viewA, NOT stay on viewB!
        expect(mockApp.activeView.document.id).toBe("doc-A");
        expect(pubCalls.some((c) => c.channel === "displayHome" && c.data === false)).toBe(true);
    });

    test("handleDocumentClick opens new document and switches activeView when not yet open", async () => {
        const item = { id: "doc-C", name: "Dự án C", date: Date.now() };
        (home as any).handleDocumentClick(item);

        expect(pubCalls.some((c) => c.channel === "showPermanent")).toBe(true);
        expect(mockApp.openDocument).toHaveBeenCalledWith("doc-C");
        expect(mockApp.activeView.document.id).toBe("doc-C");
    });
});
