// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IDocument, Id, type INode, Matrix4, Plane, XYZ } from "@chili3d/core";
import { findNode, getDocument } from "../../tools/documentContext";
import { checkToolPermission } from "../permissionGate";
import { rulesFingerprintFor } from "../rulesStore";
import { getActiveTaskProfile, getTaskProfile, getTaskProfileById } from "../taskProfile";
import { historyMarkOf, subjectsSignatureOf } from "./stateMarker";
import type { CriterionStructuredDelta, RepairProposal, TaskCriteriaEvaluation } from "./types";

const proposalSnapshotStore = new Map<string, Readonly<RepairProposal>>();

export function getProposalSnapshot(proposalId: string): Readonly<RepairProposal> | undefined {
    return proposalSnapshotStore.get(proposalId);
}

export function clearProposalSnapshotsForTests(): void {
    proposalSnapshotStore.clear();
}

export function registerProposalSnapshotForTests(proposal: RepairProposal): void {
    proposalSnapshotStore.set(proposal.proposalId, Object.freeze({ ...proposal }));
}

export function rejectRepairProposal(proposalId: string): void {
    const snapshot = proposalSnapshotStore.get(proposalId);
    if (snapshot) {
        (snapshot as { invalidated?: boolean }).invalidated = true;
        (snapshot as { invalidationReason?: string }).invalidationReason =
            "proposal-rejected: người dùng đã từ chối đề xuất sửa";
    }
    const profile = getTaskProfile();
    if (profile && profile.activeProposal?.proposalId === proposalId) {
        profile.activeProposal = undefined;
    }
}

export interface NodeRepairInspection {
    nodeId: string;
    nodeType: string;
    canRepairSize: boolean;
    sizeRepairReason?: string;
    anchorPoint?: [number, number, number];
    axisToParamMap?: { X?: string; Y?: string; Z?: string };
    canTranslate: boolean;
    translateReason?: string;
}

/** Check if a 4x4 matrix is a pure translation (linear 3x3 is identity within eps). */
export function isPureTranslation(matrix: Matrix4, eps = 1e-4): boolean {
    const arr = matrix.toArray();
    if (Math.abs(arr[0] - 1) > eps || Math.abs(arr[5] - 1) > eps || Math.abs(arr[10] - 1) > eps) return false;
    if (Math.abs(arr[1]) > eps || Math.abs(arr[2]) > eps || Math.abs(arr[3]) > eps) return false;
    if (Math.abs(arr[4]) > eps || Math.abs(arr[6]) > eps || Math.abs(arr[7]) > eps) return false;
    if (Math.abs(arr[8]) > eps || Math.abs(arr[9]) > eps || Math.abs(arr[11]) > eps) return false;
    if (Math.abs(arr[15] - 1) > eps) return false;
    return true;
}

/**
 * Inspect whether a node in the document has verified size-parameter mapping and anchor point,
 * and whether translation transform is proven.
 */
