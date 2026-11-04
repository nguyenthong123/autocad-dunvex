// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    BoundingBox,
    cloneForCopyNode,
    FolderNode,
    type IDocument,
    type INode,
    Matrix4,
    NodeUtils,
    ShapeNode,
    Transaction,
    type VisualNode,
    XYZ,
} from "@chili3d/core";
import type { Tool } from "../llm/types";
import { getSessionMemory, onNodesCreated } from "../memory";
import { findNode, requireDocument, requireNode } from "./documentContext";

export const MAX_ARRAY_COUNT = 200;

export interface NodeMeasurement {
    id: string;
    name: string;
    bounds: {
        min: { x: number; y: number; z: number };
        max: { x: number; y: number; z: number };
    };
    dimensions: { x: number; y: number; z: number };
    approxVolumeMm3: number;
}

export function measureNode(node: INode): NodeMeasurement | undefined {
    let box: BoundingBox | undefined;
    if ("boundingBox" in node && typeof (node as any).boundingBox === "function") {
        box = (node as any).boundingBox() as BoundingBox | undefined;
    }
    // Fallback: If 3D solid ShapeNode mesh is not tessellated or empty, try B-rep shape bounding box
    if (!box && node instanceof ShapeNode) {
        if (node.shape.isOk) {
            const sh = node.shape.value;
            if (typeof sh?.boundingBox === "function") {
                const bRepBox = sh.boundingBox() as BoundingBox | undefined;
                if (bRepBox) {
                    box = BoundingBox.transformed(bRepBox, node.transform);
                }
            }
        }
    }
    if (!box) return undefined;

    // Core contract: node.boundingBox() already incorporates node.transform (GeometryNode, MeshNode, SketchNode).
    // If the node resides in an ancestor visual hierarchy where worldTransform() differs from node.transform,
    // apply only the ancestor transformation (worldTransform * node.transform^-1).
    // If worldTransform equals node.transform (or no parent hierarchy), box is already in world coordinates.
    let worldBox = box;
    try {
        if (
            typeof (node as any).worldTransform === "function" &&
            "transform" in node &&
            (node as any).transform instanceof Matrix4
        ) {
            const worldTransform = (node as any).worldTransform() as Matrix4;
            const nodeTransform = (node as any).transform as Matrix4;
            if (!worldTransform.equals(nodeTransform)) {
                const inv = nodeTransform.clone().invert();
                if (inv) {
                    const parentTransform = worldTransform.multiply(inv);
                    worldBox = BoundingBox.transformed(box, parentTransform);
                }
            }
        }
    } catch {
        worldBox = box;
    }

    const dx = Math.abs(worldBox.max.x - worldBox.min.x);
    const dy = Math.abs(worldBox.max.y - worldBox.min.y);
    const dz = Math.abs(worldBox.max.z - worldBox.min.z);
    return {
        id: node.id,
        name: node.name,
        bounds: {
            min: { x: worldBox.min.x, y: worldBox.min.y, z: worldBox.min.z },
            max: { x: worldBox.max.x, y: worldBox.max.y, z: worldBox.max.z },
        },
        dimensions: { x: dx, y: dy, z: dz },
        approxVolumeMm3: dx * dy * dz,
    };
}

export interface ArrayPlanResult {
    feasible: boolean;
    planId?: string;
    reason?: string;
    suggestedAction?: string;
    count: number;
    copiesToCreate?: number;
    availableSpan: number;
    itemSize: number;
    pitch?: number;
    gap?: number;
    totalSpan?: number;
    overflowMm?: number;
    leftoverMm?: number;
    maxFittingCount?: number;
    expectedBounds?: {
        axis: "x" | "y" | "z";
        start: number;
        end: number;
    };
    offsets?: number[];
}

export interface StoredArrayPlan {
    planId: string;
    nodeId: string;
    sourceFingerprint: {
        bounds: {
            min: { x: number; y: number; z: number };
            max: { x: number; y: number; z: number };
        };
        dimensions: { x: number; y: number; z: number };
    };
    axis: "x" | "y" | "z";
    count: number;
    pitch: number;
    gap?: number;
    itemDim: number;
    availableSpan: number;
    createdAt: number;
}

const activePlans = new Map<string, StoredArrayPlan>();
const PLAN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function _clearActivePlans(): void {
    activePlans.clear();
}

