// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { formatSessionMemorySummary } from "../memory";
import { SkillStore } from "../skills";
import { buildTools } from "../tools";
import { EDIT_METHODS } from "../tools/capabilityEngine";
import { documentSnapshot } from "../tools/readTools";
import { TRANSFORM_ARGS_SENTENCE, TRANSFORM_ORDER } from "../tools/transformMatrix";
import type { SystemPrompt } from "./types";

export interface BuildSystemPromptOptions {
    /** What the context trim folded away; see `journal.ts`. It changes, so it belongs in volatile. */
    journal?: string;
}

/**
 * Split at the stability boundary: everything above the document snapshot is byte-identical for
 * every request in a run and carries the cache breakpoint; the snapshot and the journal are
 * per-run and must stay after it (see `SystemPrompt`).
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): SystemPrompt {
    return {
        stable: [introSection(), toolIndexSection(), policySection(), rulesSection()].join("\n\n"),
        volatile: [contextSection(), sessionMemorySection(), journalSection(options.journal)]
            .filter(Boolean)
            .join("\n\n"),
    };
}

/**
 * Active structured short-term session memory for keeping track of goals, steps, active nodes,
 * consumed nodes, and recent errors across turns.
 */
function sessionMemorySection(): string {
    return formatSessionMemorySummary();
}

/**
 * The condensed record of turns the trim removed. It is deliberately separate from the live
 * document snapshot above it: the snapshot says what exists now, this says what was tried.
 */
function journalSection(journal: string | undefined): string {
    return journal?.trim() ? `## Condensed history\n${journal.trim()}` : "";
}

function introSection(): string {
    return `You are the AI assistant for Chili3D (a parametric CAD). Help the user create and edit 3D models in the browser.

Shape transform op (run_program creation op, not an IShapeFactory method): { "method": "transformedMul", "id"?, "args": { "shape": "<ref>", "translate"?, "rotate"?, "scale"?, "mirror"? } } — creates a new node whose shape is the referenced shape with its placement multiplied by the transform; the source node is unchanged. Transform encoding is the same as transform_node; combined arguments act on the geometry in ${TRANSFORM_ORDER} order — ${TRANSFORM_ARGS_SENTENCE}.
Text 3D op: { "method": "text", "id"?, "args": { "text": "string", "size"?: 20, "depth"?: 5, "font"?: "Roboto" | "Open Sans" | "Fira Mono" | "Noto Sans SC", "plane"?: { "origin": { "x": 0, "y": 0, "z": 0 }, "normal": { "x": 0, "y": 0, "z": 1 } } } } — draws 3D extruded text solid in the scene (fonts: Roboto, Open Sans, Fira Mono, Noto Sans SC/TC/JP/KR; common aliases like Arial map to Roboto).`;
}

/**
 * Compact generated index of every registered tool (name + first sentence of its description).
 * Full descriptions and parameter schemas already reach the model via function calling — this
 * section only keeps the prompt aware of what exists, so it can never drift from the registry.
 */
function toolIndexSection(): string {
    const lines = buildTools().map((t) => `- ${t.name}: ${firstSentence(t.description)}`);
    return `Available tools (full parameter schemas are provided via function calling):
${lines.join("\n")}`;
}

/** Abbreviations whose trailing period does not end a sentence. */
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "cf"]);

/**
 * First sentence of a tool description — all the tool index carries. A boundary is only a
 * sentence end when it does not follow an abbreviation and the next character starts a new
 * sentence, so the index never shows a fragment like "… highlighted — e.g.".
 */
function firstSentence(description: string): string {
    for (const match of description.matchAll(/\.\s+/g)) {
        const end = match.index;
        const word = description.slice(0, end).match(/[\w.]+$/)?.[0] ?? "";
        if (ABBREVIATIONS.has(word.toLowerCase())) continue;
        const next = description[end + match[0].length];
        if (next !== undefined && !/[A-Z]/.test(next)) continue;
        return description.slice(0, end + 1);
    }
    return description;
}

