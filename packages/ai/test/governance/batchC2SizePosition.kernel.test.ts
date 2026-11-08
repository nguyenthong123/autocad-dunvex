// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { EditableShapeNode, Matrix4, Plane, Result, XYZ } from "@chili3d/core";
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
    finalizeTaskVerification,
    getGovernanceStatus,
    getLatestEvidence,
    historyMarkOf,
    invalidateEvidenceForNodeIds,
    positionMatchRunner,
    recordCriterionEvidence,
    recordTaskOwnedNodes,
    registerDefaultGeometryRunners,
    resetTaskProfileForTests,
    resetVerificationForTests,
    runTaskCriterionChecks,
    subjectsSignatureOf,
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

    test("NGOẠI BIÊN router: sửa hình không gọi invalidate → đọc lại stale, đo lại thì phục hồi", async () => {
        const node = addBox("slab", 800, 300, 2500);
        approveTaskPlan({ taskId: "c2-ext", allowedModifiedNodeIds: [node.id] }, doc);
        defineTaskCriteria("c2-ext", [
            {
                id: "kich",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [node.id],
                expected: { sizeMm: [800, 300, 2500] },
                toleranceMm: [2, 2, 2],
                source: "yêu cầu: tấm 800×300×2500 ±2 mm",
            },
        ]);
        const before = await runTaskCriterionChecks("c2-ext", doc);
        expect(before.completable).toBe(true);

        // Như thao tác trên UI / lệnh ngoài agent: ĐỔI TRANSFORM thôi —
        // không router, không invalidateEvidenceForNodeIds, không run lại check.
        node.transform = Matrix4.fromTranslation(0, 500, 0);

        const after = evaluateTaskCriteria("c2-ext", doc);
        expect(after.rows[0].status).toBe("unknown");
        expect(after.rows[0].stale).toBe(true);
        expect(after.rows[0].reason).toMatch(/state-changed|history-changed/);
        expect(after.completable).toBe(false);

        // Đo lại thật sự → bằng chứng mới gắn marker mới; kích thước không đổi nên pass hợp lệ trở lại.
        const repaired = await runTaskCriterionChecks("c2-ext", doc);
        expect(repaired.rows[0].status).toBe("pass");
        expect(repaired.completable).toBe(true);
    });

    test("C1.2: KHOÉT LỖ lệch tâm — hộp bao GIỮ NGUYÊN, binding vẫn lật sang unknown rồi phục hồi khi đo lại", async () => {
        const node = addBox("panel", 800, 300, 2500);
        approveTaskPlan({ taskId: "c2-hole", allowedModifiedNodeIds: [node.id] }, doc);
        defineTaskCriteria("c2-hole", [
            {
                id: "kich",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: [node.id],
                expected: { sizeMm: [800, 300, 2500] },
                toleranceMm: [2, 2, 2],
                source: "yêu cầu: tấm 800×300×2500 ±2 mm (chỉ hộp bao)",
            },
        ]);
        const before = await runTaskCriterionChecks("c2-hole", doc);
        expect(before.completable).toBe(true);
        const boundSig = getLatestEvidence("c2-hole", "kich")?.stateSignature;
        const boundMark = getLatestEvidence("c2-hole", "kich")?.historyMark;
        expect(boundSig).toBeTruthy();

        // Khoét lỗ trụ xiên qua thân — hộp bao ngoài KHÔNG đổi, volume + shape rebuild.
        const drill = factory.cylinder(new XYZ(0, 0, 1), new XYZ(100, 50, -10), 20, 2520);
        expect(drill.isOk).toBe(true);
        const holed = factory.booleanCut([node.shape.value], [drill.value], true);
        expect(holed.isOk).toBe(true);

        // Gán công khai qua setter, NGOÀI Transaction/History và ngoài router — đường "History khuyết".
        node.shape = holed;

        const after = evaluateTaskCriteria("c2-hole", doc);
        expect(after.rows[0].status).toBe("unknown");
        expect(after.rows[0].stale).toBe(true);
        expect(after.rows[0].reason).toMatch(/state-changed|history-changed/);
        expect(after.completable).toBe(false);
        // Bằng chứng cơ chế: signature (identity + volume) CHẮC CHẮN lật dù mọi cạnh hộp bao y nguyên.
        expect(subjectsSignatureOf(doc, [node.id])).not.toBe(boundSig);
        if (historyMarkOf(doc) === boundMark) {
            // Đường History khuyết → chính state signature phải là lý do stale:
            expect(after.rows[0].reason).toContain("state-changed");
        }

        // Đo lại: phép kiểm hộp bao vẫn đúng trên hình mới → pass với binding mới, không phải pass cũ.
        const re = await runTaskCriterionChecks("c2-hole", doc);
        expect(re.rows[0].status).toBe("pass");
        expect(re.completable).toBe(true);
        const sizeAfterHole = independentBox(node).size;
        expect(sizeAfterHole[0]).toBeCloseTo(800, 3); // hộp bao giữ nguyên thật
        expect(sizeAfterHole[2]).toBeCloseTo(2500, 3);
    });

    test("C2 runtime kernel: propose criteria→finalize (hint) trên hình THẬT→pass; move tiếp → unknown, mất badge", async () => {
        const node = addBox("Tấm C2", 800, 300, 2500);
        registerDefaultGeometryRunners();
        // Plan được duyệt TRƯỚC khi có id kết quả: criteria mang hint, không id.
        const profile = approveTaskPlan(
            {
                taskId: "c2-run-k",
                allowedModifiedNodeIds: [],
                criteria: [
                    {
                        id: "kich",
                        kind: "dimension_match",
                        required: true,
                        subjectNodeIds: [],
                        subjectHint: "Tấm C2",
                        expected: { sizeMm: [800, 300, 2500] },
                        toleranceMm: [2, 2, 2],
                        source: "yêu cầu: tấm 800×300×2500 mm ±2",
                    },
                ],
            },
            doc,
        );
        // Router ghi thật sẽ tự record; bản sao unit: node do task tạo.
        recordTaskOwnedNodes([node.id], doc);

        const done = await finalizeTaskVerification(doc);
        expect(done).toBeTruthy();
        expect(done!.rows[0].status).toBe("pass"); // runner THẬT đo kernel THẬT qua hint resolve
        expect(done!.rows[0].measured?.[`${node.id}:sizeMm`]?.[0]).toBeCloseTo(800, 2);
        expect(done!.completable).toBe(true);

        // Người dùng (không phải agent) di chuyển tấm — cùng turn app:
        node.transform = Matrix4.fromTranslation(0, 400, 0);
        const after = evaluateTaskCriteria("c2-run-k", doc);
        expect(after.rows[0].status).toBe("unknown");
        expect(after.completable).toBe(false); // badge hoàn tất rơi ngay khi đọc lại
    });

    test("C2 guard (nguồn): runner thật + hint không resolve → unknown 'không có đối tượng để đo', không pass ảo", async () => {
        const node = addBox("Tấm chuẩn", 800, 300, 2500);
        registerDefaultGeometryRunners();
        approveTaskPlan(
            {
                taskId: "c2-empty",
                allowedModifiedNodeIds: [],
                criteria: [
                    {
                        id: "k",
                        kind: "dimension_match",
                        required: true,
                        subjectNodeIds: [],
                        subjectHint: "Không tồn tại",
                        expected: { sizeMm: [800, 300, 2500] },
                        toleranceMm: [2, 2, 2],
                    },
                ],
            },
            doc,
        );
        recordTaskOwnedNodes([node.id], doc);
        const ev = await finalizeTaskVerification(doc);
        expect(ev!.rows[0].status).toBe("unknown");
        expect(ev!.rows[0].reason).toContain("không có đối tượng để đo");
        expect(ev!.completable).toBe(false);
    });

    test("C2 guard: hai node cùng khớp hint → unknown cần làm rõ đối tượng; có ID xác định → dùng đúng ID", async () => {
        const box1 = addBox("Tấm trùng", 800, 300, 2500);
        const box2 = addBox("Tấm trùng", 800, 300, 2500);
        registerDefaultGeometryRunners();
        approveTaskPlan(
            {
                taskId: "c2-duplicate-hint",
                allowedModifiedNodeIds: [],
                criteria: [
                    {
                        id: "k-hint",
                        kind: "dimension_match",
                        required: true,
                        subjectNodeIds: [],
                        subjectHint: "Tấm trùng",
                        expected: { sizeMm: [800, 300, 2500] },
                        toleranceMm: [2, 2, 2],
                    },
                    {
                        id: "k-id",
                        kind: "dimension_match",
                        required: true,
                        subjectNodeIds: [box1.id],
                        subjectHint: "Tấm trùng",
                        expected: { sizeMm: [800, 300, 2500] },
                        toleranceMm: [2, 2, 2],
                    },
                ],
            },
            doc,
        );
        recordTaskOwnedNodes([box1.id, box2.id], doc);
        const ev = await finalizeTaskVerification(doc);
        expect(ev).toBeTruthy();

        const rowHint = ev!.rows.find((r) => r.spec.id === "k-hint")!;
        expect(rowHint.status).toBe("unknown");
        expect(rowHint.reason).toContain("cần làm rõ đối tượng");

        const rowId = ev!.rows.find((r) => r.spec.id === "k-id")!;
        expect(rowId.status).toBe("pass");
        expect(rowId.spec.subjectNodeIds).toEqual([box1.id]);

        expect(ev!.completable).toBe(false);
    });

    test("runners công khai giới hạn: bbox không tự tuyên bố chứng minh lỗ/hình dạng", () => {
        expect(dimensionMatchRunner.kind).toBe("dimension_match");
        expect(dimensionMatchRunner.supportNotes).toContain("hộp bao");
        expect(dimensionMatchRunner.supportNotes).toContain("KHÔNG chứng minh");
        expect(positionMatchRunner.supportNotes).toContain("tâm hộp bao");
        expect(positionMatchRunner.supportNotes).toContain("Không suy ra quan hệ xuyên");
    });

    test("C1.3 kernel: ghi pass trực tiếp trên subject không tồn tại → runner proof hạ về unknown mọi lần đọc", () => {
        approveTaskPlan({ taskId: "c2-ghost", allowedModifiedNodeIds: ["anything"] }, doc);
        defineTaskCriteria("c2-ghost", [
            {
                id: "k",
                kind: "dimension_match",
                required: true,
                subjectNodeIds: ["ghost-node"],
                expected: { sizeMm: [1, 1, 1] },
                toleranceMm: [0.1, 0.1, 0.1],
            },
        ]);
        // Đường ghi TRỰC TIẾP (bỏ qua runner): pass tự khai trên subject ma — chứng minh evaluate
        // không tin lời khai mà tin MARKER đọc lại được từ chính app.
        recordCriterionEvidence({
            taskId: "c2-ghost",
            criterionId: "k",
            kind: "dimension_match",
            subjectNodeIds: ["ghost-node"],
            status: "pass",
            reason: "tự khai",
        });
        const ev = evaluateTaskCriteria("c2-ghost", doc);
        expect(ev.rows[0].status).toBe("unknown");
        expect(ev.rows[0].reason).toContain("state-unverifiable");
        expect(ev.completable).toBe(false);
        expect(evaluateTaskCriteria("c2-ghost", doc).rows[0].status).toBe("unknown");
    });

    test("registerDefaultGeometryRunners → status active đúng 2 bộ kiểm", () => {
        expect(getGovernanceStatus().criteriaVerification).toBe("active");
        expect(getGovernanceStatus().runnerKinds).toEqual(["dimension_match", "position_match"]);
    });
});
