// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { div, span } from "@chili3d/element";
import { getCriterionRunner } from "./evidenceStore";
import type { CriterionSpec, TaskCriteriaEvaluation } from "./types";

/** Class tokens injected by the host (chatPanel.module.css) so the card stays testable. */
export interface EvidenceCardClasses {
    root: string;
    header: string;
    row: string;
    pass: string;
    fail: string;
    unknown: string;
    stale: string;
    badgeComplete: string;
    badgeOutstanding: string;
    repairSection?: string;
    repairHeader?: string;
    repairDescription?: string;
    btnApprove?: string;
    btnReject?: string;
}

export interface EvidenceCardActions {
    onApproveRepair?: (proposal: import("./types").RepairProposal) => void;
    onRejectRepair?: (proposal: import("./types").RepairProposal) => void;
}

const STATUS_ICON = { pass: "✅", fail: "❌", unknown: "❓" } as const;

const BLOCK_REASON_TEXT: Record<string, string> = {
    no_criteria_defined: "chưa khai báo tiêu chí nào cho tác vụ — không được báo hoàn tất",
    plan_not_active: "kế hoạch không còn hiệu lực — quyền và bằng chứng cũ đã đóng",
    no_required_criteria: "không có tiêu chí bắt buộc nào — chưa đủ cơ sở báo hoàn tất",
};

function formatMeasured(measured?: Record<string, number[]>): string {
    if (!measured) {
        return "";
    }
    const parts = Object.entries(measured).map(([key, values]) => `${key}=[${values.join(", ")}] mm`);
    return ` · ${parts.join(" · ")}`;
}

/** C2 card: state the REQUIREMENT next to the measurement — "mong đợi … ± … mm". */
function formatExpected(spec: CriterionSpec): string {
    const want = Object.entries(spec.expected ?? {})
        .map(([key, values]) => `${key}=[${values.join(", ")}]`)
        .join(" ");
    if (!want) {
        return " · yêu cầu: (chưa có giá trị → không đo được)";
    }
    const tol = spec.toleranceMm ? `± ${spec.toleranceMm.join("/")} mm` : "dung sai CHƯA NÊU → unknown";
    return ` · yêu cầu: ${want} mm ${tol}`;
}

/**
 * Evidence card for the chat panel — the only completion signal it may show is
 * `completable` from the store (every required criterion passing with VALID
 * evidence). Failing/stale/unknown rows stay visible; nothing is hidden on fail (§9).
 */
export function renderEvidenceCard(
    evaluation: TaskCriteriaEvaluation,
    classes: EvidenceCardClasses,
    actions?: EvidenceCardActions,
): HTMLElement {
    const rows = evaluation.rows.map((row) => {
        const stateClass = row.stale
            ? classes.stale
            : row.status === "pass"
              ? classes.pass
              : row.status === "fail"
                ? classes.fail
                : classes.unknown;
        const attrs = { className: `${classes.row} ${stateClass}` };
        return div(
            attrs,
            span({
                textContent: `${STATUS_ICON[row.status]} [${row.spec.required ? "bắt buộc" : "tuỳ chọn"}] ${getCriterionRunner(row.spec.kind)?.label ?? row.spec.kind} · ${row.spec.id}${formatExpected(row.spec)}`,
            }),
            span({ textContent: ` — ${row.reason}${formatMeasured(row.measured)}` }),
            ...(row.stale && row.evidence
                ? [
                      span({
                          textContent: ` (bằng chứng cũ ${new Date(row.evidence.recordedAt).toLocaleTimeString("vi-VN")})`,
                      }),
                  ]
                : []),
            ...(row.evidence?.supportNotes
                ? [div({ className: classes.unknown, textContent: `giới hạn: ${row.evidence.supportNotes}` })]
                : []),
        );
    });

    const additionalBlocks: HTMLElement[] = [];

    // C3: Thẻ đề xuất sửa sai lệch (nếu có đề xuất hợp lệ)
    if (evaluation.activeProposal && !evaluation.completable) {
        const proposal = evaluation.activeProposal;
        const approveBtn = document.createElement("button");
        approveBtn.type = "button";
        approveBtn.className = classes.btnApprove ?? "";
        approveBtn.textContent = "Duyệt sửa";
        approveBtn.addEventListener(
            "click",
            (e) => {
                e.stopPropagation();
                approveBtn.disabled = true;
                approveBtn.textContent = "Đang sửa...";
                actions?.onApproveRepair?.(proposal);
            },
            { once: true },
        );

        const rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = classes.btnReject ?? "";
        rejectBtn.textContent = "Từ chối";
        rejectBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            rejectBtn.disabled = true;
            actions?.onRejectRepair?.(proposal);
        });

        const btnContainer = div(
            { style: { display: "flex", gap: "8px", marginTop: "4px" } },
            approveBtn,
            rejectBtn,
        );

        const proposalBlock = div(
            { className: classes.repairSection ?? classes.stale },
            div({
                className: classes.repairHeader ?? classes.header,
                textContent: `🔧 Đề xuất sửa sai lệch (Lần ${proposal.attemptIndex}/2)`,
            }),
            div({
                className: classes.repairDescription ?? classes.row,
                textContent: `→ ${proposal.displayDescription}`,
            }),
            btnContainer,
        );
        additionalBlocks.push(proposalBlock);
    } else if (evaluation.proposalStopReason && !evaluation.completable) {
        additionalBlocks.push(
            div({
                className: classes.unknown,
                textContent: `ℹ Dừng tự sửa: ${evaluation.proposalStopReason}`,
            }),
        );
    }

    if (
        evaluation.executedRepairs !== undefined &&
        evaluation.executedRepairs >= 2 &&
        !evaluation.completable
    ) {
        additionalBlocks.push(
            div({
                className: classes.stale,
                textContent: "🛑 Đã thực thi đủ 2/2 lượt tự sửa trên tác vụ gốc — dừng vòng tự động",
            }),
        );
    }

    const badge = evaluation.completable
        ? div({
              className: classes.badgeComplete,
              textContent: "✔ HOÀN TẤT — mọi tiêu chí bắt buộc đều pass với bằng chứng hợp lệ",
          })
        : div({
              className: classes.badgeOutstanding,
              textContent: evaluation.blockReason
                  ? `⏳ CHƯA HOÀN TẤT — ${BLOCK_REASON_TEXT[evaluation.blockReason] ?? evaluation.blockReason}`
                  : `⏳ CHƯA HOÀN TẤT — còn ${evaluation.outstandingRequiredIds.length}/${evaluation.requiredTotal} tiêu chí bắt buộc chưa đạt`,
          });

    return div(
        { className: classes.root },
        div({
            className: classes.header,
            textContent: `Bằng chứng hậu kiểm (Đợt C) · task ${evaluation.taskId.slice(0, 8)} · pass ${evaluation.counts.pass} / fail ${evaluation.counts.fail} / unknown ${evaluation.counts.unknown}`,
        }),
        ...rows,
        ...additionalBlocks,
        badge,
    );
}
