// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, type IDocument, type IHistoryRecord } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
    approveTaskPlan,
    BATCH_B_TOOL_MATRIX,
    checkToolPermission,
    clearTaskProfile,
    getGovernanceStatus,
    loadEffectiveDesignRules,
    recordTaskOwnedNodes,
    resetSourceProtectionForTests,
    resetTaskProfileForTests,
    saveAccountDesignRules,
    stripSelfApproval,
    undoActiveTask,
} from "../../src/governance";
import { refreshSourceProtection } from "../../src/governance/sourceProtection";
import { detectInterleaving, noteGovernedMutation } from "../../src/governance/undoTask";
import { buildTools } from "../../src/tools";
import { createToolHost } from "../../src/tools/host";

function stubDocWithNodes(nodes: Array<{ id: string; name?: string; parent?: unknown }>): IDocument {
    const doc = createMockDocument();
    const list = nodes.map((n) => ({
        id: n.id,
        name: n.name ?? n.id,
        visible: true,
        parent: n.parent ?? {
            remove: rs.fn(),
        },
    }));
    (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? list.filter(pred) : [...list];
    (doc.modelManager as any).findNodesDeep = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? list.filter(pred) : [...list];
    (doc.visual as any).update = rs.fn();

    const undos: IHistoryRecord[] = [];
    (doc.history as any).undoTop = () => undos[undos.length - 1];
    (doc.history as any).undoCount = () => undos.length;
    (doc.history as any).undo = () => {
        undos.pop();
    };
    (doc.history as any).__push = (record: IHistoryRecord) => undos.push(record);

    const app = createMockApplication();
    (app as any).activeView = { document: doc };
    rs.stubGlobal("app", app);
    return doc;
}

describe("TASK-40 Batch B governance", () => {
    beforeEach(() => {
        resetTaskProfileForTests();
        clearTaskProfile();
    });

    afterEach(() => {
        resetTaskProfileForTests();
        rs.unstubAllGlobals();
    });

    test("tool matrix lists supported and gated write surfaces", () => {
        expect(BATCH_B_TOOL_MATRIX.some((row) => row.tool === "run_program" && row.support === "gated")).toBe(
            true,
        );
        expect(BATCH_B_TOOL_MATRIX.some((row) => row.tool === "delete_node" && row.support === "gated")).toBe(
            true,
        );
        expect(
            BATCH_B_TOOL_MATRIX.some((row) => row.tool === "get_document_state" && row.support === "read"),
        ).toBe(true);
    });

    test("stripSelfApproval removes model-invented grants", () => {
        const clean = stripSelfApproval({
            id: "n1",
            approved: true,
            force: true,
            nested: { bypass: true, keep: 1 },
        });
        expect(clean).toEqual({ id: "n1", nested: { keep: 1 } });
    });

    test("ChatPanel path (buildTools) blocks delete of protected source", async () => {
        const doc = stubDocWithNodes([{ id: "wall-1", name: "Wall" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const tool = buildTools().find((t) => t.name === "delete_node")!;
        const result = JSON.parse((await tool.handler({ id: "wall-1", approved: true })) as string);

        expect(result.code).toBe("PERMISSION_DENIED");
        expect(result.error).toContain("protected");
        expect(result.deniedNodeIds).toContain("wall-1");
    });

    test("bridge path (createToolHost) blocks delete of protected source", async () => {
        const doc = stubDocWithNodes([{ id: "wall-1", name: "Wall" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const host = createToolHost();
        const reply = await host.call("delete_node", { id: "wall-1", force: true });
        const result = JSON.parse(reply.content);

        expect(reply.ok).toBe(true);
        expect(result.code).toBe("PERMISSION_DENIED");
        expect(result.error).toContain("protected");
    });

    test("approved plan unlocks consume/delete of listed sources", async () => {
        const doc = stubDocWithNodes([{ id: "wall-1", name: "Wall" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        approveTaskPlan({
            allowedDeletedNodeIds: ["wall-1"],
            allowedConsumedNodeIds: ["wall-1"],
        });

        const decision = checkToolPermission("delete_node", { id: "wall-1" }, doc);
        expect(decision.decision.allowed).toBe(true);
    });

    test("batch create-then-reference allows consume of batch-created id without plan", () => {
        const doc = stubDocWithNodes([{ id: "wall-1", name: "Wall" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const decision = checkToolPermission(
            "run_program",
            {
                ops: [
                    { method: "box", id: "cutter", args: { dx: 10, dy: 10, dz: 10 } },
                    {
                        method: "booleanCut",
                        id: "result",
                        args: { shape1: "wall-1", shape2: "cutter" },
                    },
                ],
            },
            doc,
        );

        // wall-1 consume still denied without plan; cutter is batch-local.
        expect(decision.decision.allowed).toBe(false);
        expect(decision.decision.code).toBe("PERMISSION_DENIED");
        expect(decision.decision.deniedNodeIds).toContain("wall-1");
    });

    test("batch create-then-reference allows ops that only touch batch ids", () => {
        const doc = stubDocWithNodes([]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const decision = checkToolPermission(
            "run_program",
            {
                ops: [
                    { method: "box", id: "a", args: { dx: 10, dy: 10, dz: 10 } },
                    { method: "box", id: "b", args: { dx: 5, dy: 5, dz: 5 } },
                    { method: "booleanFuse", id: "c", args: { shape1: "a", shape2: "b" } },
                ],
            },
            doc,
        );
        expect(decision.decision.allowed).toBe(true);
    });

    test("unresolvable impact is blocked with specific code", () => {
        const doc = stubDocWithNodes([]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const decision = checkToolPermission(
            "run_program",
            {
                ops: [{ method: "booleanCut", args: { shape1: "missing-ref", shape2: "also-missing" } }],
            },
            doc,
        );
        expect(decision.decision.allowed).toBe(false);
        expect(decision.decision.code).toBe("INDETERMINATE_IMPACT_BLOCKED");
        expect(decision.decision.message).toContain("INDETERMINATE_IMPACT_BLOCKED");
    });

    test("indirect subtree delete is blocked for protected folder children", () => {
        const child = { id: "child-1", name: "Child", parent: {} };
        const folder = {
            id: "folder-1",
            name: "Folder",
            firstChild: child,
            add: () => {},
            parent: { remove: rs.fn() },
        };
        Object.setPrototypeOf(folder, FolderNode.prototype);
        child.parent = folder;

        const doc = stubDocWithNodes([folder as any, child]);
        // findNodes returns folder when looking up folder-1
        (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) => {
            const all = [folder, child];
            return typeof pred === "function" ? all.filter(pred) : all;
        };
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const decision = checkToolPermission("delete_node", { id: "folder-1" }, doc);
        expect(decision.decision.allowed).toBe(false);
        expect(decision.decision.deniedNodeIds?.length).toBeGreaterThan(0);
    });

    test("state change: foreign nodes absorbed into protection after snapshot", () => {
        const nodes: any[] = [{ id: "a", name: "A", parent: { remove: rs.fn() } }];
        const doc = stubDocWithNodes(nodes);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        nodes.push({ id: "user-added", name: "User", parent: { remove: rs.fn() } });
        (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
            typeof pred === "function" ? nodes.filter(pred) : [...nodes];
        (doc.modelManager as any).findNodesDeep = (doc.modelManager as any).findNodes;

        const decision = checkToolPermission("delete_node", { id: "user-added" }, doc);
        expect(decision.decision.allowed).toBe(false);
        expect(decision.decision.code).toBe("PERMISSION_DENIED");
    });

    test("task-owned nodes remain editable after create tracking", () => {
        const nodes: any[] = [{ id: "a", name: "A", parent: { remove: rs.fn() } }];
        const doc = stubDocWithNodes(nodes);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        recordTaskOwnedNodes(["agent-box"]);
        nodes.push({ id: "agent-box", name: "Box", parent: { remove: rs.fn() } });
        (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
            typeof pred === "function" ? nodes.filter(pred) : [...nodes];
        (doc.modelManager as any).findNodesDeep = (doc.modelManager as any).findNodes;

        const decision = checkToolPermission("delete_node", { id: "agent-box" }, doc);
        expect(decision.decision.allowed).toBe(true);
    });

    test("contiguous undo task succeeds; interleaved undo halts", () => {
        const doc = stubDocWithNodes([]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        approveTaskPlan({ goal: "test undo" });

        const r1 = { name: "AI program", undo: rs.fn(), redo: rs.fn(), dispose: rs.fn() };
        const r2 = { name: "AI program", undo: rs.fn(), redo: rs.fn(), dispose: rs.fn() };
        (doc.history as any).__push(r1);
        noteGovernedMutation(doc);
        (doc.history as any).__push(r2);
        noteGovernedMutation(doc);

        const ok = undoActiveTask(doc);
        expect(ok.allowed).toBe(true);
        expect(ok.undone).toBe(2);

        // Re-seed and interleave with a user record.
        approveTaskPlan({ goal: "test interleaved" });
        const t1 = { name: "AI program", undo: rs.fn(), redo: rs.fn(), dispose: rs.fn() };
        const user = { name: "user edit", undo: rs.fn(), redo: rs.fn(), dispose: rs.fn() };
        (doc.history as any).__push(t1);
        noteGovernedMutation(doc);
        (doc.history as any).__push(user);
        expect(detectInterleaving(doc)).toBe(true);
        const halted = undoActiveTask(doc);
        expect(halted.allowed).toBe(false);
        expect(halted.code).toBe("UNDO_TASK_HALTED");
    });

    test("rules store uses ObjectStorage with default-safe missing link", () => {
        const { rules, missingLink, scope } = loadEffectiveDesignRules("missing-doc-id");
        expect(missingLink).toBe(true);
        expect(scope).toBe("default_safe");
        expect(rules.sanitizationIsNotInjectionProof).toBe(true);

        saveAccountDesignRules({ guidanceMarkdown: "<script>x</script>Keep walls" });
        const loaded = loadEffectiveDesignRules("missing-doc-id");
        expect(loaded.rules.guidanceMarkdown).toContain("Keep walls");
        expect(loaded.rules.guidanceMarkdown).not.toContain("script");
    });

    test("governance status does not claim Batch C tolerances", () => {
        const status = getGovernanceStatus();
        expect(status.batch).toBe("B");
        expect(status.criteriaVerification).toBe("deferred");
        expect(status.toleranceTable).toBe("not_applied");
        expect(status.sourceProtection).toBe("active");
        expect(status.permissionGate).toBe("active");
    });
});
