// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, type IDocument, type IHistoryRecord } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
    approveTaskPlan,
    BATCH_B_TOOL_MATRIX,
    bindTaskPlanProposal,
    checkToolPermission,
    clearDesignRulesForTests,
    clearTaskProfile,
    confirmProposedPlan,
    getActiveTaskProfile,
    getGovernanceStatus,
    getPendingProposal,
    getTaskProfile,
    invalidatePendingProposals,
    invalidateTaskProfile,
    isTaskOwned,
    loadEffectiveDesignRules,
    recordTaskOwnedNodes,
    resetPlanApprovalForTests,
    resetSourceProtectionForTests,
    resetTaskProfileForTests,
    rulesFingerprintFor,
    saveAccountDesignRules,
    saveDocumentDesignRules,
    setPlanApprovalHandler,
    stripSelfApproval,
    undoActiveTask,
} from "../../src/governance";
import { refreshSourceProtection } from "../../src/governance/sourceProtection";
import { detectInterleaving, noteGovernedMutation } from "../../src/governance/undoTask";
import { buildTools } from "../../src/tools";
import { seedSessionRefForTests } from "../../src/tools/capabilityEngine";
import { createToolHost } from "../../src/tools/host";

function stubDocWithNodes(
    nodes: Array<{ id: string; name?: string; parent?: unknown }>,
    overrides: { id?: string } = {},
): IDocument {
    const doc = createMockDocument(overrides);
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
        resetPlanApprovalForTests();
        clearDesignRulesForTests();
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
        expect(halted.code).toBe("PLAN_INVALIDATED");
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

    test("mutation queries via capability metadata require modify rights on resolved source", () => {
        const doc = stubDocWithNodes([{ id: "wall-1", name: "Wall" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        seedSessionRefForTests(doc, "edge0", "wall-1");

        const blocked = checkToolPermission(
            "run_program",
            {
                ops: [{ method: "curve.reverse", id: "rev1", target: "edge0", args: {} }],
            },
            doc,
        );
        expect(blocked.decision.allowed).toBe(false);
        expect(blocked.decision.code).toBe("PERMISSION_DENIED");
        expect(blocked.decision.deniedNodeIds).toContain("wall-1");

        const trimBlocked = checkToolPermission(
            "run_program",
            {
                ops: [
                    {
                        method: "trimmedCurve.setTrim",
                        id: "trim1",
                        target: "edge0",
                        args: { u1: 0, u2: 1 },
                    },
                ],
            },
            doc,
        );
        expect(trimBlocked.decision.allowed).toBe(false);
        expect(trimBlocked.decision.deniedNodeIds).toContain("wall-1");

        approveTaskPlan({ allowedModifiedNodeIds: ["wall-1"] }, doc);
        const allowed = checkToolPermission(
            "run_program",
            {
                ops: [{ method: "curve.reverse", id: "rev2", target: "edge0", args: {} }],
            },
            doc,
        );
        expect(allowed.decision.allowed).toBe(true);
    });

    test("read-only queries with dots stay allowed without a plan", () => {
        const doc = stubDocWithNodes([{ id: "wall-1", name: "Wall" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        seedSessionRefForTests(doc, "edge0", "wall-1");

        const decision = checkToolPermission(
            "run_program",
            {
                ops: [{ method: "edge.length", id: "len1", target: "edge0", args: {} }],
            },
            doc,
        );
        expect(decision.decision.allowed).toBe(true);
    });

    test("invalidated plan and document change revoke isTaskOwned rights", () => {
        const docA = stubDocWithNodes([{ id: "src-a" }], { id: "doc-a" });
        resetSourceProtectionForTests(docA);
        refreshSourceProtection(docA);
        approveTaskPlan({ allowedModifiedNodeIds: ["src-a"] }, docA);
        recordTaskOwnedNodes(["owned-1"], docA);
        expect(isTaskOwned("owned-1", docA)).toBe(true);

        invalidateTaskProfile("test invalidate");
        expect(getActiveTaskProfile(docA)).toBeUndefined();
        expect(isTaskOwned("owned-1", docA)).toBe(false);

        const afterInvalidate = checkToolPermission("delete_node", { id: "src-a" }, docA);
        expect(afterInvalidate.decision.allowed).toBe(false);

        // Fresh plan on doc A, then switch active document — rights must not carry over.
        approveTaskPlan({ allowedModifiedNodeIds: ["src-a"] }, docA);
        recordTaskOwnedNodes(["owned-2"], docA);
        expect(isTaskOwned("owned-2", docA)).toBe(true);

        const docB = stubDocWithNodes([{ id: "src-b" }], { id: "doc-b" });
        resetSourceProtectionForTests(docB);
        refreshSourceProtection(docB);
        expect(getActiveTaskProfile(docB)).toBeUndefined();
        expect(isTaskOwned("owned-2", docB)).toBe(false);

        // Prior task-owned id appears on another document without an active matching plan → protected.
        const nodes: any[] = [
            { id: "src-b", name: "B", parent: { remove: rs.fn() } },
            { id: "owned-2", name: "Owned", parent: { remove: rs.fn() } },
        ];
        (docB.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
            typeof pred === "function" ? nodes.filter(pred) : [...nodes];
        (docB.modelManager as any).findNodesDeep = (docB.modelManager as any).findNodes;
        // Document switch already invalidated the prior plan — writes stay blocked.
        const blockedOwned = checkToolPermission("delete_node", { id: "owned-2" }, docB);
        expect(blockedOwned.decision.allowed).toBe(false);
        expect(blockedOwned.decision.code).toBe("PLAN_INVALIDATED");
        expect(isTaskOwned("owned-2", docB)).toBe(false);
    });

    test("user-approved single-object plan only unlocks that object", () => {
        const doc = stubDocWithNodes([
            { id: "wall-1", name: "Wall1" },
            { id: "wall-2", name: "Wall2" },
        ]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        // Trusted UI path: bind then confirm — not model self-approval.
        const bound = bindTaskPlanProposal(
            {
                goal: "edit one wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            doc,
        );
        confirmProposedPlan(bound, { document: doc });

        expect(checkToolPermission("transform_node", { id: "wall-1" }, doc).decision.allowed).toBe(true);
        expect(checkToolPermission("transform_node", { id: "wall-2" }, doc).decision.allowed).toBe(false);
        expect(checkToolPermission("delete_node", { id: "wall-1" }, doc).decision.allowed).toBe(false);
    });

    test("propose_task_plan grants rights only through trusted UI handler", async () => {
        const doc = stubDocWithNodes([{ id: "wall-1" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const tool = buildTools().find((t) => t.name === "propose_task_plan")!;
        setPlanApprovalHandler(undefined);
        const noUi = JSON.parse(
            (await tool.handler({
                goal: "cut",
                allowedConsumedNodeIds: ["wall-1"],
                approved: true,
            })) as string,
        );
        expect(noUi.approved).toBe(false);
        expect(getActiveTaskProfile(doc)).toBeUndefined();

        setPlanApprovalHandler(async (proposal) => {
            return { approved: true, profile: confirmProposedPlan(proposal, { document: doc }) };
        });
        const ok = JSON.parse(
            (await tool.handler({
                goal: "cut",
                allowedConsumedNodeIds: ["wall-1"],
                force: true,
            })) as string,
        );
        expect(ok.approved).toBe(true);
        expect(ok.allowedConsumedNodeIds).toEqual(["wall-1"]);
        expect(ok.documentId).toBe(doc.id);
        expect(checkToolPermission("delete_node", { id: "wall-1" }, doc).decision.allowed).toBe(false);
        expect(
            checkToolPermission(
                "run_program",
                {
                    ops: [
                        { method: "box", id: "c", args: { dx: 1, dy: 1, dz: 1 } },
                        { method: "booleanCut", args: { shape1: "wall-1", shape2: "c" } },
                    ],
                },
                doc,
            ).decision.allowed,
        ).toBe(true);
    });

    test("stale plan card cannot approve after document switch, source edit, cancel, or replace", () => {
        const docA = stubDocWithNodes([{ id: "wall-1" }], { id: "doc-a" });
        resetSourceProtectionForTests(docA);
        refreshSourceProtection(docA);

        const card1 = bindTaskPlanProposal(
            {
                goal: "edit wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            docA,
        );
        expect(getPendingProposal()?.proposalId).toBe(card1.proposalId);

        // Replace with a newer card — old Approve must fail.
        const card2 = bindTaskPlanProposal(
            {
                goal: "edit wall v2",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            docA,
        );
        expect(() => confirmProposedPlan(card1, { document: docA })).toThrow(/PROPOSAL_STALE/);
        expect(getActiveTaskProfile(docA)).toBeUndefined();

        // Cancel / invalidate pending — card2 also fails.
        invalidatePendingProposals("turn cancelled");
        expect(() => confirmProposedPlan(card2, { document: docA })).toThrow(/PROPOSAL_STALE/);

        // Fresh card, then user edits source (history mark drifts).
        const card3 = bindTaskPlanProposal(
            {
                goal: "edit wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            docA,
        );
        (docA.history as any).__push({
            name: "user edit",
            undo: rs.fn(),
            redo: rs.fn(),
            dispose: rs.fn(),
        });
        expect(() => confirmProposedPlan(card3, { document: docA })).toThrow(
            /PROPOSAL_STALE|Document changed/,
        );
        expect(getActiveTaskProfile(docA)).toBeUndefined();

        // Fresh card on doc A, then switch open document — must not approve against doc B.
        const card4 = bindTaskPlanProposal(
            {
                goal: "edit wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            docA,
        );
        const docB = stubDocWithNodes([{ id: "other" }], { id: "doc-b" });
        expect(() => confirmProposedPlan(card4, { document: docB })).toThrow(/DOCUMENT_MISMATCH/);
        expect(getActiveTaskProfile(docB)).toBeUndefined();
        expect(getActiveTaskProfile(docA)).toBeUndefined();
    });

    test("approved plan then interleaved edit blocks subsequent source writes", () => {
        const doc = stubDocWithNodes([{ id: "wall-1" }]);
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);

        const bound = bindTaskPlanProposal(
            {
                goal: "modify wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            doc,
        );
        confirmProposedPlan(bound, { document: doc });
        expect(checkToolPermission("transform_node", { id: "wall-1" }, doc).decision.allowed).toBe(true);

        // User interleaved edit before / between agent writes.
        (doc.history as any).__push({
            name: "user edit",
            undo: rs.fn(),
            redo: rs.fn(),
            dispose: rs.fn(),
        });
        expect(detectInterleaving(doc)).toBe(true);
        expect(getActiveTaskProfile(doc)).toBeUndefined();

        const blocked = checkToolPermission("transform_node", { id: "wall-1" }, doc);
        expect(blocked.decision.allowed).toBe(false);
        expect(blocked.decision.code).toBe("PLAN_INVALIDATED");
        expect(blocked.decision.message).toMatch(/propose_task_plan|Re-read/i);
    });

    test("bridge still blocks propose_task_plan while ChatPanel path binds documentId", async () => {
        const host = createToolHost();
        const reply = await host.call("propose_task_plan", { allowedModifiedNodeIds: ["n1"] });
        expect(reply.ok).toBe(false);
        expect(reply.content).toContain("not available over the bridge");

        const doc = stubDocWithNodes([{ id: "wall-1" }], { id: "chat-doc" });
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        setPlanApprovalHandler(async (proposal) => {
            expect(proposal.documentId).toBe("chat-doc");
            expect(proposal.proposalId).toBeTruthy();
            expect(proposal.generation).toBeGreaterThan(0);
            return { approved: true, profile: confirmProposedPlan(proposal, { document: doc }) };
        });
        const tool = buildTools().find((t) => t.name === "propose_task_plan")!;
        const result = JSON.parse((await tool.handler({ allowedModifiedNodeIds: ["wall-1"] })) as string);
        expect(result.approved).toBe(true);
        expect(result.documentId).toBe("chat-doc");
    });

    test("rules fingerprint reflects full guidance and protected ids, not length or Date.now alone", () => {
        const docId = "rules-fp-doc";
        const fixedNow = 1_700_000_000_000;
        const nowSpy = rs.spyOn(Date, "now").mockReturnValue(fixedNow);

        saveDocumentDesignRules(docId, { guidanceMarkdown: "Keep AAA walls" });
        const fp1 = rulesFingerprintFor(docId);

        // Same length, same timestamp — content change must still change the fingerprint.
        saveDocumentDesignRules(docId, { guidanceMarkdown: "Keep BBB walls" });
        const fp2 = rulesFingerprintFor(docId);
        expect(fp1).not.toBe(fp2);
        expect(loadEffectiveDesignRules(docId).rules.updatedAt).toBe(fixedNow);
        expect(loadEffectiveDesignRules(docId).rules.guidanceMarkdown?.length).toBe("Keep AAA walls".length);

        // Consecutive saves at the same millisecond still bump contentRevision / fingerprint.
        saveDocumentDesignRules(docId, { guidanceMarkdown: "Keep BBB walls", protectedNodeIds: ["p1"] });
        const fp3 = rulesFingerprintFor(docId);
        expect(fp3).not.toBe(fp2);

        // Adding another protected id alone invalidates the prior fingerprint.
        saveDocumentDesignRules(docId, { protectedNodeIds: ["p1", "p2"] });
        const fp4 = rulesFingerprintFor(docId);
        expect(fp4).not.toBe(fp3);

        nowSpy.mockRestore();
    });

    test("rules change while plan card is pending makes Approve stale", () => {
        const doc = stubDocWithNodes([{ id: "wall-1" }], { id: "rules-pending-doc" });
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        saveDocumentDesignRules(doc.id, { guidanceMarkdown: "Protect north wall" });

        const card = bindTaskPlanProposal(
            {
                goal: "edit wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            doc,
        );

        // Same-length guidance rewrite while the card is open.
        saveDocumentDesignRules(doc.id, { guidanceMarkdown: "Protect south wall" });
        expect(() => confirmProposedPlan(card, { document: doc })).toThrow(/PROPOSAL_STALE|rules changed/i);
        expect(getActiveTaskProfile(doc)).toBeUndefined();

        const card2 = bindTaskPlanProposal(
            {
                goal: "edit wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            doc,
        );
        saveDocumentDesignRules(doc.id, {
            guidanceMarkdown: "Protect south wall",
            protectedNodeIds: ["wall-1"],
        });
        expect(() => confirmProposedPlan(card2, { document: doc })).toThrow(/PROPOSAL_STALE|rules changed/i);
        expect(getActiveTaskProfile(doc)).toBeUndefined();
    });

    test("rules change after approval revokes write rights and requires a new plan", () => {
        const doc = stubDocWithNodes([{ id: "wall-1" }], { id: "rules-after-doc" });
        resetSourceProtectionForTests(doc);
        refreshSourceProtection(doc);
        saveDocumentDesignRules(doc.id, { guidanceMarkdown: "Keep AAA form" });

        const bound = bindTaskPlanProposal(
            {
                goal: "modify wall",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            doc,
        );
        const profile = confirmProposedPlan(bound, { document: doc });
        expect(profile.rulesFingerprint).toBe(rulesFingerprintFor(doc.id));
        expect(checkToolPermission("transform_node", { id: "wall-1" }, doc).decision.allowed).toBe(true);

        // Other-tab style update: same-length Markdown rewrite re-read before the next write.
        saveDocumentDesignRules(doc.id, { guidanceMarkdown: "Keep BBB form" });
        expect(getActiveTaskProfile(doc)).toBeUndefined();
        expect(getTaskProfile()?.status).toBe("invalidated");
        expect(getTaskProfile()?.haltReason).toMatch(/Design rules changed|propose_task_plan/i);

        const blocked = checkToolPermission("transform_node", { id: "wall-1" }, doc);
        expect(blocked.decision.allowed).toBe(false);
        expect(blocked.decision.code).toBe("PLAN_INVALIDATED");

        // Fresh plan after re-evaluation restores rights under the new fingerprint.
        const rebound = bindTaskPlanProposal(
            {
                goal: "modify wall again",
                allowedModifiedNodeIds: ["wall-1"],
                allowedDeletedNodeIds: [],
                allowedConsumedNodeIds: [],
                allowedTreeNodeIds: [],
            },
            doc,
        );
        confirmProposedPlan(rebound, { document: doc });
        expect(checkToolPermission("transform_node", { id: "wall-1" }, doc).decision.allowed).toBe(true);

        // Adding a protected id alone also revokes.
        saveDocumentDesignRules(doc.id, { protectedNodeIds: ["extra-protect"] });
        const blockedAgain = checkToolPermission("transform_node", { id: "wall-1" }, doc);
        expect(blockedAgain.decision.allowed).toBe(false);
        expect(blockedAgain.decision.code).toBe("PLAN_INVALIDATED");
    });
});
