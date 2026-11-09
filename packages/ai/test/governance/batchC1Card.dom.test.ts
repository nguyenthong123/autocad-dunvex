// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
    approveTaskPlan,
    type CriterionRunner,
    type CriterionSpec,
    clearDesignRulesForTests,
    clearTaskProfile,
    defineTaskCriteria,
    evaluateTaskCriteria,
    invalidateEvidenceForNodeIds,
    registerCriterionRunner,
    renderEvidenceCard,
    resetPlanApprovalForTests,
    resetTaskProfileForTests,
    resetVerificationForTests,
    runTaskCriterionChecks,
} from "../../src/governance";

const CLASSES = {
    root: "card",
    header: "h",
    row: "row",
    pass: "pass",
    fail: "fail",
    unknown: "unk",
    stale: "stale",
    badgeComplete: "ok",
    badgeOutstanding: "bad",
};

const sizeSpec: CriterionSpec = {
    id: "dim",
    kind: "dimension_match",
    required: true,
    subjectNodeIds: ["wall-1"],
    expected: { sizeMm: [800, 300, 2500] },
    toleranceMm: [2, 2, 2],
};

function mountCard(evaluation: ReturnType<typeof evaluateTaskCriteria>): HTMLElement {
    const card = renderEvidenceCard(evaluation, CLASSES);
    document.body.replaceChildren(card);
    return card;
}

