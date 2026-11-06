// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { buildProposeTaskPlanTool, governTools } from "../governance";
import type { Tool } from "../llm/types";
import { buildSkillTool } from "../skills";
import { buildArrayTools } from "./arrayTools";
import { buildAskUserTool } from "./askUser";
import { buildBomTools } from "./bomTools";
import { buildCapabilityTools } from "./capabilityEngine";
import { buildCommandTools } from "./commandTools";
import { buildDiagnosticTools } from "./diagnosticTools";
import { buildDocumentTools } from "./documentTools";
import { buildFileTools } from "./fileTools";
import { buildMaterialTools } from "./materialTools";
import { buildNodeTools } from "./nodeTools";
import { buildParametricTools } from "./parametricTools";
import { buildPropertyTools } from "./propertyTools";
import { buildReadTools } from "./readTools";
import { buildRibbonTools } from "./ribbonTools";
import { buildSelectionTools } from "./selectionTools";
import { buildSessionMemoryTools } from "./sessionMemoryTools";
import { buildVariableTools } from "./variableTools";
import { buildCaptureViewsTool, buildViewTools } from "./viewTools";

/**
 * Full tool registry for ChatPanel and bridge.
 * Handlers are wrapped by the Batch B governance gate so both surfaces share one control path.
 */
export function buildTools(): Tool[] {
    return governTools(buildUngovernedTools());
}

/** Raw tools without the permission gate — unit tests of individual handlers use the builders directly. */
export function buildUngovernedTools(): Tool[] {
    return [
        ...buildReadTools(),
        ...buildRibbonTools(),
        ...buildNodeTools(),
        ...buildPropertyTools(),
        ...buildViewTools(),
        ...buildSelectionTools(),
        ...buildFileTools(),
        ...buildCapabilityTools(),
        buildSkillTool(),
        // Everything below is appended, never inserted: the API matches the cached prompt
        // prefix in the order tools -> system -> messages, so putting a tool anywhere but
        // the end invalidates the tools prefix of every conversation already in flight.
        ...buildParametricTools(),
        ...buildVariableTools(),
        buildAskUserTool(),
        ...buildMaterialTools(),
        buildCaptureViewsTool(),
        // Appended last for the same reason: a newly added tool must not shift the cached prefix.
        ...buildDocumentTools(),
        ...buildArrayTools(),
        ...buildDiagnosticTools(),
        ...buildSessionMemoryTools(),
        ...buildBomTools(),
        ...buildCommandTools(),
        // Appended: trusted plan-approval request (UI grants rights; model cannot self-approve).
        buildProposeTaskPlanTool(),
    ];
}