export function inspectNodeForRepair(doc: IDocument, nodeId: string): NodeRepairInspection {
    const node = findNode(doc, nodeId);
    if (!node) {
        return {
            nodeId,
            nodeType: "unknown",
            canRepairSize: false,
            sizeRepairReason: `không tìm thấy đối tượng "${nodeId}" trong tài liệu`,
            canTranslate: false,
            translateReason: `không tìm thấy đối tượng "${nodeId}" trong tài liệu`,
        };
    }

    const nodeType = node.constructor.name;

    // 1. Kiểm tra khả năng dịch chuyển (translation proof)
    let canTranslate = true;
    let translateReason: string | undefined;

    if (!("transform" in node) || !((node as { transform: unknown }).transform instanceof Matrix4)) {
        canTranslate = false;
        translateReason = `đối tượng "${nodeId}" không có thuộc tính transform hợp lệ`;
    } else {
        const localTransform = (node as { transform: Matrix4 }).transform;
        if (!isPureTranslation(localTransform)) {
            canTranslate = false;
            translateReason =
                "unsupported-transform-mapping: đối tượng có phép xoay hoặc scale phi đồng nhất chưa chứng minh được chuyển đổi tọa độ world-to-local";
        } else {
            // Kiểm tra phân cấp đối tượng cha
            let current: INode | undefined = node.parent;
            while (current && current !== doc.modelManager.rootNode) {
                if (
                    "transform" in current &&
                    (current as { transform: unknown }).transform instanceof Matrix4
                ) {
                    if (!isPureTranslation((current as { transform: Matrix4 }).transform)) {
                        canTranslate = false;
                        translateReason =
                            "unsupported-transform-mapping: đối tượng cha có phép xoay/scale phân cấp chưa chứng minh được chuyển đổi tọa độ world-to-local";
                        break;
                    }
                }
                current = current.parent;
            }
        }
    }

    // 2. Kiểm tra khả năng sửa kích thước (size repair mapping & anchor)
    if (nodeType === "EditableShapeNode") {
        return {
            nodeId,
            nodeType,
            canRepairSize: false,
            sizeRepairReason:
                "unsupported-size-repair: đối tượng thuộc loại EditableShapeNode không có tham số kích thước trực giao đã kiểm chứng (dx/dy/dz)",
            canTranslate,
            translateReason,
        };
    }

    // Kiểm tra BoxNode (hoặc node có thuộc tính dx, dy, dz và plane)
    const hasBoxParams =
        typeof (node as { dx?: unknown }).dx === "number" &&
        typeof (node as { dy?: unknown }).dy === "number" &&
        typeof (node as { dz?: unknown }).dz === "number" &&
        "plane" in node &&
        (node as { plane: unknown }).plane instanceof Plane;

    if (nodeType === "BoxNode" || hasBoxParams) {
        const plane = (node as unknown as { plane: Plane }).plane;
        const eps = 1e-4;
        const normalZ =
            Math.abs(plane.normal.z - 1) < eps &&
            Math.abs(plane.normal.x) < eps &&
            Math.abs(plane.normal.y) < eps;
        const xvecX =
            Math.abs(plane.xvec.x - 1) < eps && Math.abs(plane.xvec.y) < eps && Math.abs(plane.xvec.z) < eps;
        const yvecY =
            Math.abs(plane.yvec.y - 1) < eps && Math.abs(plane.yvec.x) < eps && Math.abs(plane.yvec.z) < eps;

        if (!normalZ || !xvecX || !yvecY) {
            return {
                nodeId,
                nodeType,
                canRepairSize: false,
                sizeRepairReason:
                    "unsupported-plane-orientation: mặt phẳng BoxNode không song song với các trục tọa độ thế giới",
                canTranslate,
                translateReason,
            };
        }

        return {
            nodeId,
            nodeType,
            canRepairSize: true,
            anchorPoint: [plane.origin.x, plane.origin.y, plane.origin.z],
            axisToParamMap: { X: "dx", Y: "dy", Z: "dz" },
            canTranslate,
            translateReason,
        };
    }

    return {
        nodeId,
        nodeType,
        canRepairSize: false,
        sizeRepairReason: `unsupported-size-repair: đối tượng thuộc loại ${nodeType} chưa có ánh xạ tham số kích thước trực giao đã kiểm chứng`,
        canTranslate,
        translateReason,
    };
}

/**
 * Noise threshold: min(0.05 mm, 0.05 * tolerance).
 * If tolerance === 0, defaults to kernel numerical precision (1e-4 mm = 0.1 micron).
 */
export function noiseThreshold(toleranceMm: number): number {
    if (toleranceMm <= 0) {
        return 1e-4;
    }
    return Math.min(0.05, 0.05 * toleranceMm);
}

/**
 * Evaluate repair progress/convergence for Attempt 2:
 * 1. At least 1 required delta improved by more than eps_noise.
 * 2. No required delta degraded by more than eps_noise.
 * 3. Failing criteria count does not increase.
 */
export function evaluateRepairConvergence(
    currentDeltas: readonly CriterionStructuredDelta[],
    prevDeltas: readonly CriterionStructuredDelta[],
    currentFailingCount: number,
    prevFailingCount: number,
): { converged: boolean; reason?: string } {
    if (currentFailingCount > prevFailingCount) {
        return {
            converged: false,
            reason: `non-converging-repair: số lượng tiêu chí không đạt tăng lên sau lần sửa (${currentFailingCount} > ${prevFailingCount})`,
        };
    }

    const prevMap = new Map<string, CriterionStructuredDelta>();
    for (const d of prevDeltas) {
        prevMap.set(`${d.criterionId}:${d.subjectNodeId}:${d.axis}`, d);
    }

    let hasImprovement = false;

    for (const curr of currentDeltas) {
        const key = `${curr.criterionId}:${curr.subjectNodeId}:${curr.axis}`;
        const prev = prevMap.get(key);
        if (!prev) continue;

        const eps = noiseThreshold(curr.toleranceMm);
        const currMagnitude = Math.abs(curr.deltaMm);
        const prevMagnitude = Math.abs(prev.deltaMm);

        // Check degradation: curr > prev + eps
        if (currMagnitude > prevMagnitude + eps) {
            return {
                converged: false,
                reason: `non-converging-repair: sai lệch trục ${curr.axis} của "${curr.subjectNodeId}" xấu đi từ ${prevMagnitude.toFixed(3)} mm lên ${currMagnitude.toFixed(3)} mm (vượt ngưỡng nhiễu ${eps.toFixed(3)} mm) — dừng tự sửa`,
            };
        }

        // Check improvement: curr < prev - eps
        if (currMagnitude < prevMagnitude - eps) {
            hasImprovement = true;
        }
    }

    if (!hasImprovement) {
        return {
            converged: false,
            reason: "non-converging-repair: không có sai lệch bắt buộc nào được cải thiện vượt ngưỡng nhiễu — dừng tự sửa",
        };
    }

    return { converged: true };
}