describe("TASK-40 Đợt C1 — thẻ bằng chứng trong chat (mỗi trạng thái một ca)", () => {
    let doc: IDocument;

    function stubRunner(status: "pass" | "fail" | "unknown", reason: string): CriterionRunner {
        return {
            kind: "dimension_match",
            supportNotes: "chỉ đo hộp bao",
            measure: async () => ({ status, reason }),
        };
    }

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        clearTaskProfile();
        doc = createMockDocument({ id: "doc-card" });
        const list = [{ id: "wall-1", name: "Wall", visible: true }];
        (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
            typeof pred === "function" ? list.filter(pred) : [...list];
        (doc.modelManager as any).findNodesDeep = (pred?: (n: any) => boolean) =>
            typeof pred === "function" ? list.filter(pred) : [...list];
        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        rs.stubGlobal("app", app);
        approveTaskPlan({ taskId: "task-card", allowedModifiedNodeIds: ["wall-1"] }, doc);
        defineTaskCriteria("task-card", [sizeSpec]);
    });

    afterEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetPlanApprovalForTests();
        clearDesignRulesForTests();
        rs.unstubAllGlobals();
        document.body.replaceChildren();
    });

    test("all required pass → badge HOÀN TẤT, không có dòng ⏳", async () => {
        registerCriterionRunner(stubRunner("pass", "800×300×2500 trong dung sai"));
        const evaluation = await runTaskCriterionChecks("task-card", doc);
        const card = mountCard(evaluation);
        expect(card.textContent).toContain("✅");
        expect(card.textContent).toContain("✔ HOÀN TẤT");
        expect(card.textContent).not.toContain("⏳");
        expect(card.textContent).toContain("dimension_match · dim");
        expect(card.textContent).toContain("chỉ đo hộp bao");
    });

    test("required fail → ❌ hiện rõ, badge CHƯA HOÀN TẤT kèm số tiêu chí còn thiếu", async () => {
        registerCriterionRunner(stubRunner("fail", "trục X lệch 100 mm"));
        const evaluation = await runTaskCriterionChecks("task-card", doc);
        const card = mountCard(evaluation);
        expect(card.textContent).toContain("❌");
        expect(card.textContent).toContain("⏳ CHƯA HOÀN TẤT");
        expect(card.textContent).toContain("còn 1/1 tiêu chí bắt buộc chưa đạt");
        expect(card.textContent).not.toContain("✔ HOÀN TẤT");
    });

    test("chưa có bằng chứng → ❓ unknown, KHÔNG phải pass", async () => {
        // chưa đăng ký runner: check tự động unknown
        const evaluation = await runTaskCriterionChecks("task-card", doc);
        const card = mountCard(evaluation);
        expect(card.textContent).toContain("❓");
        expect(card.textContent).toContain("runner-not-registered");
        expect(card.textContent).toContain("⏳ CHƯA HOÀN TẤT");
    });

    test("bằng chứng bị vô hiệu hóa sau sửa hình → stale vẫn hiển thị, không ẩn đi", async () => {
        registerCriterionRunner(stubRunner("pass", "đạt từ lần đo trước"));
        await runTaskCriterionChecks("task-card", doc);
        invalidateEvidenceForNodeIds(["wall-1"], "transform_node đã thay đổi hình học");
        const card = mountCard(evaluateTaskCriteria("task-card", doc));
        expect(card.textContent).toContain("invalidated");
        expect(card.textContent).toContain("bằng chứng cũ");
        expect(card.textContent).toContain("⏳ CHƯA HOÀN TẤT");
    });

    test("plan mất hiệu lực → card ghi thẳng lý do, tuyệt đối không hiện hoàn tất", async () => {
        registerCriterionRunner(stubRunner("pass", "ok"));
        await runTaskCriterionChecks("task-card", doc);
        const { invalidateTaskProfile } = await import("../../src/governance/taskProfile");
        invalidateTaskProfile("user interleaved");
        const card = mountCard(evaluateTaskCriteria("task-card", doc));
        expect(card.textContent).toContain("kế hoạch không còn hiệu lực");
        expect(card.textContent).not.toContain("✔ HOÀN TẤT");
    });

    test("dòng pass/fail mang class trạng thái riêng (Dark/Light không phụ thuộc màu nội tuyến)", async () => {
        registerCriterionRunner(stubRunner("pass", "ok"));
        const evaluation = await runTaskCriterionChecks("task-card", doc);
        const card = mountCard(evaluation);
        const row = card.querySelector(".row");
        expect(row).not.toBeNull();
        expect(row!.className).toContain("pass");
    });

    test("C3: thẻ có đề xuất sửa → hiển thị khối đề xuất và nút Duyệt sửa, bấm nút disabled ngay", () => {
        const evaluation = evaluateTaskCriteria("task-card", doc);
        evaluation.activeProposal = {
            proposalId: "p1",
            taskId: "task-card",
            documentId: doc.id,
            historyMark: "h1",
            rulesFingerprint: "r1",
            stateSignature: "s1",
            subjectNodeIds: ["wall-1"],
            toolName: "set_node_properties",
            toolArgs: { id: "wall-1", properties: { dx: 800 } },
            displayDescription: "Sửa kích thước wall-1 (dx: 700 → 800 mm)",
            phase: "size",
            attemptIndex: 1,
            deltas: [],
            executed: false,
            createdAt: Date.now(),
        };

        const onApprove = rs.fn();
        const card = renderEvidenceCard(evaluation, CLASSES, { onApproveRepair: onApprove });
        document.body.replaceChildren(card);

        expect(card.textContent).toContain("Đề xuất sửa sai lệch (Lần 1/2)");
        expect(card.textContent).toContain("Sửa kích thước wall-1 (dx: 700 → 800 mm)");

        const approveBtn = card.querySelector("button") as HTMLButtonElement;
        expect(approveBtn).not.toBeNull();
        expect(approveBtn.textContent).toBe("Duyệt sửa");

        approveBtn.click();
        expect(onApprove).toHaveBeenCalledTimes(1);
        expect(approveBtn.disabled).toBe(true);
        expect(approveBtn.textContent).toBe("Đang sửa...");

        // Click lần 2 không gọi tiếp (once: true)
        approveBtn.click();
        expect(onApprove).toHaveBeenCalledTimes(1);
    });

    test("C3: hiển thị thông báo khi có lý do dừng tự sửa hoặc hết lượt", () => {
        const evaluation = evaluateTaskCriteria("task-card", doc);
        evaluation.proposalStopReason = "unsupported-transform-mapping: có xoay phi trực giao";
        evaluation.executedRepairs = 2;

        const card = mountCard(evaluation);
        expect(card.textContent).toContain(
            "Dừng tự sửa: unsupported-transform-mapping: có xoay phi trực giao",
        );
        expect(card.textContent).toContain("Đã thực thi đủ 2/2 lượt tự sửa trên tác vụ gốc");
    });
});
