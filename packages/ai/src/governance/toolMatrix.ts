// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Batch B supported / blocked tool matrix (enforced by GovernedToolExecutionRouter).
 * Advanced criteria verification is Batch C — not claimed here.
 */

export type ToolSupport = "supported" | "gated" | "blocked" | "read";

export interface ToolMatrixEntry {
    tool: string;
    support: ToolSupport;
    notes: string;
}

export const BATCH_B_TOOL_MATRIX: readonly ToolMatrixEntry[] = [
    {
        tool: "run_program",
        support: "gated",
        notes: "Per-op check after normalize+resolve; batch create-then-ref OK; edit/consume of sources needs plan",
    },
    {
        tool: "run_parametric",
        support: "gated",
        notes: "body/tools resolved to real ids; boolean tools consume; editFeature modifies body",
    },
    {
        tool: "delete_node",
        support: "gated",
        notes: "Blocks protected sources and subtree unless plan allows delete",
    },
    {
        tool: "transform_node",
        support: "gated",
        notes: "Blocks protected sources unless plan allows modify",
    },
    {
        tool: "set_node_properties",
        support: "gated",
        notes: "Blocks protected sources unless plan allows modify",
    },
    {
        tool: "set_node_visible",
        support: "gated",
        notes: "Treated as modify of presentation on protected nodes",
    },
    {
        tool: "set_material",
        support: "gated",
        notes: "Per-node material assign gated as modify",
    },
    {
        tool: "set_material_properties",
        support: "gated",
        notes: "Requires allowMaterialLibrary on approved plan",
    },
    {
        tool: "move_nodes",
        support: "gated",
        notes: "Tree structure changes require tree/modify rights",
    },
    {
        tool: "create_folder",
        support: "gated",
        notes: "Create allowed; moving protected nodes into it requires tree rights",
    },
    {
        tool: "apply_array",
        support: "supported",
        notes: "Creates copies; source is read-only",
    },
    {
        tool: "document_variables",
        support: "gated",
        notes: "list=read; set/remove need allowDocumentVariables",
    },
    {
        tool: "undo",
        support: "gated",
        notes: "Agent undo only while contiguous task records sit on history top",
    },
    {
        tool: "redo",
        support: "gated",
        notes: "Allowed; does not expand source rights",
    },
    {
        tool: "run_command",
        support: "gated",
        notes: "SAFE_DIRECT_COMMANDS only; interactive/dialog paths blocked or non-mutating; timeout ≠ mutation stopped",
    },
    {
        tool: "new_document",
        support: "supported",
        notes: "Existing guard refuses when a document is already open",
    },
    {
        tool: "get_document_state",
        support: "read",
        notes: "Read-only",
    },
    {
        tool: "get_selection",
        support: "read",
        notes: "Read-only",
    },
    {
        tool: "get_node_properties",
        support: "read",
        notes: "Read-only",
    },
    {
        tool: "bom_report",
        support: "read",
        notes: "Read-only",
    },
    {
        tool: "ask_user",
        support: "read",
        notes: "UI prompt; unavailable on bridge",
    },
    {
        tool: "load_skill",
        support: "read",
        notes: "Read-only skill text",
    },
] as const;

export function toolMatrixSummary(): string {
    const lines = BATCH_B_TOOL_MATRIX.map((row) => `- ${row.tool}: ${row.support} — ${row.notes}`);
    return ["## Batch B tool matrix", ...lines].join("\n");
}
