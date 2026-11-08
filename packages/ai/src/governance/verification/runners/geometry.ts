// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { registerCriterionRunner } from "../evidenceStore";
import { readSubjectWorldBox } from "../measure";
import type { CriterionMeasurement, CriterionRunner, CriterionSpec } from "../types";

type Triple = [number, number, number];

interface NodeReading {
    value?: Triple;
    error?: string;
}

function round3(v: number): number {
    return Math.round(v * 1000) / 1000;
}

function validTriple(value: number[] | undefined): value is Triple {
    return Array.isArray(value) && value.length === 3 && value.every((v) => Number.isFinite(v));
}

/**
 * Shared strict comparison for the first two C2 checks:
 * - no task-stated expectation → unknown (there is NO default size table);
 * - no task-stated tolerance → unknown (missing proof is never a pass);
 * - a subject that cannot be read → unknown (data/kernel gap, not a geometry verdict);
 * - measured value outside tolerance on any axis → fail with the exact numbers.
 */
function compareAgainstExpected(
    label: string,
    expectedKey: string,
    spec: CriterionSpec,
    readNode: (nodeId: string) => NodeReading,
): CriterionMeasurement {
    const expected = spec.expected[expectedKey];
    if (!validTriple(expected)) {
        return {
            status: "unknown",
            reason: `task chưa nêu ${label} mong đợi hợp lệ (expected.${expectedKey} = [X,Y,Z]) — không có bảng mặc định`,
        };
    }
    const tolerance = spec.toleranceMm;
    if (!validTriple(tolerance) || tolerance.some((v) => v < 0)) {
        return {
            status: "unknown",
            reason: `task chưa nêu dung sai cho ${label} (toleranceMm [X,Y,Z]) — thiếu dung sai là unknown`,
        };
    }
    if (spec.subjectNodeIds.length === 0) {
        return {
            status: "unknown",
            reason: spec.resolutionNote
                ? `không có đối tượng để đo ${label} — ${spec.resolutionNote}`
                : `không có đối tượng để đo ${label} — tiêu chí chưa resolve được subject (hint không khớp)`,
        };
    }
    const measured: Record<string, number[]> = {};
    const deviations: string[] = [];
    for (const nodeId of spec.subjectNodeIds) {
        const reading = readNode(nodeId);
        if (!reading.value) {
            return { status: "unknown", reason: reading.error ?? `không đo được "${nodeId}"` };
        }
        measured[`${nodeId}:${expectedKey}`] = reading.value.map(round3);
        for (let axis = 0; axis < 3; axis++) {
            const delta = reading.value[axis] - expected[axis];
            if (Math.abs(delta) > tolerance[axis] + 1e-9) {
                deviations.push(
                    `${nodeId} trục ${"XYZ"[axis]}: đo ${round3(reading.value[axis])} mm, mong ${expected[axis]} mm, ` +
                        `lệch ${round3(delta)} mm vượt dung sai ${tolerance[axis]} mm`,
                );
            }
        }
    }
    if (deviations.length > 0) {
        return { status: "fail", measured, reason: `${label} sai — ${deviations.join("; ")}` };
    }
    return {
        status: "pass",
        measured,
        reason: `${label} đạt: mọi trục trong dung sai ${tolerance.map(round3).join("/")} mm`,
    };
}

function makeReader(doc: IDocument | undefined, pick: "sizeMm" | "centerMm") {
    return (nodeId: string): NodeReading => {
        if (!doc) {
            return { error: "không có tài liệu đang mở để đo" };
        }
        const reading = readSubjectWorldBox(doc, nodeId);
        if (!reading.found || !reading.box) {
            return { error: reading.error ?? `không đo được "${nodeId}"` };
        }
        return { value: reading.box[pick] };
    };
}

/** C2 check #1 — kích thước (world bbox cạnh từng trục, mm). */
export const dimensionMatchRunner: CriterionRunner = {
    kind: "dimension_match",
    label: "Kích thước bao (hộp bao world, mm)",
    requiresSubjectProof: true,
    supportNotes:
        "Đo cạnh hộp bao theo trục X/Y/Z (mm, hệ world). Đủ cho khối hộp hướng trục; " +
        "KHÔNG chứng minh hình dạng/rãnh/lỗ bên trong hay hình xoay xiên — các quan hệ đó cần tiêu chí khác. " +
        "Ràng buộc bằng chứng gắn thêm identity-shape + thể tích: đổi hình học trong lòng dù hộp bao giữ nguyên " +
        "vẫn làm bằng chứng stale và phải đo lại; bản thân tiêu chí này không phát biểu gì về bên trong chi tiết.",
    async measure(spec, doc) {
        return compareAgainstExpected("kích thước", "sizeMm", spec, makeReader(doc, "sizeMm"));
    },
};

/** C2 check #2 — vị trí (tâm hộp bao world, mm). */
export const positionMatchRunner: CriterionRunner = {
    kind: "position_match",
    label: "Vị trí (tâm hộp bao world, mm)",
    requiresSubjectProof: true,
    supportNotes:
        "Đo tâm hộp bao (mm, hệ world) từng đối tượng. Với hình đối xứng, tâm bbox trùng centroid; " +
        "hình bất đối xứng cần tiêu chí tâm riêng. Không suy ra quan hệ xuyên/không xuyên từ vị trí mẫu. " +
        "Ràng buộc bằng chứng gắn identity-shape + thể tích: hình đổi mà hộp bao không đổi vẫn stale cho tới khi đo lại.",
    async measure(spec, doc) {
        return compareAgainstExpected("vị trí", "centerMm", spec, makeReader(doc, "centerMm"));
    },
};

export function registerDefaultGeometryRunners(): void {
    registerCriterionRunner(dimensionMatchRunner);
    registerCriterionRunner(positionMatchRunner);
}
