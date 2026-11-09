// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IDocument, Id, type INode, Matrix4, Plane, Transaction, XYZ } from "@chili3d/core";
import { findNode, getDocument } from "../../tools/documentContext";
import { buildTransformMatrix } from "../../tools/transformMatrix";
import { checkToolPermission } from "../permissionGate";
import { rulesFingerprintFor } from "../rulesStore";
import { getActiveTaskProfile, getTaskProfile } from "../taskProfile";
import { historyMarkOf, subjectsSignatureOf } from "./stateMarker";
import type { CriterionStructuredDelta, RepairProposal, TaskCriteriaEvaluation } from "./types";

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
            toolArgs: {
                id: subjectId,
                properties: propertiesUpdate,
            },
            displayDescription,
            phase: "size",
            attemptIndex: executedRepairs + 1,
            deltas: currentRequiredDeltas,
            executed: false,
            createdAt: Date.now(),
        };

        return { proposal };
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
            toolArgs: {
                id: subjectId,
                translate: translateVec,
            },
            displayDescription,
            phase: "position",
            attemptIndex: executedRepairs + 1,
            deltas: currentRequiredDeltas,
            executed: false,
            createdAt: Date.now(),
        };

        return { proposal };
    }

    return {};
}

/**
 * Execute an approved repair proposal:
 * 1. Checks execution mutex and single-use flag.
 * 2. Checks hard lifetime quota (max 2 attempts on root task).
 * 3. Re-verifies state token (doc, history, rules, geometry signature).
 * 4. Checks permission through Batch B router.
 * 5. Executes mutation inside a Transaction.
 * 6. Immediately increments executedRepairs (even if subsequent measurement throws).
 * 7. Remeasures all criteria via finalizeTaskVerification.
 */
export async function executeRepairProposal(
    proposal: RepairProposal,
    doc?: IDocument,
    remeasureFn?: (d: IDocument) => Promise<TaskCriteriaEvaluation | undefined>,
): Promise<{ success: boolean; error?: string; evaluation?: TaskCriteriaEvaluation }> {
    const activeDoc = doc ?? getDocument();
    if (!activeDoc) {
        return { success: false, error: "không có tài liệu đang mở để thực thi sửa" };
    }

    const profile = getTaskProfile();
    if (!profile || profile.taskId !== proposal.taskId) {
        return { success: false, error: "tác vụ không còn hiệu lực hoặc đã thay đổi" };
    }

    // 1. Chống double-click / concurrent approval
    if (profile.isRepairExecuting) {
        return { success: false, error: "thao tác sửa đang được thực thi — vui lòng không bấm lặp" };
    }
    profile.isRepairExecuting = true;

    try {
        // 2. Chặn dùng lại proposal đã thực thi (single use)
        if (proposal.executed) {
            return { success: false, error: "đề xuất này đã được thực thi một lần — không được dùng lại" };
        }

        // 3. Kiểm tra quota trần cứng: tối đa 2 lần sửa
        const currentExecuted = profile.executedRepairs ?? 0;
        if (currentExecuted >= 2) {
            return { success: false, error: "quota-exceeded: đã thực thi đủ 2/2 lần sửa trên tác vụ gốc" };
        }

        // 4. Token validation: Kiểm tra tài liệu, quy tắc, history, và chữ ký hình học
        if (activeDoc.id !== proposal.documentId) {
            proposal.invalidated = true;
            proposal.invalidationReason =
                "proposal-invalidated-by-drift: tài liệu đã thay đổi trong lúc chờ duyệt";
            return { success: false, error: proposal.invalidationReason };
        }
        if (rulesFingerprintFor(activeDoc.id) !== proposal.rulesFingerprint) {
            proposal.invalidated = true;
            proposal.invalidationReason =
                "proposal-invalidated-by-drift: quy tắc thiết kế đã thay đổi trong lúc chờ duyệt";
            return { success: false, error: proposal.invalidationReason };
        }
        if (historyMarkOf(activeDoc) !== proposal.historyMark) {
            proposal.invalidated = true;
            proposal.invalidationReason =
                "proposal-invalidated-by-drift: mô hình đã có thao tác chỉnh sửa mới trong lúc chờ duyệt";
            return { success: false, error: proposal.invalidationReason };
        }
        const currentSignature = subjectsSignatureOf(activeDoc, proposal.subjectNodeIds);
        if (
            currentSignature !== proposal.stateSignature ||
            currentSignature.includes("unreadable") ||
            currentSignature.includes("err")
        ) {
            proposal.invalidated = true;
            proposal.invalidationReason =
                "proposal-invalidated-by-drift: hình học đối tượng đã thay đổi hoặc không xác minh được dấu hình học";
            return { success: false, error: proposal.invalidationReason };
        }

        if (profile.status !== "active") {
            return { success: false, error: "tác vụ không còn hiệu lực hoặc đã thay đổi" };
        }

        // 5. Kiểm tra quyền qua Cổng bảo vệ nguồn Đợt B
        const permission = checkToolPermission(proposal.toolName, proposal.toolArgs, activeDoc);
        if (!permission.decision.allowed) {
            return {
                success: false,
                error: `permission-denied: ${permission.decision.message}`,
            };
        }

        // Lưu snapshot deltas trước khi ghi để dùng so sánh hội tụ ở lần sau
        profile.lastDeltas = [...proposal.deltas];

        // 6. Thực thi lệnh ghi
        if (proposal.toolName === "set_node_properties") {
            const node = findNode(activeDoc, proposal.toolArgs["id"] as string);
            if (!node) {
                return { success: false, error: "không tìm thấy đối tượng để sửa" };
            }
            const properties = (proposal.toolArgs["properties"] ?? {}) as Record<string, unknown>;
            Transaction.execute(activeDoc, "AI repair: set properties", () => {
                for (const [key, val] of Object.entries(properties)) {
                    (node as unknown as Record<string, unknown>)[key] = val;
                }
                activeDoc.visual.update();
            });
        } else if (proposal.toolName === "transform_node") {
            const node = findNode(activeDoc, proposal.toolArgs["id"] as string);
            if (!node) {
                return { success: false, error: "không tìm thấy đối tượng để dịch chuyển" };
            }
            const matrix = buildTransformMatrix(proposal.toolArgs);
            if (typeof matrix === "string") {
                return { success: false, error: `matrix-build-error: ${matrix}` };
            }
            Transaction.execute(activeDoc, "AI repair: transform node", () => {
                const visual = node as unknown as { transform: Matrix4 };
                visual.transform = visual.transform.multiply(matrix);
                activeDoc.visual.update();
            });
        }

        // QUAN TRỌNG: Ghi thành công -> TÍNH LƯỢT NGAY LẬP TỨC
        // "Một lần ghi thành công vẫn tính lượt nếu lần đo sau bị hủy."
        proposal.executed = true;
        profile.executedRepairs = currentExecuted + 1;
        profile.activeProposal = undefined;

        // 7. Đo lại độc lập toàn bộ tiêu chí
        let evalResult: TaskCriteriaEvaluation | undefined;
        try {
            if (remeasureFn) {
                evalResult = await remeasureFn(activeDoc);
            } else {
                const { finalizeTaskVerification } = await import("./runtime");
                evalResult = await finalizeTaskVerification(activeDoc);
            }
        } catch (measureErr) {
            // Lần đo sau bị hủy/lỗi -> lượt ghi vẫn đã được tính!
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
        profile.isRepairExecuting = false;
    }
}
