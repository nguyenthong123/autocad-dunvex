// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import type { CriterionRunner, CriterionSpec } from "../../src/governance";
import {
    applySuccessfulWriteForTests,
    approveTaskPlan,
    clearDesignRulesForTests,
    clearTaskProfile,
    defineTaskCriteria,
    evaluateTaskCriteria,
    getLatestEvidence,
    registerCriterionRunner,
    resetPlanApprovalForTests,
    resetTaskProfileForTests,
    resetVerificationForTests,
    runTaskCriterionChecks,
} from "../../src/governance";

function stubDoc(id = "doc-marker"): IDocument & { __push(record: IHistoryRecord): void } {
    const doc = createMockDocument({ id }) as IDocument & { __push(record: IHistoryRecord): void };
    const list = [
        { id: "wall-1", name: "Wall", visible: true },
        { id: "roof-1", name: "Roof", visible: true },
    ];
    (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? list.filter(pred) : [...list];
    (doc.modelManager as any).findNodesDeep = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? list.filter(pred) : [...list];
    (doc.visual as any).update = rs.fn();
    const undos: IHistoryRecord[] = [];
    (doc.history as any).undoTop = () => undos[undos.length - 1];
    (doc.history as any).undoCount = () => undos.length;
    doc.__push = (record: IHistoryRecord) => {
        undos.push(record);
    };
    const app = createMockApplication();
    (app as any).activeView = { document: doc };
    rs.stubGlobal("app", app);
    return doc;
}

const passRunner: CriterionRunner = {
    kind: "stub_check",
    supportNotes: "stub",
    measure: async () => ({ status: "pass", reason: "đạt" }),
};

const kich: CriterionSpec = {
    kind: "stub_check",
    id: "kich",
    required: true,
    subjectNodeIds: ["wall-1"],
    expected: {},
};
const vitri: CriterionSpec = {
    kind: "stub_check",
    id: "vitri",
    required: true,
    subjectNodeIds: ["roof-1"],
    expected: {},
};

describe("TASK-40 Đợt C1 (review follow-up) — state markers & conservative invalidation", () => {
    let doc: IDocument & { __push(record: IHistoryRecord): void };

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        clearTaskProfile();
        doc = stubDoc();
        registerCriterionRunner(passRunner);
        approveTaskPlan({ taskId: "marker-task", allowedModifiedNodeIds: ["wall-1", "roof-1"] }, doc);
        defineTaskCriteria("marker-task", [kich, vitri]);
    });

    afterEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetPlanApprovalForTests();
        clearDesignRulesForTests();
        rs.unstubAllGlobals();
    });

    test("record stamps a re-verifiable history marker; quiet reads stay fresh", async () => {
        const done = await runTaskCriterionChecks("marker-task", doc);
        expect(done.completable).toBe(true);
        const evidence = getLatestEvidence("marker-task", "kich");
        expect(evidence?.historyMark).toBeTruthy();
        expect(evidence?.stateSignature).toBeTruthy();
        // Reading repeatedly without touching anything must NOT manufacture staleness.
        expect(evaluateTaskCriteria("marker-task", doc).completable).toBe(true);
        expect(evaluateTaskCriteria("marker-task", doc).completable).toBe(true);
    });

    test("history grows OUTSIDE the agent path → every read reports unknown + badge gone", async () => {
        await runTaskCriterionChecks("marker-task", doc);
        // A UI command committed: undo stack gained a record. No router, no invalidate call.
        doc.__push({ name: "move_tool_ui" } as unknown as IHistoryRecord);
        const after = evaluateTaskCriteria("marker-task", doc);
        expect(after.rows.map((r) => r.status)).toEqual(["unknown", "unknown"]);
        expect(after.rows.every((r) => r.stale)).toBe(true);
        expect(after.rows[0].reason).toContain("history-changed");
        expect(after.completable).toBe(false);
        // Re-measuring binds fresh markers and the gate reopens on genuine pass.
        const repaired = await runTaskCriterionChecks("marker-task", doc);
        expect(repaired.completable).toBe(true);
    });

    test("two same-name records are different states — marker keys on record identity, not name", async () => {
        doc.__push({ name: "move" } as unknown as IHistoryRecord);
        await runTaskCriterionChecks("marker-task", doc);
        // Another "move" happened (identical name, different record object) — e.g. user moved twice.
        doc.__push({ name: "move" } as unknown as IHistoryRecord);
        const after = evaluateTaskCriteria("marker-task", doc);
        expect(after.rows[0].status).toBe("unknown");
        expect(after.rows[0].reason).toContain("history-changed");
        expect(after.completable).toBe(false);
    });

    test("undo rewinds history → old pass stale immediately (and stays stale until re-measured)", async () => {
        await runTaskCriterionChecks("marker-task", doc);
        const r1 = { name: "extrude" } as unknown as IHistoryRecord;
        doc.__push(r1);
        await runTaskCriterionChecks("marker-task", doc); // binds r1
        (doc.history as any).undoTop = () => undefined; // undo popped the stack
        (doc.history as any).undoCount = () => 0;
        const after = evaluateTaskCriteria("marker-task", doc);
        expect(after.rows[0].status).toBe("unknown");
        expect(after.completable).toBe(false);
    });

    test("router conservative branch: write whose impact cannot be pinned invalidates ALL task evidence", async () => {
        await runTaskCriterionChecks("marker-task", doc);
        applySuccessfulWriteForTests(
            "document_variables",
            { action: "set", name: "d", value: 1 },
            "variable set",
        );
        const after = evaluateTaskCriteria("marker-task", doc);
        expect(after.rows.map((r) => r.status)).toEqual(["unknown", "unknown"]);
        expect(after.rows[0].reason).toContain("bảo thủ");
        expect(after.completable).toBe(false);
    });

    test("C1.3: proof-runner với subject unreadable — chuỗi ổn định qua các lần đọc VẪN phải là unknown", async () => {
        registerCriterionRunner({
            kind: "geo_stub",
            requiresSubjectProof: true,
            supportNotes: "đo subject",
            measure: async () => ({ status: "pass", reason: "đạt" }),
        });
        defineTaskCriteria("marker-task", [
            { id: "kich", kind: "geo_stub", required: true, subjectNodeIds: ["ghost-1"], expected: {} },
        ]);
        const run = await runTaskCriterionChecks("marker-task", doc);
        expect(run.rows[0].status).toBe("unknown");
        expect(run.rows[0].reason).toContain("state-unverifiable");
        expect(run.completable).toBe(false);
        // Lần đọc sau: chuỗi unreadable GIỐNG HỆT cũng không được dựng lại pass.
        const again = evaluateTaskCriteria("marker-task", doc);
        expect(again.rows[0].status).toBe("unknown");
        expect(again.completable).toBe(false);
    });

    test("C1.3: thiếu marker bắt buộc (no-subjects / signature absent) → unknown, không hoàn tất", async () => {
        registerCriterionRunner({
            kind: "geo_stub",
            requiresSubjectProof: true,
            supportNotes: "đo subject",
            measure: async () => ({ status: "pass", reason: "đạt" }),
        });
        defineTaskCriteria("marker-task", [
            { id: "kich", kind: "geo_stub", required: true, subjectNodeIds: [], expected: {} },
        ]);
        const run = await runTaskCriterionChecks("marker-task", doc);
        expect(run.rows[0].status).toBe("unknown");
        expect(run.rows[0].reason).toContain("state-unverifiable");
        expect(run.completable).toBe(false);
    });

    test("runner không đòi proof giữ semantics cũ: subject giả vẫn pass — hồi quy tương thích", async () => {
        defineTaskCriteria("marker-task", [kich]);
        const run = await runTaskCriterionChecks("marker-task", doc);
        expect(run.rows[0].status).toBe("pass");
        expect(run.completable).toBe(true);
    });

    test("analyzed write invalidates precisely: only evidence bound to the affected subject", async () => {
        await runTaskCriterionChecks("marker-task", doc);
        applySuccessfulWriteForTests("transform_node", { id: "wall-1", translation: [0, 0, 0] }, "ok");
        const after = evaluateTaskCriteria("marker-task", doc);
        const kichRow = after.rows.find((r) => r.spec.id === "kich");
        const vitriRow = after.rows.find((r) => r.spec.id === "vitri");
        expect(kichRow?.status).toBe("unknown");
        expect(kichRow?.reason).toContain("invalidated");
        expect(vitriRow?.status).toBe("pass");
        expect(vitriRow?.stale).toBe(false);
    });
});
