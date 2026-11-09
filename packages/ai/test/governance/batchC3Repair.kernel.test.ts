// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
    EditableShapeNode,
    type IDocument,
    type IShape,
    Matrix4,
    ParameterShapeNode,
    Plane,
    property,
    type Result,
    serializable,
    serialize,
    XYZ,
} from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { afterEach, beforeAll, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
    approveTaskPlan,
    type CriterionSpec,
    clearDesignRulesForTests,
    clearTaskProfile,
    defineTaskCriteria,
    evaluateRepairConvergence,
    evaluateTaskCriteria,
    executeRepairProposal,
    finalizeTaskVerification,
    generateRepairProposal,
    getTaskProfile,
    historyMarkOf,
    inspectNodeForRepair,
    isPureTranslation,
    registerDefaultGeometryRunners,
    rejectRepairProposal,
    resetTaskProfileForTests,
    resetVerificationForTests,
    rulesFingerprintFor,
    saveDocumentDesignRules,
    subjectsSignatureOf,
} from "../../src/governance";

const WASM_PATH = path.resolve(__dirname, "../../../wasm/lib/chili-wasm.wasm");
const WASM_BINARY = readFileSync(WASM_PATH);

describe("TASK-40 Đợt C3 — Tự sửa sai theo sai lệch đo được trên kernel thật", () => {
    let doc: TestDocument;
    let factory: ShapeFactory;

    @serializable()
    class TestBoxNode extends ParameterShapeNode {
        override display(): any {
            return "body.box";
        }
        @serialize()
        get plane(): Plane {
            return this.getPrivateValue("plane");
        }
        set plane(p: Plane) {
            this.setPropertyEmitShapeChanged("plane", p);
        }
        @serialize()
        @property("box.dx")
        get dx(): number {
            return this.getPrivateValue("dx");
        }
        set dx(v: number) {
            this.setPropertyEmitShapeChanged("dx", v);
        }
        @serialize()
        @property("box.dy")
        get dy(): number {
            return this.getPrivateValue("dy");
        }
        set dy(v: number) {
            this.setPropertyEmitShapeChanged("dy", v);
        }
        @serialize()
        @property("box.dz")
        get dz(): number {
            return this.getPrivateValue("dz");
        }
        set dz(v: number) {
            this.setPropertyEmitShapeChanged("dz", v);
        }

        constructor(options: {
            document: IDocument;
            plane: Plane;
            dx: number;
            dy: number;
            dz: number;
            name?: string;
        }) {
            super(options);
            this.setPrivateValue("plane", options.plane);
            this.setPrivateValue("dx", options.dx);
            this.setPrivateValue("dy", options.dy);
            this.setPrivateValue("dz", options.dz);
            if (options.name) this.name = options.name;
        }

        override generateShape(): Result<IShape> {
            return factory.box(this.plane, this.dx, this.dy, this.dz);
        }
    }
    Object.defineProperty(TestBoxNode, "name", { value: "BoxNode" });

    beforeAll(async () => {
        await initWasm({ wasmBinary: WASM_BINARY });
        factory = new ShapeFactory();
    });

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        clearTaskProfile();
        doc = new TestDocument({ selection: { clearSelection: rs.fn(), getSelectedNodes: () => [] } as any });
        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        rs.stubGlobal("app", app);
        registerDefaultGeometryRunners();
    });

    afterEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        clearDesignRulesForTests();
        rs.unstubAllGlobals();
    });

    function addBox(name: string, dx: number, dy: number, dz: number, plane = Plane.XY): TestBoxNode {
        const node = new TestBoxNode({ document: doc, plane, dx, dy, dz, name });
        doc.modelManager.addNode(node);
        return node;
    }

    function addEditableBox(name: string, dx: number, dy: number, dz: number): EditableShapeNode {
        const res = factory.box(Plane.XY, dx, dy, dz);
        const node = new EditableShapeNode({ document: doc, name, shape: res.value });
        doc.modelManager.addNode(node);
        return node;
    }

    // =========================================================================
    // C3-T1: Sửa kích thước trực giao đạt chuẩn (Box lệch X 700 -> 800 mm)
    // =========================================================================
    test("C3-T1: sửa kích thước trực giao đạt chuẩn qua set_node_properties (dx: 700 -> 800 mm)", async () => {
        const box = addBox("box_1", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        // Đo lần đầu: fail trục X (700 vs 800)
        const eval1 = await finalizeTaskVerification(doc);
        expect(eval1?.completable).toBe(false);
        expect(eval1?.failingRequiredIds).toEqual(["c-dim"]);
        expect(eval1?.activeProposal).toBeDefined();
        expect(eval1?.activeProposal?.toolName).toBe("set_node_properties");
        expect(eval1?.activeProposal?.toolArgs).toEqual({
            id: box.id,
            properties: { dx: 800 },
        });

        // Người dùng duyệt đề xuất sửa
        const res = await executeRepairProposal(eval1!.activeProposal!, doc);
        expect(res.success).toBe(true);
        expect(profile.executedRepairs).toBe(1);

        // Sau sửa, đo lại đạt hoàn tất
        const eval2 = res.evaluation;
        expect(eval2?.completable).toBe(true);
        expect(eval2?.counts.fail).toBe(0);
        expect(eval2?.counts.pass).toBe(1);
    });

    // =========================================================================
    // C3-T2: Sửa vị trí tịnh tiến đạt chuẩn (Box lệch trục Y: 400 -> 0 mm)
    // =========================================================================
    test("C3-T2: sửa vị trí tịnh tiến đạt chuẩn qua transform_node (Y: 400 -> 0 mm)", async () => {
        const box = addBox("box_2", 800, 200, 100);
        // Tịnh tiến ban đầu Y +400 mm
        box.transform = Matrix4.fromTranslation(0, 400, 0);

        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
            {
                id: "c-pos",
                kind: "position_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { centerMm: [400, 100, 50] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        // Đo lần đầu: kích thước đạt, vị trí lệch Y (+400 mm)
        const eval1 = await finalizeTaskVerification(doc);
        expect(eval1?.completable).toBe(false);
        expect(eval1?.failingRequiredIds).toEqual(["c-pos"]);
        expect(eval1?.activeProposal?.toolName).toBe("transform_node");
        expect(eval1?.activeProposal?.toolArgs).toEqual({
            id: box.id,
            translate: { x: 0, y: -400, z: 0 },
        });

        // Duyệt đề xuất dịch chuyển
        const res = await executeRepairProposal(eval1!.activeProposal!, doc);
        expect(res.success).toBe(true);
        expect(profile.executedRepairs).toBe(1);

        // Đo lại: pass cả 2 tiêu chí
        const eval2 = res.evaluation;
        expect(eval2?.completable).toBe(true);
        expect(eval2?.counts.pass).toBe(2);
    });

    // =========================================================================
    // C3-T3: Ca hồi quy kinh điển: Hộp đổi kích thước tự dời tâm (Regression)
    // Hộp neo tại X=0, dx=700 (tâm 350). Tiêu chí yêu cầu dx=800 và tâm 400.
    // Pha 1 chỉ sửa dx: 700 -> 800. Tâm tự dời 350 -> 400. Không phát sinh lệnh dịch thừa.
    // =========================================================================
    test("C3-T3: hồi quy hộp 700 -> 800 mm neo tại 0, tâm tự đổi 350 -> 400 mm, đúng 1 lần sửa và không có lệnh dịch", async () => {
        const box = addBox("box_regress", 700, 200, 100);
        // Neo tại gốc (0,0,0) -> hiện tại tâm là [350, 100, 50]
        const criteria: CriterionSpec[] = [
            {
                id: "req-size",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
            {
                id: "req-center",
                kind: "position_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { centerMm: [400, 100, 50] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        // Lần đo 1: Cả size (700 vs 800) và center (350 vs 400) đều fail
        const eval1 = await finalizeTaskVerification(doc);
        expect(eval1?.completable).toBe(false);
        expect(eval1?.failingRequiredIds).toContain("req-size");
        expect(eval1?.failingRequiredIds).toContain("req-center");

        // QUY TẮC PHA BẮT BUỘC: Chỉ đề xuất sửa kích thước (Phase 1), TUYỆT ĐỐI KHÔNG sinh lệnh dịch
        expect(eval1?.activeProposal?.phase).toBe("size");
        expect(eval1?.activeProposal?.toolName).toBe("set_node_properties");
        expect(eval1?.activeProposal?.toolArgs).toEqual({
            id: box.id,
            properties: { dx: 800 },
        });

        // Người dùng duyệt đề xuất Pha 1
        const res = await executeRepairProposal(eval1!.activeProposal!, doc);
        expect(res.success).toBe(true);
        expect(profile.executedRepairs).toBe(1);

        // Sau khi sửa dx = 800, tâm tự động chuyển thành 400 trên kernel!
        // Đo lại: CẢ 2 TIÊU CHÍ ĐỀU PASS!
        const eval2 = res.evaluation;
        expect(eval2?.completable).toBe(true);
        expect(eval2?.failingRequiredIds).toEqual([]);
        expect(eval2?.counts.pass).toBe(2);
        // Không còn đề xuất nào được sinh ra -> KHÔNG phát sinh lệnh dịch thừa!
        expect(eval2?.activeProposal).toBeUndefined();
    });

    // =========================================================================
    // C3-T4: Dừng khi hệ tọa độ không hỗ trợ (Xoay phi trực giao hoặc scale)
    // =========================================================================
    test("C3-T4: dừng khi hệ tọa độ không hỗ trợ (xoay phi trực giao quanh Z 45°)", async () => {
        const box = addBox("box_rot", 800, 200, 100);
        // Xoay 45 độ quanh trục Z
        box.transform = Matrix4.fromAxisRad({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 4);

        const criteria: CriterionSpec[] = [
            {
                id: "c-pos",
                kind: "position_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { centerMm: [100, 100, 50] },
                toleranceMm: [1, 1, 1],
            },
        ];

        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        expect(eval1?.completable).toBe(false);
        // Không thể chứng minh chuyển đổi world-to-local do xoay -> dừng và báo lý do rõ ràng
        expect(eval1?.activeProposal).toBeUndefined();
        expect(eval1?.proposalStopReason).toContain("unsupported-transform-mapping");
    });

    // =========================================================================
    // C3-T5: Dừng khi 1 trục tốt lên nhưng trục khác xấu đi quá ngưỡng nhiễu
    // =========================================================================
    test("C3-T5: dừng khi một trục tốt lên nhưng trục khác xấu đi vượt ngưỡng nhiễu", async () => {
        const box = addBox("box_degrade", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        // Đo lần đầu: lệch X 100 mm
        const eval1 = await finalizeTaskVerification(doc);
        expect(eval1?.activeProposal).toBeDefined();

        // Giả sử sau lần sửa 1, ta ghi nhận đã sửa 1 lần và gán delta mốc
        profile.executedRepairs = 1;
        profile.lastDeltas = [
            {
                criterionId: "c-dim",
                subjectNodeId: box.id,
                kind: "dimension_match",
                axis: "X",
                axisIndex: 0,
                measuredMm: 700,
                expectedMm: 800,
                deltaMm: -100,
                toleranceMm: 2,
            },
            {
                criterionId: "c-dim",
                subjectNodeId: box.id,
                kind: "dimension_match",
                axis: "Y",
                axisIndex: 1,
                measuredMm: 200,
                expectedMm: 200,
                deltaMm: 0,
                toleranceMm: 2,
            },
        ];

        // Sửa X tốt lên (dx: 790 mm, lệch -10 mm) nhưng trục Y bị kéo lệch thành 250 mm (lệch +50 mm > eps_noise)
        box.dx = 790;
        box.dy = 250;

        const eval2 = await finalizeTaskVerification(doc);
        expect(eval2?.completable).toBe(false);
        // Điều kiện No Degradation bị vi phạm -> dừng ngay lập tức, từ chối đề xuất lần 2
        expect(eval2?.activeProposal).toBeUndefined();
        expect(eval2?.proposalStopReason).toContain("non-converging-repair");
    });

    // =========================================================================
    // C3-T6: Hủy đề xuất khi mô hình trôi (State Drift) trước khi bấm duyệt
    // =========================================================================
    test("C3-T6: hủy đề xuất và từ chối khi mô hình bị trôi (undo hoặc sửa) trong lúc chờ duyệt", async () => {
        const box = addBox("box_drift", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal).toBeDefined();

        // Người dùng can thiệp trực tiếp: thay đổi kích thước box trước khi bấm duyệt
        box.dx = 750;

        // Bấm duyệt đề xuất cũ
        const res = await executeRepairProposal(proposal, doc);
        expect(res.success).toBe(false);
        expect(res.error).toContain("proposal-invalidated-by-drift");
        expect(proposal.invalidated).toBe(true);
        // Không được tính lượt sửa khi bị drift từ chối
        expect(profile.executedRepairs).toBe(0);
    });

    // =========================================================================
    // C3-T7: Chạm trần 2 lần sửa vẫn không đạt -> Dừng vĩnh viễn
    // =========================================================================
    test("C3-T7: chạm trần 2 lần sửa vẫn chưa đạt -> dừng vĩnh viễn, cấm đề xuất lần 3", async () => {
        const box = addBox("box_max", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        // Giả lập đã thực thi đủ 2 lần sửa
        profile.executedRepairs = 2;

        const evalResult = await finalizeTaskVerification(doc);
        expect(evalResult?.completable).toBe(false);
        expect(evalResult?.activeProposal).toBeUndefined();
        expect(evalResult?.proposalStopReason).toContain("max-repairs-reached");
    });

    // =========================================================================
    // C3-T8: Chặn tự sửa khi có tiêu chí bắt buộc mang trạng thái unknown
    // =========================================================================
    test("C3-T8: chặn tự sửa khi có tiêu chí bắt buộc mang trạng thái unknown", async () => {
        const box = addBox("box_ok", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-valid",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
            {
                id: "c-unknown",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: ["non-existent-id"],
                expected: { sizeMm: [500, 500, 500] },
                toleranceMm: [2, 2, 2],
            },
        ];

        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const evalResult = await finalizeTaskVerification(doc);
        expect(evalResult?.completable).toBe(false);
        expect(evalResult?.counts.unknown).toBeGreaterThan(0);
        // Có unknown -> TUYỆT ĐỐI KHÔNG sinh đề xuất sửa
        expect(evalResult?.activeProposal).toBeUndefined();
        expect(evalResult?.proposalStopReason).toContain("unknown");
    });

    // =========================================================================
    // C3-T9: Chặn sửa vượt quyền đã duyệt (Router Đợt B chặn)
    // =========================================================================
    test("C3-T9: chặn sửa vượt quyền đã duyệt khi đề xuất tác động vào node ngoài scope", async () => {
        const box = addBox("box_outside", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        // Plan chỉ cấp quyền cho node khác, KHÔNG cấp cho box.id
        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: ["other-node-id"],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal).toBeDefined();

        // Khi thực thi, Cổng Đợt B phát hiện vi phạm quyền và chặn đứng
        const res = await executeRepairProposal(proposal, doc);
        expect(res.success).toBe(false);
        expect(res.error).toContain("permission-denied");
    });

    // =========================================================================
    // C3-T10: Chặn bấm duyệt lặp (Anti-Double-Click / 2 yêu cầu đồng thời)
    // =========================================================================
    test("C3-T10: chặn duyệt lặp hoặc đồng thời qua mutex isRepairExecuting (giữ nguyên số lượt tính đúng 1)", async () => {
        const box = addBox("box_concurrent", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal).toBeDefined();

        // Chạy đồng thời 2 yêu cầu duyệt cho cùng 1 đề xuất theo proposalId
        const [res1, res2] = await Promise.all([
            executeRepairProposal(proposal.proposalId, doc),
            executeRepairProposal(proposal.proposalId, doc),
        ]);

        // Đúng 1 yêu cầu thành công, yêu cầu thứ 2 bị chặn bởi mutex hoặc cờ executed
        const successes = [res1.success, res2.success].filter(Boolean).length;
        const failures = [res1.success, res2.success].filter((s) => !s).length;
        expect(successes).toBe(1);
        expect(failures).toBe(1);

        // Chứng minh hình học chỉ sửa 1 lần lên 800 và số lượt chỉ tính đúng 1
        expect(box.dx).toBe(800);
        expect(getTaskProfile()?.executedRepairs).toBe(1);
    });

    test("C3-reject-1: từ chối gọi tầng thực thi với đề xuất cũ khi đã có đề xuất mới (giữ nguyên hình học và số lượt)", async () => {
        const box = addBox("box_stale", 700, 200, 100);
        const criteria1: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];
        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria: criteria1,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const oldProposal = eval1!.activeProposal!;
        expect(oldProposal).toBeDefined();

        // Bây giờ phát sinh một đề xuất mới (ví dụ khi cập nhật tiêu chí mới trên task)
        const criteria2: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [850, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];
        profile.criteria = criteria2;
        const eval2 = await finalizeTaskVerification(doc);
        const newProposal = eval2!.activeProposal!;
        expect(newProposal).toBeDefined();
        expect(newProposal.proposalId).not.toBe(oldProposal.proposalId);

        // Gọi tầng thực thi với proposalId của đề xuất cũ
        const res = await executeRepairProposal(oldProposal.proposalId, doc);
        expect(res.success).toBe(false);
        expect(res.error).toContain("stale-proposal");

        // Gọi tầng thực thi với object đề xuất cũ
        const resObj = await executeRepairProposal(oldProposal, doc);
        expect(resObj.success).toBe(false);
        expect(resObj.error).toContain("stale-proposal");

        // Chứng minh hình học và số lượt giữ nguyên
        expect(box.dx).toBe(700);
        expect(getTaskProfile()?.executedRepairs).toBe(0);
    });

    test("C3-reject-2: từ chối đề xuất có attemptIndex sai lệch với lượt kế tiếp của tác vụ (giữ nguyên hình học và số lượt)", async () => {
        const box = addBox("box_attempt", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];
        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal.attemptIndex).toBe(1);

        // Giả mạo đối tượng proposal với attemptIndex: 2 (trong khi tác vụ chưa chạy lần nào, kế tiếp phải là 1)
        const forgedProposal = { ...proposal, attemptIndex: 2 };
        const res = await executeRepairProposal(forgedProposal, doc);
        expect(res.success).toBe(false);
        expect(res.error).toContain("invalid-attempt-index");

        // Chứng minh hình học và số lượt giữ nguyên
        expect(box.dx).toBe(700);
        expect(getTaskProfile()?.executedRepairs).toBe(0);
    });

    test("C3-reject-3: từ chối khi tham số đề xuất bị sửa sau khi hiện thẻ (tampered toolArgs) (giữ nguyên hình học và số lượt)", async () => {
        const box = addBox("box_tamper", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];
        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal.toolArgs).toEqual({ id: box.id, properties: { dx: 800 } });

        // Đối tượng từ client bị can thiệp/tampered: sửa dx từ 800 lên 9999
        const tamperedProposal = {
            ...proposal,
            toolArgs: { id: box.id, properties: { dx: 9999 } },
        };
        const res = await executeRepairProposal(tamperedProposal, doc);
        expect(res.success).toBe(false);
        expect(res.error).toContain("tampered-proposal");

        // Chứng minh hình học và số lượt giữ nguyên (không bị đổi thành 9999 hay 800)
        expect(box.dx).toBe(700);
        expect(getTaskProfile()?.executedRepairs).toBe(0);
    });

    test("C3-reject-4: từ chối thực thi đề xuất đã bị người dùng từ chối (giữ nguyên hình học và số lượt)", async () => {
        const box = addBox("box_rejected", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];
        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal).toBeDefined();

        // Người dùng bấm Từ chối đề xuất
        rejectRepairProposal(proposal.proposalId);

        // Cố thực thi đề xuất đã từ chối (qua proposalId hoặc object)
        const res = await executeRepairProposal(proposal.proposalId, doc);
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/proposal-rejected|stale-proposal|proposal-invalidated/);

        // Chứng minh hình học và số lượt giữ nguyên
        expect(box.dx).toBe(700);
        expect(getTaskProfile()?.executedRepairs).toBe(0);
    });

    // =========================================================================
    // Bổ sung: Đối tượng EditableShapeNode từ chối sửa kích thước tự động
    // =========================================================================
    test("C3-extra: từ chối sửa kích thước cho đối tượng EditableShapeNode", async () => {
        const editBox = addEditableBox("edit_box", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [editBox.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [editBox.id],
            criteria,
        });

        const evalResult = await finalizeTaskVerification(doc);
        expect(evalResult?.completable).toBe(false);
        // EditableShapeNode không có tham số dx/dy/dz -> dừng với lý do rõ ràng
        expect(evalResult?.activeProposal).toBeUndefined();
        expect(evalResult?.proposalStopReason).toContain("EditableShapeNode");
    });

    // =========================================================================
    // Bổ sung: Ghi thành công nhưng đo lại bị lỗi -> VẪN TÍNH LƯỢT SỬA
    // =========================================================================
    test("C3-extra: ghi thành công nhưng lần đo sau bị hủy/lỗi -> vẫn tính lượt sửa", async () => {
        const box = addBox("box_measure_throw", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;

        // Gọi executeRepairProposal với remeasureFn bị throw
        const res = await executeRepairProposal(proposal, doc, async () => {
            throw new Error("mô phỏng hủy đo sau khi ghi");
        });

        // Kết quả ghi vẫn thành công, báo lỗi đo sau
        expect(res.success).toBe(true);
        expect(res.error).toContain("ghi-thanh-cong-nhung-do-lai-loi");
        // QUAN TRỌNG: Quota vẫn bị trừ đúng 1 lượt vì đã ghi thành công vào model!
        expect(profile.executedRepairs).toBe(1);
    });

    // =========================================================================
    // Bổ sung: Đổi quy tắc thiết kế trong lúc chờ duyệt -> Từ chối
    // =========================================================================
    test("C3-extra: đổi quy tắc thiết kế trong lúc chờ duyệt -> từ chối do rules drift", async () => {
        const box = addBox("box_rules_drift", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        const profile = approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        const eval1 = await finalizeTaskVerification(doc);
        const proposal = eval1!.activeProposal!;
        expect(proposal).toBeDefined();

        // Thay đổi rules trong lúc chờ duyệt
        saveDocumentDesignRules(doc.id, {
            version: 1,
            scope: "document",
            guidanceMarkdown: "Cập nhật quy tắc mới trong lúc chờ",
            contentRevision: 99,
        });

        const res = await executeRepairProposal(proposal, doc);
        expect(res.success).toBe(false);
        expect(res.error).toContain("quy tắc thiết kế đã thay đổi");
        expect(profile.executedRepairs).toBe(0);
    });

    // =========================================================================
    // Luồng đầy đủ qua ChatPanel với kernel WASM thật
    // =========================================================================
    test("C3-flow: luồng đầy đủ qua ChatPanel với kernel WASM thật (đo -> hiện đề xuất sửa -> bấm Duyệt sửa -> đo lại đạt hoàn tất)", async () => {
        const { ChatPanel } = await import("../../src/chatPanel");
        const panel = new ChatPanel();
        document.body.appendChild(panel);

        const box = addBox("panel_box", 700, 200, 100);
        const criteria: CriterionSpec[] = [
            {
                id: "c-dim",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [box.id],
                expected: { sizeMm: [800, 200, 100] },
                toleranceMm: [2, 2, 2],
            },
        ];

        approveTaskPlan({
            documentId: doc.id,
            allowedModifiedNodeIds: [box.id],
            criteria,
        });

        // Kích hoạt đo kiểm lần 1 trên kernel thật
        await finalizeTaskVerification(doc);

        const card =
            panel.querySelector("[class*=governanceCard]") || panel.querySelector("[class*=governanceInner]");
        expect(card).not.toBeNull();
        expect(panel.textContent).toContain("⏳ CHƯA HOÀN TẤT");
        expect(panel.textContent).toContain("Đề xuất sửa sai lệch (Lần 1/2)");
        expect(panel.textContent).toContain("dx: 700 → 800 mm");

        // Tìm nút "Duyệt sửa" trên ChatPanel
        const approveBtn = Array.from(panel.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Duyệt sửa",
        );
        expect(approveBtn).toBeDefined();

        // Người dùng click Duyệt sửa trên ChatPanel UI
        approveBtn!.click();

        // Đợi async execution hoàn thành
        await new Promise((r) => setTimeout(r, 120));

        // Kiểm tra kết quả sau khi duyệt sửa qua UI ChatPanel
        expect(box.dx).toBe(800);
        expect(panel.textContent).toContain("✔ HOÀN TẤT");
        expect(panel.textContent).not.toContain("⏳ CHƯA HOÀN TẤT");
        expect(getTaskProfile()?.executedRepairs).toBe(1);

        panel.remove();
    });
});