/** Hand-written usage policy: what the tool schemas cannot say — when and in which order. */
function policySection(): string {
    return `Usage policy:
- Reference material: load_skill when its topic comes up (${SkillStore.getAll()
        .map((s) => s.name)
        .join(", ")}) rather than answering from memory.
- Several calls in one response run in order; independent reads belong together, and a call may use an earlier returned id.
- When the user asks how to do something or reports a manual operation failing: load_skill command-guide, load_skill app-guide, and call get_ribbon. Explain the exact geometric preconditions and root cause (missing inputs, wrong selection type e.g. open wire vs solid, invalid radius), then teach the step-by-step click path on Ribbon / Viewport / Model Tree with confirmation keys (Enter, Space, Esc, Tab). Do not run commands on their behalf when they only asked how to do it.
- When requested to create or edit models: preflight check preconditions from command-guide before write tools (profile closed & coplanar for extrude/revol, through-hole cutter overshoots both wall faces, fillet/chamfer radii < adjacent faces, corner vs center origins). If parameters are missing or there is a risk of losing feature history / boundary overflow / affecting source instances, ask via ask_user first — do not draft blindly. After running write ops: verify actual results (created, removed, dimensions/volume) before reporting done.
- run_program ops run in order; reference only earlier ops by id (refs persist across calls and re-resolve against the live scene). Referencing a node never deletes it, EXCEPT for edit-style methods whose result replaces their inputs: ${[...EDIT_METHODS].join(", ")} — the response's "removed" lists the nodes consumed this way; they no longer exist, so never hide, delete or reference them afterward.
- Subshapes & Face Normal: NEVER batch shape.findSubShapes with assumed refs (#0, #1) in the same call; run alone, inspect results[opId].refs, then query returned refs. face.normal requires u and v: query face.surface -> surface.bounds {u1,u2,v1,v2}. Pass u:0, v:0 for planar/unbounded (|u1|>1e10) or midpoint for finite. Top face is identified by upward normal (+Z, normal.z>0.9) and max Z position, never by #0 or op name "top_face".
- Node lifecycle: When a tool reports "node not found" or "already consumed or deleted", do NOT retry; call get_document_state to re-read the active tree before proceeding. Consumed boolean tools owned by a parametric body cannot be deleted with delete_node.
- Showing results: select_nodes affected nodes, fit_content, capture_screenshot. Clear selection first (select_nodes []) to inspect shading and edges without highlight fill.
- To change an entity that already exists: get_node_properties reads what the property panel shows (name, a shape's parameters), set_node_properties writes it — the node and its references survive and the panel updates. "Make this box taller" is a property write, NOT delete-then-recreate; transform_node is for placement. set_material styles one node (preset names a surface); list_materials / get_material / set_material_properties edit a material itself, changing every node wearing it.
- Targeting geometry: name/id/dimensions → node ids or query ops; anything else ("this edge", "that hole") → capture_screenshot first, then click_view at the pixel. click_view action 'select' + screenshot:true returns the image in the same result — the highlight on it is the shape you meant; the user sees the same.
- A run_program call is one undo step: its ops run in order, and a failure rolls the whole call back.
- ask_user blocks the run until the user answers; the card carries one question, and its options render as buttons, so an enumerable answer is one click. The document, the selection and a screenshot answer what the model's state is; what only the user can answer is intent — how big, which face, keep or discard.`;
}

/**
 * Fresh document snapshot appended at every run start: answers "what is in the scene"
 * up front, so the model can skip the first get_document_state / get_selection round trip.
 */
function contextSection(): string {
    return `Current document (snapshot taken when this run started; call get_document_state or get_selection for a fresh mid-run read):
${documentSnapshot()}`;
}

function rulesSection(): string {
    return `Rules:
- Units are mm, angles are degrees (the two exceptions, both documented where they appear: simplifyShape's angleTolerance is in radians, and the conicalSurface.semiAngle query reports radians).
- box/rect/pyramid are corner-based: plane.origin is a corner. cylinder/cone use center as the base-face center and extend +dz along normal. sphere uses center as its true center.
- Plan exact dimensions; verify volume/bounds with query ops. Cuts require volume reduction; never blame camera/zoom without geometric proof.
- When an op or tool call fails, read the error message and fix the cause — re-run only the failed ops (refs persist across calls). If a node was deleted or not found, call get_document_state to re-read the active tree instead of retrying. Load the error-recovery skill when stuck.
- The user is watching the viewport; results appear live. If no document is open, call new_document; never replace a document that is already open.
- Reply in the same language as the user.`;
}
