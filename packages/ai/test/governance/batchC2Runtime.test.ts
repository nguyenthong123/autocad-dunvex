// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
    applySuccessfulWriteForTests,
    buildProposeTaskPlanTool,
    clearDesignRulesForTests,
    clearTaskProfile,
    confirmProposedPlan,
    finalizeTaskVerification,
    getActiveTaskProfile,
    getTaskCriteria,
    parseTaskPlanProposal,
    registerCriterionRunner,
    resetPlanApprovalForTests,
    resetTaskProfileForTests,
    resetVerificationForTests,
    setPlanApprovalHandler,
} from "../../src/governance";

function stubDoc(): IDocument {
    const doc = createMockDocument({ id: "doc-c2run" });
    const list = [
        { id: "wall-1", name: "Tường cũ", visible: true },
        { id: "prod-1", name: "Tấm C2", visible: true },
    ];
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

const validCriteria = [
    {
        id: "kich",
        kind: "dimension_match",
        required: true,
        subjectHint: "Tấm C2",
        expected: { sizeMm: [800, 300, 2500] },
        toleranceMm: [2, 2, 2],
        unit: "mm",
        coordRef: "world",
        source: "yêu cầu: tấm 800×300×2500 mm ±2",
    },
];

describe("TASK-40 C2 runtime — criteria gắn vào plan, đo sau ghi, finalize trong app", () => {
    let doc: IDocument;

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetPlanApprovalForTests();
        clearTaskProfile();
        doc = stubDoc();
    });

    afterEach(() => {
        setPlanApprovalHandler(undefined);
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetPlanApprovalForTests();
        clearTaskProfile();
        clearDesignRulesForTests();
        rs.unstubAllGlobals();
    });

    test("sanitize proposal: loại bỏ rác/mục tuỳ chọn sai, bảo toàn tiêu chí bắt buộc kèm resolutionNote", () => {
        const parsed = parseTaskPlanProposal({
            goal: "tạo tấm",
            allowedModifiedNodeIds: ["wall-1"],
            criteria: [
                ...validCriteria,
                { ...validCriteria[0], id: "k-optional-bad", required: false, unit: "in" },
                { ...validCriteria[0], id: "k-req-bad", required: true, unit: "in" },
                "rác",
                42,
            ],
        });
        // 1 mục chuẩn + 1 mục bắt buộc sai đơn vị (được bảo toàn để chặn pass ảo) = 2
        expect(parsed.criteria?.length).toBe(2);
        expect(parsed.criteria?.[0].subjectHint).toBe("Tấm C2");
        expect(parsed.criteria?.[1].resolutionNote).toContain("đơn vị 'in' không hợp lệ");
        // 1 mục tuỳ chọn sai + 2 mục rác primitive = 3 bị loại
        expect(parsed.criteriaDiscarded).toBe(3);
    });

    test("thiếu dung sai/expected VẪN được giữ — runner sẽ trả unknown, không丢弃", () => {
        const parsed = parseTaskPlanProposal({
            goal: "g",
            allowedModifiedNodeIds: ["wall-1"],
            criteria: [{ id: "k", kind: "position_match", subjectNodeIds: ["wall-1"] }],
        });
        expect(parsed.criteria?.length).toBe(1);
        expect(parsed.criteria?.[0].toleranceMm).toBeUndefined();
        expect(parsed.criteriaDiscarded).toBeUndefined();
    });

    test("tool propose → handler đáng tin duyệt → profile mang criteria, tool trả criteriaCount", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();
        const out = JSON.parse(
            (await tool.handler!(
                { goal: "tạo tấm 800", allowedModifiedNodeIds: ["wall-1"], criteria: validCriteria },
                undefined,
            )) as string,
        );
        expect(out.approved).toBe(true);
        expect(out.criteriaCount).toBe(1);
        expect(out.criteriaDiscarded).toBe(0);
        const profile = getActiveTaskProfile();
        expect(profile?.criteria?.length).toBe(1);
        // Đo KHÔNG mở rộng quyền: phạm vi sửa vẫn đúng như đã duyệt.
        expect(profile?.allowedModifiedNodeIds).toEqual(["wall-1"]);
    });

    test("finalize: subjectHint resolve vào node do task tạo (write cuối), đo và bind bằng chứng", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();
        await tool.handler!(
            { goal: "tạo tấm", allowedModifiedNodeIds: [], criteria: validCriteria },
            undefined,
        );
        const profile = getActiveTaskProfile();
        expect(profile).toBeTruthy();

        // Agent ghi thật qua router: run_program tạo node prod-1 → recordTaskOwnedNodes.
        applySuccessfulWriteForTests(
            "run_program",
            { ops: [] },
            JSON.stringify({ created: [{ nodeId: "prod-1" }] }),
        );

        // Stub runner thuần (không proof): đơn vị đo của file này chứng minh PIPELINE
        // propose→duyệt→resolve→đo→bind. Đường proof + hình học thật nằm ở ca kernel.
        registerCriterionRunner({
            kind: "dimension_match",
            label: "Kích thước bao (hộp bao world, mm)",
            supportNotes: "stub runtime",
            measure: async (spec) =>
                spec.subjectNodeIds.length > 0
                    ? { status: "pass", measured: { sizeMm: [800, 300, 2500] }, reason: "đạt theo yêu cầu" }
                    : { status: "unknown", reason: "không resolve được đối tượng" },
        });

        const evaluation = await finalizeTaskVerification(doc);
        expect(evaluation).toBeTruthy();
        expect(getTaskCriteria(profile!.taskId).map((s) => s.subjectNodeIds)).toEqual([["prod-1"]]);
        expect(evaluation!.rows[0].status).toBe("pass");
        expect(evaluation!.completable).toBe(true);
    });

    test("finalize hint không khớp đối tượng nào → no subjects → unknown, KHÔNG hoàn tất", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();
        await tool.handler!(
            {
                goal: "tạo tấm",
                allowedModifiedNodeIds: [],
                criteria: [{ ...validCriteria[0], subjectHint: "Đối tượng không tồn tại" }],
            },
            undefined,
        );
        registerCriterionRunner({
            kind: "dimension_match",
            requiresSubjectProof: true,
            supportNotes: "stub runtime",
            measure: async () => ({ status: "pass", reason: "tự khai không có subject" }),
        });
        const evaluation = await finalizeTaskVerification(doc);
        expect(evaluation!.rows[0].status).toBe("unknown");
        expect(evaluation!.rows[0].reason).toContain("state-unverifiable");
        expect(evaluation!.completable).toBe(false);
    });

    test("hai node cùng khớp tên gợi ý → unknown cần làm rõ đối tượng, tránh xác nhận nhầm; khi có ID dùng đúng ID", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();
        await tool.handler!(
            {
                goal: "tạo tấm",
                allowedModifiedNodeIds: [],
                criteria: [
                    { ...validCriteria[0], id: "k-hint", subjectHint: "Tấm C2", subjectNodeIds: [] },
                    { ...validCriteria[0], id: "k-id", subjectHint: "Tấm C2", subjectNodeIds: ["prod-1"] },
                ],
            },
            undefined,
        );

        // Giả lập tài liệu có 2 node cùng mang tên "Tấm C2" do task tạo
        const list = [
            { id: "wall-1", name: "Tường cũ", visible: true },
            { id: "prod-1", name: "Tấm C2", visible: true },
            { id: "prod-2", name: "Tấm C2", visible: true },
        ];
        (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
            typeof pred === "function" ? list.filter(pred) : [...list];

        applySuccessfulWriteForTests(
            "run_program",
            { ops: [] },
            JSON.stringify({ created: [{ nodeId: "prod-1" }, { nodeId: "prod-2" }] }),
        );

        registerCriterionRunner({
            kind: "dimension_match",
            label: "Kích thước bao (hộp bao world, mm)",
            supportNotes: "stub runtime",
            measure: async (spec) =>
                spec.subjectNodeIds.length > 0
                    ? { status: "pass", measured: { sizeMm: [800, 300, 2500] }, reason: "đạt theo yêu cầu" }
                    : { status: "unknown", reason: spec.resolutionNote ?? "không resolve được đối tượng" },
        });

        const evaluation = await finalizeTaskVerification(doc);
        expect(evaluation).toBeTruthy();

        // Tiêu chí k-hint chỉ có tên gợi ý và có 2 node khớp → unknown, không được xác nhận nhầm
        const rowHint = evaluation!.rows.find((r) => r.spec.id === "k-hint")!;
        expect(rowHint.status).toBe("unknown");
        expect(rowHint.reason).toContain("cần làm rõ đối tượng");

        // Tiêu chí k-id có ID xác định được ("prod-1") → dùng đúng ID đó và pass
        const rowId = evaluation!.rows.find((r) => r.spec.id === "k-id")!;
        expect(rowId.status).toBe("pass");
        expect(rowId.spec.subjectNodeIds).toEqual(["prod-1"]);

        // Tổng thể không hoàn tất vì k-hint còn unknown
        expect(evaluation!.completable).toBe(false);
    });

    test("Point 1: tiêu chí đúng đi cùng tiêu chí bắt buộc trùng ID → tool chặn và yêu cầu sửa kế hoạch", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();

        const out = JSON.parse(
            (await tool.handler!(
                {
                    goal: "tạo tấm",
                    allowedModifiedNodeIds: [],
                    criteria: [
                        { ...validCriteria[0], id: "kich" },
                        { ...validCriteria[0], id: "kich" }, // Trùng ID "kich"
                    ],
                },
                undefined,
            )) as string,
        );

        expect(out.approved).toBe(false);
        expect(out.error).toContain("trùng lặp");
        expect(out.error).toContain("yêu cầu sửa kế hoạch");
        expect(getActiveTaskProfile()).toBeUndefined();
    });

    test("Point 1: tiêu chí đúng đi cùng tiêu chí bắt buộc không hợp lệ (unit khác mm) → giữ unknown chặn hoàn tất", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();

        const out = JSON.parse(
            (await tool.handler!(
                {
                    goal: "tạo tấm",
                    allowedModifiedNodeIds: [],
                    criteria: [
                        { ...validCriteria[0], id: "kich-valid" },
                        { ...validCriteria[0], id: "kich-invalid-req", required: true, unit: "in" },
                    ],
                },
                undefined,
            )) as string,
        );

        expect(out.approved).toBe(true);
        expect(out.criteriaCount).toBe(2);

        applySuccessfulWriteForTests(
            "run_program",
            { ops: [] },
            JSON.stringify({ created: [{ nodeId: "prod-1" }] }),
        );

        registerCriterionRunner({
            kind: "dimension_match",
            label: "Kích thước bao (hộp bao world, mm)",
            supportNotes: "stub runtime",
            measure: async (spec) =>
                spec.resolutionNote
                    ? { status: "unknown", reason: spec.resolutionNote }
                    : { status: "pass", measured: { sizeMm: [800, 300, 2500] }, reason: "đạt" },
        });

        const evaluation = await finalizeTaskVerification(doc);
        expect(evaluation).toBeTruthy();

        // Tiêu chí đúng pass
        const rowValid = evaluation!.rows.find((r) => r.spec.id === "kich-valid")!;
        expect(rowValid.status).toBe("pass");

        // Tiêu chí bắt buộc sai đơn vị giữ unknown kèm lý do, không bị drop để pass ảo
        const rowInvalid = evaluation!.rows.find((r) => r.spec.id === "kich-invalid-req")!;
        expect(rowInvalid.status).toBe("unknown");
        expect(rowInvalid.reason).toContain("đơn vị 'in' không hợp lệ");

        // App giữ trạng thái chưa hoàn tất
        expect(evaluation!.completable).toBe(false);
    });

    test("Point 2: runner bị giữ chờ, tài liệu/hình học bị sửa rồi mới trả pass cũ → bỏ kết quả cũ, giữ unknown", async () => {
        setPlanApprovalHandler(async (bound) => ({ approved: true, profile: confirmProposedPlan(bound) }));
        const tool = buildProposeTaskPlanTool();

        await tool.handler!(
            {
                goal: "tạo tấm",
                allowedModifiedNodeIds: [],
                criteria: [{ ...validCriteria[0], id: "kich", subjectNodeIds: ["prod-1"] }],
            },
            undefined,
        );

        applySuccessfulWriteForTests(
            "run_program",
            { ops: [] },
            JSON.stringify({ created: [{ nodeId: "prod-1" }] }),
        );

        // Tạo deferred promise để giả lập runner chạy chậm / bị giữ chờ
        let resolveRunner!: (val: any) => void;
        const runnerPromise = new Promise((res) => {
            resolveRunner = res;
        });

        registerCriterionRunner({
            kind: "dimension_match",
            label: "Kích thước bao (hộp bao world, mm)",
            supportNotes: "runner giả lập trễ",
            measure: async () => {
                await runnerPromise;
                return {
                    status: "pass",
                    measured: { sizeMm: [800, 300, 2500] },
                    reason: "kết quả đo tính trên trạng thái cũ",
                };
            },
        });

        // Bắt đầu chạy kiểm tra tiêu chí
        const checkPromise = finalizeTaskVerification(doc);

        // Trong lúc runner đang chờ, người dùng hoặc UI sửa tài liệu (thêm lịch sử sửa)
        const userMoveRecord = { name: "User Move" } as any;
        (doc.history as any).undoTop = () => userMoveRecord;

        // Runner trả kết quả pass cũ
        resolveRunner(undefined);

        const evaluation = await checkPromise;
        expect(evaluation).toBeTruthy();

        // Kết quả pass cũ bị bỏ vì tài liệu đã đổi trong lúc chờ đo → trả unknown
        const row = evaluation!.rows[0];
        expect(row.status).toBe("unknown");
        expect(row.reason).toContain("state-drift-during-measurement");
        expect(row.reason).toContain("thao tác chỉnh sửa mới trong lúc chờ đo");
        expect(evaluation!.completable).toBe(false);
    });

    test("finalize không có plan/criteria → undefined (không tự bày đặt đo)", async () => {
        expect(await finalizeTaskVerification(doc)).toBeUndefined();
    });
});