export function _getActivePlansCount(): number {
    return activePlans.size;
}

export function _getActivePlan(planId: string): StoredArrayPlan | undefined {
    return activePlans.get(planId);
}

export function planArrayLogic(params: {
    itemDim: number;
    axis: "x" | "y" | "z";
    count: number;
    availableSpan: number;
    gap?: number;
    pitch?: number;
    startCoord?: number;
}): ArrayPlanResult {
    const { itemDim, axis, count, availableSpan, gap, pitch, startCoord = 0 } = params;

    if (count < 2) {
        return {
            feasible: false,
            count,
            availableSpan,
            itemSize: itemDim,
            reason: "Count must be at least 2 items.",
            suggestedAction: "Specify count >= 2.",
        };
    }

    if (count > MAX_ARRAY_COUNT) {
        return {
            feasible: false,
            count,
            availableSpan,
            itemSize: itemDim,
            reason: `Count (${count}) exceeds maximum safe limit of ${MAX_ARRAY_COUNT} items.`,
            suggestedAction: `Reduce count to ${MAX_ARRAY_COUNT} or fewer.`,
        };
    }

    // Case 1: Fixed gap specified
    if (gap !== undefined) {
        const calculatedPitch = itemDim + gap;
        const totalSpan = (count - 1) * calculatedPitch + itemDim;
        if (totalSpan > availableSpan) {
            const overflow = totalSpan - availableSpan;
            const maxFitting = Math.max(0, Math.floor((availableSpan + gap) / (itemDim + gap)));
            return {
                feasible: false,
                count,
                availableSpan,
                itemSize: itemDim,
                gap,
                pitch: calculatedPitch,
                totalSpan,
                overflowMm: overflow,
                maxFittingCount: maxFitting,
                reason: `Total span (${totalSpan} mm) exceeds available span (${availableSpan} mm) by ${overflow} mm.`,
                suggestedAction: `Reduce count to at most ${maxFitting} or reduce gap.`,
            };
        }
        const offsets = Array.from({ length: count - 1 }, (_, i) => (i + 1) * calculatedPitch);
        return {
            feasible: true,
            count,
            copiesToCreate: count - 1,
            availableSpan,
            itemSize: itemDim,
            pitch: calculatedPitch,
            gap,
            totalSpan,
            leftoverMm: availableSpan - totalSpan,
            expectedBounds: {
                axis,
                start: startCoord,
                end: startCoord + totalSpan,
            },
            offsets,
        };
    }

    // Case 2: Fixed pitch specified
    if (pitch !== undefined) {
        const calculatedGap = pitch - itemDim;
        const totalSpan = (count - 1) * pitch + itemDim;
        if (totalSpan > availableSpan) {
            const overflow = totalSpan - availableSpan;
            const maxFitting = Math.max(0, Math.floor((availableSpan - itemDim) / pitch) + 1);
            return {
                feasible: false,
                count,
                availableSpan,
                itemSize: itemDim,
                pitch,
                gap: calculatedGap,
                totalSpan,
                overflowMm: overflow,
                maxFittingCount: maxFitting,
                reason: `Total span (${totalSpan} mm) exceeds available span (${availableSpan} mm) by ${overflow} mm.`,
                suggestedAction: `Reduce count to at most ${maxFitting} or reduce pitch.`,
            };
        }
        const offsets = Array.from({ length: count - 1 }, (_, i) => (i + 1) * pitch);
        return {
            feasible: true,
            count,
            copiesToCreate: count - 1,
            availableSpan,
            itemSize: itemDim,
            pitch,
            gap: calculatedGap,
            totalSpan,
            leftoverMm: availableSpan - totalSpan,
            expectedBounds: {
                axis,
                start: startCoord,
                end: startCoord + totalSpan,
            },
            offsets,
        };
    }

    // Case 3: Fit count evenly across availableSpan (fit_count)
    const minSpanRequired = count * itemDim;
    if (minSpanRequired > availableSpan) {
        const overflow = minSpanRequired - availableSpan;
        const maxFitting = Math.max(0, Math.floor(availableSpan / itemDim));
        return {
            feasible: false,
            count,
            availableSpan,
            itemSize: itemDim,
            overflowMm: overflow,
            maxFittingCount: maxFitting,
            reason: `Total item thickness (${minSpanRequired} mm) exceeds compartment span (${availableSpan} mm). Negative gap would result.`,
            suggestedAction: `Reduce count to at most ${maxFitting} or decrease item thickness.`,
        };
    }

    const calculatedPitch = (availableSpan - itemDim) / (count - 1);
    const calculatedGap = calculatedPitch - itemDim;
    const offsets = Array.from({ length: count - 1 }, (_, i) => (i + 1) * calculatedPitch);

    return {
        feasible: true,
        count,
        copiesToCreate: count - 1,
        availableSpan,
        itemSize: itemDim,
        pitch: calculatedPitch,
        gap: calculatedGap,
        totalSpan: availableSpan,
        leftoverMm: 0,
        expectedBounds: {
            axis,
            start: startCoord,
            end: startCoord + availableSpan,
        },
        offsets,
    };
}