/**
 * Generate a phased, immutable one-time repair proposal.
 * Phased logic:
 * - If size criteria fail: propose size repair FIRST (Phase 1).
 * - Only if size passes and position fails: propose position translation (Phase 2).
 */
export function generateRepairProposal(
    evaluation: TaskCriteriaEvaluation,
    doc: IDocument,
): { proposal?: RepairProposal; stopReason?: string } {
    const profile = getTaskProfile();
    if (!profile || profile.status !== "active") {
        return { stopReason: "kế hoạch không còn hiệu lực hoặc đã thay đổi" };
    }

    const executedRepairs = profile.executedRepairs ?? 0;
    if (executedRepairs >= 2) {
        return {
            stopReason: "max-repairs-reached: đã thực thi đủ 2/2 lần sửa trên tác vụ gốc — dừng vòng tự động",
        };
    }

    // Check unknown criteria: ANY required unknown stops auto-repair immediately
    const unknownRequired = evaluation.rows.filter((r) => r.spec.required && r.status === "unknown");
    if (unknownRequired.length > 0) {
        return {
            stopReason: `có tiêu chí bắt buộc mang trạng thái unknown (${unknownRequired.map((r) => r.spec.id).join(", ")}) — cần làm rõ đối tượng hoặc quy cách`,
        };
    }

    const failingRows = evaluation.rows.filter((r) => r.spec.required && r.status === "fail");
    if (failingRows.length === 0) {
        return {}; // Everything passing
    }

    // Collect all required deltas
    const currentRequiredDeltas: CriterionStructuredDelta[] = [];
    for (const r of failingRows) {
        if (r.deltas) {
            currentRequiredDeltas.push(...r.deltas);
        }
    }

    // If this is Attempt 2, run convergence check against profile.lastDeltas
    if (executedRepairs === 1 && profile.lastDeltas) {
        const prevFailingCount = profile.lastDeltas.length;
        const convergence = evaluateRepairConvergence(
            currentRequiredDeltas,
            profile.lastDeltas,
            failingRows.length,
            prevFailingCount,
        );
        if (!convergence.converged) {
            return { stopReason: convergence.reason };
        }
    }

    // PHASED REPAIR DECISION:
    // Check if there are failing dimension criteria
    const dimensionFailRows = failingRows.filter((r) => r.spec.kind === "dimension_match");
    const positionFailRows = failingRows.filter((r) => r.spec.kind === "position_match");

    if (dimensionFailRows.length > 0) {
        // PHA 1: Sửa kích thước trước (Size-first)
        const row = dimensionFailRows[0];
        const subjectId = row.spec.subjectNodeIds[0];
        if (!subjectId) {
            return { stopReason: `tiêu chí "${row.spec.id}" không có subjectId xác định` };
        }

        const inspection = inspectNodeForRepair(doc, subjectId);
        if (!inspection.canRepairSize) {
            return { stopReason: inspection.sizeRepairReason };
        }

        const propertiesUpdate: Record<string, number> = {};
        const descriptions: string[] = [];

        for (const delta of row.deltas ?? []) {
            if (delta.subjectNodeId === subjectId && Math.abs(delta.deltaMm) > delta.toleranceMm) {
                const paramName = inspection.axisToParamMap?.[delta.axis];
                if (paramName) {
                    propertiesUpdate[paramName] = delta.expectedMm;
                    descriptions.push(`${paramName}: ${delta.measuredMm} → ${delta.expectedMm} mm`);
                }
            }
        }

        if (Object.keys(propertiesUpdate).length === 0) {
            return { stopReason: "không xác định được tham số kích thước cần sửa" };
        }

        const toolArgs = {
            id: subjectId,
            properties: propertiesUpdate,
        };

        // Nếu đề xuất hiện hành vẫn khớp hoàn toàn trạng thái hình học, quy tắc và nội dung sửa: tái dùng đề xuất ổn định
        if (
            profile.activeProposal &&
            !profile.activeProposal.executed &&
            !profile.activeProposal.invalidated &&
            profile.activeProposal.historyMark === historyMarkOf(doc) &&
            profile.activeProposal.rulesFingerprint === rulesFingerprintFor(doc.id) &&
            profile.activeProposal.stateSignature === subjectsSignatureOf(doc, [subjectId]) &&
            profile.activeProposal.attemptIndex === executedRepairs + 1 &&
            profile.activeProposal.toolName === "set_node_properties" &&
            JSON.stringify(profile.activeProposal.toolArgs) === JSON.stringify(toolArgs)
        ) {
            return { proposal: profile.activeProposal };
        }

        const subjectNode = findNode(doc, subjectId);
        const nodeName = subjectNode?.name ?? subjectId;
        const displayDescription = `Sửa kích thước ${nodeName} (${descriptions.join(", ")})`;

        const proposal: RepairProposal = {
            proposalId: Id.generate(),
            taskId: profile.taskId,
            documentId: doc.id,
            historyMark: historyMarkOf(doc),
            rulesFingerprint: rulesFingerprintFor(doc.id),
            stateSignature: subjectsSignatureOf(doc, [subjectId]),
            subjectNodeIds: [subjectId],
            toolName: "set_node_properties",
            toolArgs,
            displayDescription,
            phase: "size",
            attemptIndex: executedRepairs + 1,
            deltas: currentRequiredDeltas,
            executed: false,
            createdAt: Date.now(),
        };

        const storedProposal: RepairProposal = {
            ...proposal,
            invalidated: false,
            invalidationReason: undefined,
            toolArgs: Object.freeze(JSON.parse(JSON.stringify(proposal.toolArgs))),
            subjectNodeIds: Object.freeze([...proposal.subjectNodeIds]),
            deltas: Object.freeze(proposal.deltas.map((d) => Object.freeze({ ...d }))),
        };
        proposalSnapshotStore.set(storedProposal.proposalId, storedProposal);

        return { proposal: storedProposal };
    }

    if (positionFailRows.length > 0) {
        // PHA 2: Dịch chuyển bù sai lệch vị trí sau (Position follow-up)
        const row = positionFailRows[0];
        const subjectId = row.spec.subjectNodeIds[0];
        if (!subjectId) {
            return { stopReason: `tiêu chí "${row.spec.id}" không có subjectId xác định` };
        }

        const inspection = inspectNodeForRepair(doc, subjectId);
        if (!inspection.canTranslate) {
            return { stopReason: inspection.translateReason };
        }

        const translateVec = { x: 0, y: 0, z: 0 };
        const descriptions: string[] = [];

        for (const delta of row.deltas ?? []) {
            if (delta.subjectNodeId === subjectId && Math.abs(delta.deltaMm) > delta.toleranceMm) {
                // T = -delta
                const correction = -delta.deltaMm;
                if (delta.axis === "X") translateVec.x = correction;
                if (delta.axis === "Y") translateVec.y = correction;
                if (delta.axis === "Z") translateVec.z = correction;
                descriptions.push(`${delta.axis} ${correction > 0 ? "+" : ""}${correction.toFixed(3)} mm`);
            }
        }

        const toolArgs = {
            id: subjectId,
            translate: translateVec,
        };

        // Nếu đề xuất hiện hành vẫn khớp hoàn toàn trạng thái hình học, quy tắc và nội dung sửa: tái dùng đề xuất ổn định
        if (
            profile.activeProposal &&
            !profile.activeProposal.executed &&
            !profile.activeProposal.invalidated &&
            profile.activeProposal.historyMark === historyMarkOf(doc) &&
            profile.activeProposal.rulesFingerprint === rulesFingerprintFor(doc.id) &&
            profile.activeProposal.stateSignature === subjectsSignatureOf(doc, [subjectId]) &&
            profile.activeProposal.attemptIndex === executedRepairs + 1 &&
            profile.activeProposal.toolName === "transform_node" &&
            JSON.stringify(profile.activeProposal.toolArgs) === JSON.stringify(toolArgs)
        ) {
            return { proposal: profile.activeProposal };
        }

        const subjectNode = findNode(doc, subjectId);
        const nodeName = subjectNode?.name ?? subjectId;
        const displayDescription = `Dịch chuyển ${nodeName} (${descriptions.join(", ")}) bù sai lệch vị trí`;

        const proposal: RepairProposal = {
            proposalId: Id.generate(),
            taskId: profile.taskId,
            documentId: doc.id,
            historyMark: historyMarkOf(doc),
            rulesFingerprint: rulesFingerprintFor(doc.id),
            stateSignature: subjectsSignatureOf(doc, [subjectId]),
            subjectNodeIds: [subjectId],
            toolName: "transform_node",
            toolArgs,
            displayDescription,
            phase: "position",
            attemptIndex: executedRepairs + 1,
            deltas: currentRequiredDeltas,
            executed: false,
            createdAt: Date.now(),
        };

        const storedProposal: RepairProposal = {
            ...proposal,
            invalidated: false,
            invalidationReason: undefined,
            toolArgs: Object.freeze(JSON.parse(JSON.stringify(proposal.toolArgs))),
            subjectNodeIds: Object.freeze([...proposal.subjectNodeIds]),
            deltas: Object.freeze(proposal.deltas.map((d) => Object.freeze({ ...d }))),
        };
        proposalSnapshotStore.set(storedProposal.proposalId, storedProposal);

        return { proposal: storedProposal };
    }

    return {};
}

