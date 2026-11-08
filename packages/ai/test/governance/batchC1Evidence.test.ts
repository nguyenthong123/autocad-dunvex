// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import type { CriterionRunner, CriterionSpec } from "../../src/governance";
import {
    approveTaskPlan,
    clearDesignRulesForTests,
    clearTaskProfile,
    defineTaskCriteria,
    evaluateTaskCriteria,
    getGovernanceStatus,
    getLatestEvidence,
    invalidateEvidenceForNodeIds,
    invalidateTaskProfile,
    onTaskEvidenceChanged,
    registerCriterionRunner,
    resetPlanApprovalForTests,
    resetTaskProfileForTests,
    resetVerificationForTests,
    rulesFingerprintFor,
    runTaskCriterionChecks,
    saveDocumentDesignRules,
} from "../../src/governance";
import { governTool } from "../../src/governance/governedRouter";
import { refreshSourceProtection } from "../../src/governance/sourceProtection";

function stubDoc(nodes: Array<{ id: string; name?: string }>, id = "doc-c1"): IDocument {
    const doc = createMockDocument({ id });
    const list = nodes.map((n) => ({ id: n.id, name: n.name ?? n.id, visible: true }));
    (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? list.filter(pred) : [...list];
    (doc.modelManager as any).findNodesDeep = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? list.filter(pred) : [...list];
    (doc.visual as any).update = rs.fn();
    const undos: IHistoryRecord[] = [];
    (doc.history as any).undoTop = () => undos[undos.length - 1];
    (doc.history as any).undoCount = () => undos.length;
    const app = createMockApplication();
    (app as any).activeView = { document: doc };
    rs.stubGlobal("app", app);
    return doc;
}

function stubRunner(kind: string, status: "pass" | "fail" | "unknown", reason = "stub"): CriterionRunner {
    return { kind, supportNotes: `stub ${kind}`, measure: async () => ({ status, reason }) };
}

const spec = (over: Partial<CriterionSpec> & { id: string }): CriterionSpec => ({
    kind: "stub_check",
    required: true,
    subjectNodeIds: ["wall-1"],
    expected: {},
    ...over,
});

describe("TASK-40 Đợt C1 — evidence framework", () => {
    let doc: IDocument;

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        clearTaskProfile();
        doc = stubDoc([{ id: "wall-1", name: "Wall" }]);
    });

    afterEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetPlanApprovalForTests();
        clearDesignRulesForTests();
        rs.unstubAllGlobals();
    });

    test("status is deferred with no runner and active once one is registered (C1.4)", () => {
        expect(getGovernanceStatus().criteriaVerification).toBe("deferred");
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        expect(getGovernanceStatus().criteriaVerification).toBe("active");
        expect(getGovernanceStatus().runnerKinds).toEqual(["stub_check"]);
    });

    test("recorded evidence binds task, document, rules fingerprint and subjects", async () => {
        approveTaskPlan({ taskId: "t1", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass", "đủ căn cứ"));
        defineTaskCriteria("t1", [spec({ id: "size" })]);
        const evaluation = await runTaskCriterionChecks("t1", doc);
        const evidence = getLatestEvidence("t1", "size")!;
        expect(evidence.documentId).toBe("doc-c1");
        expect(evidence.rulesFingerprint).toBe(rulesFingerprintFor("doc-c1"));
        expect(evidence.subjectNodeIds).toEqual(["wall-1"]);
        expect(evaluation.completable).toBe(true);
    });

    test("missing proof reads unknown — never a silent pass; blocks completion", async () => {
        approveTaskPlan({ taskId: "t2", allowedModifiedNodeIds: ["wall-1"] }, doc);
        defineTaskCriteria("t2", [spec({ id: "size" })]);
        // no runner registered for stub_check → unknown runner-not-registered
        const evaluation = await runTaskCriterionChecks("t2", doc);
        const row = evaluation.rows.find((r) => r.spec.id === "size")!;
        expect(row.status).toBe("unknown");
        expect(row.reason).toContain("runner-not-registered");
        expect(evaluation.completable).toBe(false);
        expect(evaluation.outstandingRequiredIds).toEqual(["size"]);
    });

    test("required pass + optional fail → vẫn hoàn tất; required fail → chặn", async () => {
        approveTaskPlan({ taskId: "t3", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("ok_check", "pass", "đạt"));
        registerCriterionRunner(stubRunner("bad_check", "fail", "sai rõ ràng"));
        defineTaskCriteria("t3", [
            spec({ id: "must", kind: "ok_check", required: true }),
            spec({ id: "nice", kind: "bad_check", required: false }),
        ]);
        const evaluation = await runTaskCriterionChecks("t3", doc);
        // optional fail hiển thị trung thực nhưng KHÔNG chặn badge hoàn tất
        expect(evaluation.counts.fail).toBe(1);
        expect(evaluation.completable).toBe(true);

        // đổi tiêu chí bắt buộc sang runner fail → chặn ngay
        defineTaskCriteria("t3", [spec({ id: "must", kind: "bad_check", required: true })]);
        const blocked = await runTaskCriterionChecks("t3", doc);
        expect(blocked.failingRequiredIds).toEqual(["must"]);
        expect(blocked.completable).toBe(false);
    });

    test("invalidation on subject change: the old pass is NOT reused (stale reads unknown)", async () => {
        approveTaskPlan({ taskId: "t4", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t4", [spec({ id: "size" })]);
        await runTaskCriterionChecks("t4", doc);
        expect(evaluateTaskCriteria("t4", doc).completable).toBe(true);

        invalidateEvidenceForNodeIds(["wall-1"], "transform_node đã thay đổi hình học");
        const after = evaluateTaskCriteria("t4", doc);
        const row = after.rows[0];
        expect(row.status).toBe("unknown");
        expect(row.stale).toBe(true);
        expect(row.reason).toContain("invalidated");
        expect(after.completable).toBe(false);
    });

    test("rules drift invalidates every evidence recorded under the old fingerprint", async () => {
        approveTaskPlan({ taskId: "t5", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t5", [spec({ id: "size" })]);
        await runTaskCriterionChecks("t5", doc);
        expect(evaluateTaskCriteria("t5", doc).completable).toBe(true);

        saveDocumentDesignRules("doc-c1", { guidanceMarkdown: "bề dày tường tối thiểu 220 mm" });
        const after = evaluateTaskCriteria("t5", doc);
        expect(after.rows[0].status).toBe("unknown");
        expect(after.rows[0].reason).toBe("rules-changed");
        expect(after.completable).toBe(false);
    });

    test("document switch invalidates evidence bound to the previous document", async () => {
        approveTaskPlan({ taskId: "t6", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t6", [spec({ id: "size" })]);
        await runTaskCriterionChecks("t6", doc);
        const otherDoc = stubDoc([{ id: "wall-9", name: "Wall9" }], "doc-c2");
        const onNew = evaluateTaskCriteria("t6", otherDoc);
        expect(onNew.rows[0].reason).toBe("document-changed");
        expect(onNew.completable).toBe(false);
    });

    test("completion requires an ACTIVE plan — an invalidated plan can never badge complete", async () => {
        approveTaskPlan({ taskId: "t7", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t7", [spec({ id: "size" })]);
        await runTaskCriterionChecks("t7", doc);
        invalidateTaskProfile("user interleaved");
        const after = evaluateTaskCriteria("t7", doc);
        expect(after.completable).toBe(false);
        expect(after.blockReason).toBe("plan_not_active");
    });

    test("no criteria declared → not completable with explicit block reason (C1 gating)", async () => {
        approveTaskPlan({ taskId: "t8", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        const evaluation = evaluateTaskCriteria("t8", doc);
        expect(evaluation.completable).toBe(false);
        expect(evaluation.blockReason).toBe("no_criteria_defined");
    });

    test("UI listener fires on record and on invalidation", async () => {
        approveTaskPlan({ taskId: "t9", allowedModifiedNodeIds: ["wall-1"] }, doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t9", [spec({ id: "size" })]);
        const events: number[] = [];
        const unsubscribe = onTaskEvidenceChanged(() => events.push(Date.now()));
        await runTaskCriterionChecks("t9", doc);
        invalidateEvidenceForNodeIds(["wall-1"], "xóa");
        unsubscribe();
        const before = events.length;
        await runTaskCriterionChecks("t9", doc);
        expect(before).toBeGreaterThan(0);
        expect(events.length).toBe(before); // after unsubscribe: silence
    });

    test("governed router write invalidates evidence of the touched node (real gate path)", async () => {
        approveTaskPlan({ taskId: "t10", allowedModifiedNodeIds: ["wall-1"] }, doc);
        refreshSourceProtection(doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t10", [spec({ id: "size" })]);
        await runTaskCriterionChecks("t10", doc);
        expect(evaluateTaskCriteria("t10", doc).completable).toBe(true);

        const fakeTool = { name: "transform_node", handler: async () => JSON.stringify({ success: true }) };
        const governed = governTool(fakeTool as any);
        const out = await governed.handler({ id: "wall-1", transform: {} });
        expect(String(out)).toContain("success");

        const after = evaluateTaskCriteria("t10", doc);
        expect(after.rows[0].stale).toBe(true);
        expect(after.completable).toBe(false);
    });

    test("blocked write does NOT invalidate (denied gate must not touch evidence)", async () => {
        approveTaskPlan({ taskId: "t11", allowedModifiedNodeIds: [] }, doc);
        refreshSourceProtection(doc);
        registerCriterionRunner(stubRunner("stub_check", "pass"));
        defineTaskCriteria("t11", [spec({ id: "size" })]);
        await runTaskCriterionChecks("t11", doc);

        const fakeTool = { name: "transform_node", handler: async () => JSON.stringify({ success: true }) };
        const governed = governTool(fakeTool as any);
        const out = await governed.handler({ id: "wall-1", transform: {} });
        expect(String(out)).toContain("PERMISSION_DENIED");
        expect(evaluateTaskCriteria("t11", doc).completable).toBe(true);
    });
});