function measureNodesTool(): Tool {
    return {
        name: "measure_nodes",
        description:
            "Measure world-space bounding box, width/depth/height dimensions, and volume in millimeters for one or more nodes.",
        parameters: {
            type: "object",
            properties: {
                nodeIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of node IDs to measure.",
                },
            },
            required: ["nodeIds"],
        },
        handler: async (args) => {
            const doc = requireDocument();
            if (typeof doc === "string") return doc;
            const nodeIds = args["nodeIds"] as string[];
            if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
                return JSON.stringify({ error: "nodeIds must be a non-empty array of node ids" });
            }

            const measurements: NodeMeasurement[] = [];
            for (const id of nodeIds) {
                const node = findNode(doc, id);
                if (!node) {
                    try {
                        const mem = getSessionMemory();
                        if (mem.removedNodeIds.includes(id)) {
                            return JSON.stringify({
                                error: `Node "${id}" was consumed or removed by a previous edit operation (found in sessionMemory.removedNodeIds). It no longer exists in the document model. Call get_document_state to view current active nodes, or measure the newly created node instead.`,
                            });
                        }
                    } catch {
                        // ignore
                    }
                    return JSON.stringify({
                        error: `Node not found: ${id}. The node does not exist in the document. Call get_document_state to view the active model tree before measuring.`,
                    });
                }
                const m = measureNode(node);
                if (!m) {
                    return JSON.stringify({
                        error: `Node cannot be measured (no bounding box): ${id}. The node "${node.name}" (${node.constructor.name}) does not contain valid measurable 3D geometric bounds or mesh. If this node is an empty sketch or non-geometric node, call get_document_state to inspect the active hierarchy or target a valid solid body. Verification status: unverified.`,
                    });
                }
                measurements.push(m);
            }

            return JSON.stringify({
                nodes: measurements,
            });
        },
    };
}

function planArrayTool(): Tool {
    return {
        name: "plan_array",
        description:
            "Plan a 1D linear array (e.g., wooden slats, louvers, ribs, shelf supports). Preflight calculates feasibility, pitch, gap, leftover, expected bounds, and overflow without creating any nodes.",
        parameters: {
            type: "object",
            properties: {
                nodeId: { type: "string", description: "Source node ID to repeat." },
                axis: {
                    type: "string",
                    enum: ["x", "y", "z"],
                    description: "Arrangement axis along which items will be repeated.",
                },
                count: { type: "number", description: "Total desired items (including the source item)." },
                availableSpan: {
                    type: "number",
                    description: "Total available space/span of the compartment or bay in millimeters.",
                },
                itemSize: {
                    type: "number",
                    description:
                        "Optional item thickness along the axis in mm. Defaults to node measured dimension.",
                },
                gap: {
                    type: "number",
                    description: "Optional fixed gap between items in mm.",
                },
                pitch: {
                    type: "number",
                    description: "Optional fixed center-to-center pitch between items in mm.",
                },
            },
            required: ["nodeId", "axis", "count", "availableSpan"],
        },
        handler: async (args) => {
            const doc = requireDocument();
            if (typeof doc === "string") return doc;
            const nodeId = args["nodeId"] as string;
            const axis = args["axis"] as "x" | "y" | "z";
            const count = Number(args["count"]);
            const availableSpan = Number(args["availableSpan"]);
            const gap = args["gap"] !== undefined ? Number(args["gap"]) : undefined;
            const pitch = args["pitch"] !== undefined ? Number(args["pitch"]) : undefined;

            const node = findNode(doc, nodeId);
            if (!node) return JSON.stringify({ error: `Node not found: ${nodeId}` });

            const m = measureNode(node);
            const itemDim = args["itemSize"] !== undefined ? Number(args["itemSize"]) : m?.dimensions[axis];
            if (itemDim === undefined || Number.isNaN(itemDim) || itemDim <= 0) {
                return JSON.stringify({
                    error: `Cannot determine item size along axis ${axis}. Specify itemSize explicitly.`,
                });
            }

            const startCoord = m?.bounds.min[axis] ?? 0;
            const plan = planArrayLogic({
                itemDim,
                axis,
                count,
                availableSpan,
                gap,
                pitch,
                startCoord,
            });

            if (plan.feasible) {
                const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                plan.planId = planId;
                activePlans.set(planId, {
                    planId,
                    nodeId,
                    sourceFingerprint: {
                        bounds: {
                            min: { ...m!.bounds.min },
                            max: { ...m!.bounds.max },
                        },
                        dimensions: { ...m!.dimensions },
                    },
                    axis,
                    count,
                    pitch: plan.pitch!,
                    gap: plan.gap,
                    itemDim,
                    availableSpan,
                    createdAt: Date.now(),
                });
            }

            return JSON.stringify(plan);
        },
    };
}

