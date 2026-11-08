// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { EditableShapeNode, Matrix4, Plane, Result } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { afterEach, beforeAll, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
    approveTaskPlan,
    type CriterionSpec,
    clearDesignRulesForTests,
    clearTaskProfile,
    defineTaskCriteria,
    dimensionMatchRunner,
    evaluateTaskCriteria,
    getGovernanceStatus,
    invalidateEvidenceForNodeIds,
    positionMatchRunner,
    registerDefaultGeometryRunners,
    resetTaskProfileForTests,
    resetVerificationForTests,
    runTaskCriterionChecks,
} from "../../src/governance";

// Real OCCT/WASM kernel (same pattern as devAppDoorFlow.kernel) — geometry truth,
// not a mocked measurement.
const WASM_PATH = path.resolve(__dirname, "../../../wasm/lib/chili-wasm.wasm");
const WASM_BINARY = readFileSync(WASM_PATH);

describe("TASK-40 Đợt C2 prep — kích thước & vị trí trên kernel thật", () => {
    let doc: TestDocument;
    let factory: ShapeFactory;

    beforeAll(async () => {
        await initWasm({ wasmBinary: WASM_BINARY });
        factory = new ShapeFactory();
    });

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        clearTaskProfile();
        doc = new TestDocument({ selection: { clearSelection: rs.fn() } as any });
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

    function addBox(
        name: string,
        dx: number,
        dy: number,
        dz: number,
        transform?: Matrix4,
    ): EditableShapeNode {
        const res = factory.box(Plane.XY, dx, dy, dz);
        expect(res.isOk).toBe(true);
        const node = new EditableShapeNode({ document: doc, name, shape: res.value });
        if (transform) {
            node.transform = transform;
        }
        doc.modelManager.addNode(node);
        return node;
    }

    /** Independent bbox read straight from the kernel — the runner must agree with this. */
    function independentBox(node: EditableShapeNode) {
        const world = node.shape.value.transformedMul(node.worldTransform()).boundingBox();
        return {
            size: [world.max.x - world.min.x, world.max.y - world.min.y, world.max.z - world.min.z],
            center: [
                (world.min.x + world.max.x) / 2,
                (world.min.y + world.max.y) / 2,
                (world.min.z + world.max.z) / 2,
            ],
        };
    }

    async function checkOne(taskId: string, criterion: CriterionSpec) {
        approveTaskPlan({ taskId, allowedModifiedNodeIds: criterion.subjectNodeIds }, doc);
        defineTaskCriteria(taskId, [criterion]);
        return runTaskCriterionChecks(taskId, doc);
    }

    const dimensionSpec = (
        nodeId: string,
        size: number[],
        toleranceMm?: number[],
        id = "dim",
    ): CriterionSpec => ({
        id,
        kind: "dimension_match",
        required: true,
        subjectNodeIds: [nodeId],
        expected: { sizeMm: size },
        toleranceMm,
    });

    const positionSpec = (nodeId: string, center: number[], toleranceMm?: number[]): CriterionSpec => ({
        id: "pos",
        kind: "position_match",
        required: true,
        subjectNodeIds: [nodeId],
        expected: { centerMm: center },
        toleranceMm,
    });

    test("kernel box đúng kích thước + dung sai task → pass với số đo khớp phép kiểm độc lập", async () => {
        const node = addBox("wall", 800, 300, 2500);
        const truth = independentBox(node);
        const evaluation = await checkOne("c2-size-ok", dimensionSpec("wall", truth.size, [2, 2, 2]));
        expect(evaluation.rows[0].status).toBe("pass");
        expect(evaluation.completable).toBe(true);
        const measured = evaluation.rows[0].measured!["wall:sizeMm"];
        measured.forEach((v, i) => expect(Math.abs(v - truth.size[i])).toBeLessThan(0.001));
    });

    test("hình hợp lệ nhưng SAI KÍCH THƯỚC → fail đúng trục, không pass giả", async () => {
        const node = addBox("wall", 800, 300, 2500);
        const truth = independentBox(node);
        const wrong = [...truth.size];
        wrong[0] += 100; // mong 900 nhưng thực tế 800 — hình vẫn hợp lệ, chỉ số đo sai yêu cầu
        const evaluation = await checkOne("c2-size-bad", dimensionSpec("wall", wrong, [10, 10, 10]));
        expect(evaluation.rows[0].status).toBe("fail");
        expect(evaluation.rows[0].reason).toContain("trục X");
        expect(evaluation.completable).toBe(false);
    });

    test("đúng kích thước nhưng SAI VỊ TRÍ (dịch +100 mm X) → position fail, size vẫn pass", async () => {
        const node = addBox("wall", 800, 300, 2500, Matrix4.fromTranslation(100, 0, 0));
        const truth = independentBox(node);
        const sizeEval = await checkOne("c2-pos-size", dimensionSpec("wall", truth.size, [2, 2, 2]));
        expect(sizeEval.rows[0].status).toBe("pass");

        // Vị trí mong đợi là vị trí CHƯA dịch: hình đã bị đẩy +100 mm → phải fail trục X
        const expectedAtOrigin = [truth.center[0] - 100, truth.center[1], truth.center[2]];
        const posEval = await checkOne("c2-pos-bad", positionSpec("wall", expectedAtOrigin, [5, 5, 5]));
        expect(posEval.rows[0].status).toBe("fail");
        expect(posEval.rows[0].reason).toContain("trục X");
        expect(posEval.completable).toBe(false);
    });

    test("thiếu dữ liệu kiểm chứng → unknown, không bao giờ pass im lặng", async () => {
        addBox("wall", 800, 300, 2500);
        // không dung sai — không có bảng chung nào được áp để tự suy
        const noTol = await checkOne("c2-unknown-1", dimensionSpec("wall", [800, 300, 2500]));
        expect(noTol.rows[0].status).toBe("unknown");
        expect(noTol.rows[0].reason).toContain("dung sai");

        // expected chứa NaN
        const nanEval = await checkOne("c2-unknown-2", dimensionSpec("wall", [NaN, 300, 2500], [2, 2, 2]));
        expect(nanEval.rows[0].status).toBe("unknown");

        // subject không tồn tại trong tài liệu
        const ghost = await checkOne(
            "c2-unknown-3",
            dimensionSpec("missing-node", [800, 300, 2500], [2, 2, 2]),
        );
        expect(ghost.rows[0].status).toBe("unknown");
        expect(ghost.rows[0].reason).toContain("không tìm thấy");
    });

    test("sau khi sửa hình, pass cũ mất hiệu lực — đo lại phải cho ra kết quả MỚI", async () => {
        const node = addBox("wall", 800, 300, 2500);
        const truth = independentBox(node);
        const evaluation = await checkOne("c2-inval", dimensionSpec("wall", truth.size, [2, 2, 2]));
        expect(evaluation.completable).toBe(true);

        // Sửa hình thật qua setter của node (kernel cắt lại box 900) + invalidate như router làm
        const bigger = factory.box(Plane.XY, 900, 300, 2500);
        expect(bigger.isOk).toBe(true);
        node.shape = Result.ok(bigger.value);
        invalidateEvidenceForNodeIds(["wall"], "transform/kích thước đã đổi");
        const stale = evaluateTaskCriteria("c2-inval", doc);
        expect(stale.rows[0].status).toBe("unknown");
        expect(stale.rows[0].stale).toBe(true);
        expect(stale.completable).toBe(false);

        // kiểm lại: so với mong đợi CŨ (800) → fail, chứng minh pass cũ không được dùng lại
        const rechecked = await runTaskCriterionChecks("c2-inval", doc);
        expect(rechecked.rows[0].status).toBe("fail");
        expect(rechecked.rows[0].reason).toContain("trục X");
        expect(rechecked.completable).toBe(false);
    });

    test("runners công khai giới hạn: bbox không tự tuyên bố chứng minh lỗ/hình dạng", () => {
        expect(dimensionMatchRunner.kind).toBe("dimension_match");
        expect(dimensionMatchRunner.supportNotes).toContain("hộp bao");
        expect(dimensionMatchRunner.supportNotes).toContain("KHÔNG chứng minh");
        expect(positionMatchRunner.supportNotes).toContain("tâm hộp bao");
        expect(positionMatchRunner.supportNotes).toContain("Không suy ra quan hệ xuyên");
    });

    test("registerDefaultGeometryRunners → status active đúng 2 bộ kiểm", () => {
        expect(getGovernanceStatus().criteriaVerification).toBe("active");
        expect(getGovernanceStatus().runnerKinds).toEqual(["dimension_match", "position_match"]);
    });
});