export interface ExecuteRepairTestHooks {
    /** Hook invoked immediately after initial check, before loading tools & write boundary */
    preWriteDelay?: () => Promise<void>;
    /** Hook invoked immediately after tool execution returns, before processing commit & task bindings */
    postWriteDelay?: () => Promise<void>;
    /** Test hook to override or mock the tool handler */
    overrideToolHandler?: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Execute an approved repair proposal:
 * 1. Checks execution mutex and single-use flag.
 * 2. Checks hard lifetime quota (max 2 attempts on root task).
 * 3. Re-verifies state token (doc, history, rules, geometry signature).
 * 4. Checks permission through Batch B router.
 * 5. Loads tools and rechecks state at write boundary.
 * 6. Executes mutation via governedRouter (standard set_node_properties / transform_node).
 * 7. Confirms transaction commit and binds attempt count strictly to root task.
 * 8. Remeasures all criteria via finalizeTaskVerification if root task is still active.
 */
export async function executeRepairProposal(
    proposalOrId: string | RepairProposal,
    doc?: IDocument,
    remeasureFn?: (d: IDocument) => Promise<TaskCriteriaEvaluation | undefined>,
    testHooks?: ExecuteRepairTestHooks,
): Promise<{ success: boolean; error?: string; evaluation?: TaskCriteriaEvaluation }> {
    const activeDoc = doc ?? getDocument();
    if (!activeDoc) {
        return { success: false, error: "không có tài liệu đang mở để thực thi sửa" };
    }

    const profile = getTaskProfile();
    if (!profile || profile.status !== "active") {
        return { success: false, error: "tác vụ không còn hiệu lực hoặc đã thay đổi" };
    }

    // 1. Chống double-click / concurrent approval: Khóa thực thi TRƯỚC bước chờ bất đồng bộ
    if (profile.isRepairExecuting) {
        return {
            success: false,
            error: "concurrent-execution-blocked: thao tác sửa đang được thực thi — vui lòng không bấm lặp",
        };
    }
    profile.isRepairExecuting = true;

    const proposalId = typeof proposalOrId === "string" ? proposalOrId : proposalOrId.proposalId;
    const snapshot = proposalSnapshotStore.get(proposalId);
    if (!snapshot) {
        profile.isRepairExecuting = false;
        return {
            success: false,
            error: "proposal-not-found: không tìm thấy bản ghi đề xuất bất biến trong ứng dụng",
        };
    }

    const rootTaskId = snapshot.taskId;
    const rootProfile =
        getTaskProfileById(rootTaskId) ?? (profile.taskId === rootTaskId ? profile : undefined);
    if (!rootProfile || rootProfile.status !== "active") {
        profile.isRepairExecuting = false;
        return {
            success: false,
            error: "tác vụ gốc không còn hiệu lực hoặc đã thay đổi",
        };
    }
    rootProfile.isRepairExecuting = true;

    try {
        // Nếu truyền đối tượng proposal từ bên ngoài: đối chiếu với snapshot bất biến
        if (typeof proposalOrId !== "string") {
            if (proposalOrId.attemptIndex !== snapshot.attemptIndex) {
                return {
                    success: false,
                    error: `invalid-attempt-index: lượt sửa của đề xuất (${proposalOrId.attemptIndex}) không khớp với snapshot (${snapshot.attemptIndex})`,
                };
            }
            if (
                proposalOrId.toolName !== snapshot.toolName ||
                JSON.stringify(proposalOrId.toolArgs) !== JSON.stringify(snapshot.toolArgs) ||
                proposalOrId.taskId !== snapshot.taskId ||
                proposalOrId.documentId !== snapshot.documentId
            ) {
                return {
                    success: false,
                    error: "tampered-proposal: tham số đề xuất không khớp với bản ghi bất biến do ứng dụng lưu",
                };
            }
        }

        // 2. Chặn dùng lại proposal đã thực thi (single use)
        if (snapshot.executed) {
            return {
                success: false,
                error: "proposal-already-executed: đề xuất này đã được thực thi một lần — không được dùng lại",
            };
        }

        // 3. Chặn đề xuất đã bị hủy (do người dùng từ chối hoặc drift)
        if (snapshot.invalidated) {
            return {
                success: false,
                error:
                    snapshot.invalidationReason ??
                    "proposal-invalidated: đề xuất đã bị hủy hoặc không còn hiệu lực",
            };
        }

        // 4. Đối chiếu với đề xuất hiện hành: chặn đề xuất cũ khi đã có đề xuất mới
        if (rootProfile.activeProposal?.proposalId !== snapshot.proposalId) {
            return {
                success: false,
                error: "stale-proposal: đề xuất cũ khi đã có đề xuất mới hoặc đề xuất không khớp với phiên bản hiện hành",
            };
        }

        // 5. Đối chiếu tác vụ gốc
        if (profile.taskId !== rootTaskId) {
            return { success: false, error: "task-mismatch: đề xuất không thuộc tác vụ gốc hiện hành" };
        }

        // 6. Đối chiếu lượt kế tiếp của tác vụ (attemptIndex)
        const currentExecuted = rootProfile.executedRepairs ?? 0;
        const expectedAttemptIndex = currentExecuted + 1;
        if (snapshot.attemptIndex !== expectedAttemptIndex) {
            return {
                success: false,
                error: `invalid-attempt-index: đề xuất có attemptIndex=${snapshot.attemptIndex} nhưng lượt kế tiếp của tác vụ là ${expectedAttemptIndex}`,
            };
        }

        // 7. Kiểm tra quota trần cứng: tối đa 2 lần sửa trên tác vụ gốc
        if (currentExecuted >= 2) {
            return {
                success: false,
                error: "quota-exceeded: đã thực thi đủ 2/2 lần sửa trên tác vụ gốc — dừng vòng tự động",
            };
        }

        // 8. Token validation sơ bộ: Kiểm tra tài liệu, quy tắc, history, và chữ ký hình học
        if (activeDoc.id !== snapshot.documentId) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: tài liệu đã thay đổi trong lúc chờ duyệt";
            return { success: false, error: snapshot.invalidationReason };
        }
        if (rulesFingerprintFor(activeDoc.id) !== snapshot.rulesFingerprint) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: quy tắc thiết kế đã thay đổi trong lúc chờ duyệt";
            return { success: false, error: snapshot.invalidationReason };
        }
        if (historyMarkOf(activeDoc) !== snapshot.historyMark) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: mô hình đã có thao tác chỉnh sửa mới trong lúc chờ duyệt";
            return { success: false, error: snapshot.invalidationReason };
        }
        const currentSignature = subjectsSignatureOf(activeDoc, snapshot.subjectNodeIds);
        if (
            currentSignature !== snapshot.stateSignature ||
            currentSignature.includes("unreadable") ||
            currentSignature.includes("err")
        ) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: hình học đối tượng đã thay đổi hoặc không xác minh được dấu hình học";
            return { success: false, error: snapshot.invalidationReason };
        }

        // 9. Kiểm tra quyền qua Cổng bảo vệ nguồn Đợt B
        const permission = checkToolPermission(snapshot.toolName, snapshot.toolArgs, activeDoc);
        if (!permission.decision.allowed) {
            return {
                success: false,
                error: `permission-denied: ${permission.decision.message}`,
            };
        }

        // 10. Tải tool (bước chờ bất đồng bộ)
        if (testHooks?.preWriteDelay) {
            await testHooks.preWriteDelay();
        }

        const { buildTools } = await import("../../tools");
        const tools = buildTools();
        const tool = tools.find((t) => t.name === snapshot.toolName);
        if (!tool) {
            return {
                success: false,
                error: `governed-tool-not-found: không tìm thấy công cụ "${snapshot.toolName}" trong governedRouter`,
            };
        }

        // =========================================================================
        // Yêu cầu 1: Ranh giới ghi — Kiểm tra lại toàn diện trước khi hình học thay đổi
        // =========================================================================
        // a. Tài liệu đang mở
        const currentOpenDoc = getDocument();
        if (
            !currentOpenDoc ||
            currentOpenDoc !== activeDoc ||
            currentOpenDoc.id !== snapshot.documentId ||
            currentOpenDoc.id !== activeDoc.id
        ) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: tài liệu đang mở đã thay đổi hoặc không khớp với tài liệu được duyệt trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // b. Tác vụ gốc & trạng thái
        const rootAtBoundary = getTaskProfileById(rootTaskId) ?? rootProfile;
        if (!rootAtBoundary || rootAtBoundary.status !== "active") {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: tác vụ gốc không còn hiệu lực trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // c. Đề xuất hiện hành của tác vụ gốc
        if (rootAtBoundary.activeProposal?.proposalId !== snapshot.proposalId) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "stale-proposal: đề xuất đã bị thay đổi hoặc hủy trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // d. Lượt sửa của tác vụ gốc
        const currentExecutedBoundary = rootAtBoundary.executedRepairs ?? 0;
        if (snapshot.attemptIndex !== currentExecutedBoundary + 1 || currentExecutedBoundary >= 2) {
            return {
                success: false,
                error: `invalid-attempt-index: số lượt sửa của tác vụ gốc đã thay đổi trước khi ghi (${currentExecutedBoundary})`,
            };
        }

        // e. Tác vụ hiện hành trên app
        const activeAtBoundary = getTaskProfile();
        if (
            !activeAtBoundary ||
            activeAtBoundary.taskId !== rootTaskId ||
            activeAtBoundary.status !== "active"
        ) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: tác vụ hiện hành đã thay đổi sang tác vụ khác trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // f. Quy tắc thiết kế
        if (rulesFingerprintFor(activeDoc.id) !== snapshot.rulesFingerprint) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: quy tắc thiết kế đã thay đổi trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // g. Dấu lịch sử
        if (historyMarkOf(activeDoc) !== snapshot.historyMark) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: mô hình đã có thao tác chỉnh sửa mới trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // h. Dấu hình học
        const boundarySig = subjectsSignatureOf(activeDoc, snapshot.subjectNodeIds);
        if (
            boundarySig !== snapshot.stateSignature ||
            boundarySig.includes("unreadable") ||
            boundarySig.includes("err")
        ) {
            (snapshot as { invalidated?: boolean }).invalidated = true;
            (snapshot as { invalidationReason?: string }).invalidationReason =
                "proposal-invalidated-by-drift: hình học đối tượng đã thay đổi trước khi ghi";
            return { success: false, error: snapshot.invalidationReason };
        }

        // i. Quyền tại ranh giới ghi
        const boundaryPerm = checkToolPermission(snapshot.toolName, snapshot.toolArgs, activeDoc);
        if (!boundaryPerm.decision.allowed) {
            return {
                success: false,
                error: `permission-denied: ${boundaryPerm.decision.message}`,
            };
        }

        // Lưu snapshot deltas trước khi ghi
        rootAtBoundary.lastDeltas = [...snapshot.deltas];

        // 11. Tuyến ghi chuẩn qua governedRouter
        const toolArgsWithProposal = {
            ...snapshot.toolArgs,
            proposalId: snapshot.proposalId,
        };
        const undoTopBefore = activeDoc.history.undoTop();
        const historyMarkBefore = historyMarkOf(activeDoc);
        const rootHistoryCountBefore = rootAtBoundary.taskHistoryRecords.length;

        let toolResult: unknown;
        try {
            const handlerToCall = testHooks?.overrideToolHandler ?? tool.handler;
            toolResult = await handlerToCall(toolArgsWithProposal);
        } catch (toolErr) {
            return {
                success: false,
                error: `tool-execution-error: ${String(toolErr)}`,
            };
        }

        // Lấy kết quả ghi và trạng thái giao dịch ngay tại thời điểm tool vừa hoàn thành
        const undoTopImmediatelyAfter = activeDoc.history.undoTop();
        const rootHistoryCountImmediatelyAfter = rootAtBoundary.taskHistoryRecords.length;

        const text =
            typeof toolResult === "string"
                ? toolResult
                : ((toolResult as { content?: string })?.content ?? "");
        let writeError: string | undefined;
        let payloadConfirmed = false;
        let toolReportedCommitted = false;
        let toolReportedDocId: string | undefined;
        let toolReportedProposalId: string | undefined;

        try {
            const parsed = JSON.parse(text) as {
                error?: string;
                success?: boolean;
                code?: string;
                updated?: unknown[];
                transform?: unknown[];
                committed?: boolean;
                documentId?: string;
                proposalId?: string;
            };
            if (typeof parsed.error === "string") {
                writeError = parsed.error;
            } else if (parsed.success === false) {
                writeError = "thao tác ghi thất bại";
            } else if (typeof parsed.code === "string" && parsed.code.endsWith("_DENIED")) {
                writeError = `permission-denied: ${parsed.code}`;
            } else if (snapshot.toolName === "set_node_properties") {
                payloadConfirmed = Array.isArray(parsed.updated) && parsed.updated.length > 0;
            } else if (snapshot.toolName === "transform_node") {
                payloadConfirmed = Array.isArray(parsed.transform);
            } else {
                payloadConfirmed = parsed.success === true;
            }
            toolReportedCommitted = parsed.committed === true;
            toolReportedDocId = parsed.documentId;
            toolReportedProposalId = parsed.proposalId;
        } catch {
            // non-JSON
        }

        // Xác nhận chính giao dịch mà lệnh sửa C3 thực hiện qua tool:
        // 1. Tool không báo lỗi và xác nhận payload đã cập nhật hợp lệ về hình thức
        // 2. Chính tool xác nhận giao dịch đã commit (committed === true)
        // 3. Giao dịch do chính tool xác nhận thuộc đúng tài liệu đã duyệt (documentId === snapshot.documentId)
        // 4. Giao dịch do chính tool xác nhận thuộc đúng đề xuất đã duyệt (proposalId === snapshot.proposalId)
        // 5. Đỉnh ngăn xếp undo của tài liệu dịch chuyển trực tiếp trong lần gọi này
        const undoAdvanced = undoTopImmediatelyAfter !== undoTopBefore && Boolean(undoTopImmediatelyAfter);
        const correctDoc = toolReportedDocId === snapshot.documentId;
        const correctProposal = toolReportedProposalId === snapshot.proposalId;

        const hasCommitConfirmation = toolReportedCommitted && correctDoc && correctProposal;

        const directTransactionCommitted =
            !writeError && payloadConfirmed && hasCommitConfirmation && undoAdvanced;

        if (testHooks?.postWriteDelay) {
            await testHooks.postWriteDelay();
        }

        if (!directTransactionCommitted) {
            const missingReason = !hasCommitConfirmation
                ? "lệnh sửa chưa xác nhận ghi từ chính tool cho đúng tài liệu và đề xuất"
                : "lệnh sửa không tạo giao dịch hợp lệ hoặc chưa commit thành công";
            return {
                success: false,
                error: writeError ?? missingReason,
            };
        }

        // =========================================================================
        // Yêu cầu 2: Ghi thành công -> Gắn kết quả và số lượt với tác vụ gốc đã duyệt
        // =========================================================================
        (snapshot as { executed: boolean }).executed = true;
        const targetRootProfile = getTaskProfileById(rootTaskId) ?? rootProfile;
        if (targetRootProfile) {
            targetRootProfile.executedRepairs = currentExecuted + 1;
            targetRootProfile.activeProposal = undefined;
            targetRootProfile.lastDeltas = [...snapshot.deltas];
        }

        // Kiểm tra xem tác vụ hiện hành có còn là tác vụ gốc hay không
        const currentActive = getTaskProfile();
        if (!currentActive || currentActive.taskId !== rootTaskId) {
            // Tác vụ mới đã mở: GIỮ NGUYÊN số lượt, thẻ và bằng chứng của tác vụ mới!
            return {
                success: true,
                error: "task-context-switched: đã ghi nhận thành công một lượt sửa cho tác vụ gốc",
            };
        }

        // 12. Đo lại độc lập toàn bộ tiêu chí (chỉ khi tác vụ gốc vẫn đang mở)
        let evalResult: TaskCriteriaEvaluation | undefined;
        try {
            if (remeasureFn) {
                evalResult = await remeasureFn(activeDoc);
            } else {
                const { finalizeTaskVerification } = await import("./runtime");
                evalResult = await finalizeTaskVerification(activeDoc);
            }
        } catch (measureErr) {
            // Nếu đã ghi thành công rồi hậu kiểm bị hủy, vẫn tính một lượt cho tác vụ gốc
            return {
                success: true,
                error: `ghi-thanh-cong-nhung-do-lai-loi: ${String(measureErr)}`,
            };
        }

        return {
            success: true,
            evaluation: evalResult,
        };
    } finally {
        const boundRoot = getTaskProfileById(rootTaskId) ?? rootProfile;
        if (boundRoot) {
            boundRoot.isRepairExecuting = false;
        }
        profile.isRepairExecuting = false;
        const live = getTaskProfile();
        if (live && live.taskId === rootTaskId) {
            live.isRepairExecuting = false;
        }
    }
}