function applyArrayTool(): Tool {
    return {
        name: "apply_array",
        description:
            "Execute a batch array operation cloning a source node along an axis with given pitch. Uses fast matrix copying in a single transaction. Requires an approved planId from plan_array. Safe limit: up to 200 items.",
        parameters: {
            type: "object",
            properties: {
                planId: {
                    type: "string",
                    description:
                        "Approved plan ID from plan_array. Direct execution without planning is prohibited.",
                },
                nodeId: { type: "string", description: "Source node ID to clone." },
                axis: { type: "string", enum: ["x", "y", "z"], description: "Axis direction." },
                count: { type: "number", description: "Total items in array (2 to 200)." },
                pitch: { type: "number", description: "Displacement pitch between consecutive items in mm." },
                folderName: {
                    type: "string",
                    description:
                        "Optional folder name to group array elements. Defaults to 'Mảng <nodeName> (<count>)'.",
                },
            },
            required: ["planId", "nodeId", "axis", "count", "pitch"],
        },
        handler: async (args) => {
            const doc = requireDocument();
            if (typeof doc === "string") return doc;

            const planId = args["planId"] as string | undefined;
            if (!planId || typeof planId !== "string" || !planId.trim()) {
                return JSON.stringify({
                    error: "Preflight plan required: apply_array requires a valid planId returned by plan_array. Direct execution without planning is prohibited.",
                });
            }

            const plan = activePlans.get(planId);
            if (!plan) {
                return JSON.stringify({
                    error: `Array plan not found or expired for planId "${planId}". Call plan_array first to obtain an approved plan.`,
                });
            }

            // Check TTL
            if (Date.now() - plan.createdAt > PLAN_TTL_MS) {
                activePlans.delete(planId);
                return JSON.stringify({
                    error: `Array plan "${planId}" has expired. Call plan_array again to obtain an active plan.`,
                });
            }

            const nodeId = args["nodeId"] as string;
            const axis = args["axis"] as "x" | "y" | "z";
            const count = Number(args["count"]);
            const pitch = Number(args["pitch"]);
            const customFolderName = args["folderName"] as string | undefined;

            // Enforce parameter match against approved plan
            if (
                nodeId !== plan.nodeId ||
                axis !== plan.axis ||
                count !== plan.count ||
                Math.abs(pitch - plan.pitch) > 1e-4
            ) {
                return JSON.stringify({
                    error: `Parameters do not match approved planId "${planId}". Expected nodeId="${plan.nodeId}", axis="${plan.axis}", count=${plan.count}, pitch=${plan.pitch}; got nodeId="${nodeId}", axis="${axis}", count=${count}, pitch=${pitch}. Re-run plan_array with updated parameters.`,
                });
            }

            if (count < 2 || count > MAX_ARRAY_COUNT) {
                return JSON.stringify({
                    error: `Count must be between 2 and ${MAX_ARRAY_COUNT} items (received ${count}).`,
                });
            }
            if (Number.isNaN(pitch) || pitch === 0) {
                return JSON.stringify({ error: "Pitch must be a non-zero number." });
            }

            const sourceNode = findNode(doc, nodeId);
            if (!sourceNode) {
                activePlans.delete(planId);
                return JSON.stringify({ error: `Node not found: ${nodeId}` });
            }
            if (!("transform" in sourceNode) && !("clone" in sourceNode)) {
                activePlans.delete(planId);
                return JSON.stringify({ error: `Node ${nodeId} cannot be cloned as a spatial visual node.` });
            }

            // Re-measure source node in document to detect mutation/movement since plan creation
            const currM = measureNode(sourceNode);
            if (!currM) {
                activePlans.delete(planId);
                return JSON.stringify({
                    error: `Cannot measure source node ${nodeId} for pre-flight verification.`,
                });
            }

            const tol = 1e-3;
            const posDiff =
                Math.abs(currM.bounds.min.x - plan.sourceFingerprint.bounds.min.x) +
                Math.abs(currM.bounds.min.y - plan.sourceFingerprint.bounds.min.y) +
                Math.abs(currM.bounds.min.z - plan.sourceFingerprint.bounds.min.z) +
                Math.abs(currM.bounds.max.x - plan.sourceFingerprint.bounds.max.x) +
                Math.abs(currM.bounds.max.y - plan.sourceFingerprint.bounds.max.y) +
                Math.abs(currM.bounds.max.z - plan.sourceFingerprint.bounds.max.z);

            const dimDiff =
                Math.abs(currM.dimensions.x - plan.sourceFingerprint.dimensions.x) +
                Math.abs(currM.dimensions.y - plan.sourceFingerprint.dimensions.y) +
                Math.abs(currM.dimensions.z - plan.sourceFingerprint.dimensions.z);

            if (posDiff > tol || dimDiff > tol) {
                activePlans.delete(planId);
                return JSON.stringify({
                    error: `Source node "${sourceNode.name}" has been moved or resized since plan was created. Re-run plan_array.`,
                });
            }

            // Pre-flight bounds check immediately before creating nodes
            const totalSpan = (count - 1) * pitch + plan.itemDim;
            if (totalSpan > plan.availableSpan + 1e-3) {
                activePlans.delete(planId);
                return JSON.stringify({
                    error: `Total array span (${totalSpan} mm) exceeds compartment available span (${plan.availableSpan} mm). Execution aborted.`,
                });
            }

            // Consume plan
            activePlans.delete(planId);

            const dir =
                axis === "x"
                    ? new XYZ(pitch, 0, 0)
                    : axis === "y"
                      ? new XYZ(0, pitch, 0)
                      : new XYZ(0, 0, pitch);

            const createdNodes: VisualNode[] = [];
            const folderName = customFolderName || `Mảng ${sourceNode.name} (${count})`;

            Transaction.execute(doc, "AI Array", () => {
                for (let i = 1; i < count; i++) {
                    const matrix = Matrix4.fromTranslation(dir.x * i, dir.y * i, dir.z * i);
                    const copy = cloneForCopyNode(sourceNode as VisualNode, matrix);
                    copy.name = `${sourceNode.name} (${i + 1})`;
                    createdNodes.push(copy);
                }

                const folder = new FolderNode({ document: doc, name: folderName });
                const targetParent =
                    sourceNode.parent instanceof FolderNode
                        ? sourceNode.parent
                        : (doc.modelManager.currentNode ?? doc.modelManager.rootNode);

                if (typeof (targetParent as any).add === "function") {
                    (targetParent as any).add(folder);
                } else if (typeof (targetParent as any).addNode === "function") {
                    (targetParent as any).addNode(folder);
                } else {
                    doc.modelManager.addNode(folder);
                }

                folder.add(...createdNodes);
            });

            onNodesCreated(createdNodes.map((n) => ({ id: n.id, name: n.name })));

            return JSON.stringify({
                planId,
                folderName,
                createdCount: createdNodes.length,
                totalCount: count,
                created: createdNodes.map((n) => ({ nodeId: n.id, name: n.name })),
            });
        },
    };
}

export function buildArrayTools(): Tool[] {
    return [measureNodesTool(), planArrayTool(), applyArrayTool()];
}
