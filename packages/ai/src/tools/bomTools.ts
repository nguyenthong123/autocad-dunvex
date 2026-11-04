// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Annotation, FolderNode, type IDocument, type INode, NodeUtils } from "@chili3d/core";
import type { Tool } from "../llm/types";
import { measureNode } from "./arrayTools";
import { findNode, requireDocument } from "./documentContext";

export type MaterialForm = "sheet" | "bar" | "block" | "flat-2d" | "wire-1d";

export interface MaterialClassification {
    nodeId: string;
    name: string;
    materialName: string;
    materialColor: string;
    dimensions: {
        lengthMm: number;
        widthMm: number;
        thicknessMm: number;
    };
    form: MaterialForm;
    ratios: {
        aspectLW: number;
        aspectWT: number;
        slendernessTL: number;
    };
    evidence: string;
    hidden?: boolean;
}

export interface BomReportItem {
    id: string;
    materialName: string;
    materialColor: string;
    dimensions: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
    form: MaterialForm;
    unit: "piece" | "m2" | "m";
    count: number;
    totalLengthM: number;
    totalAreaM2: number;
    nodeIds: string[];
    hiddenCount?: number;
}

export interface BomReportSummary {
    totalTypes: number;
    totalPieces: number;
    totalLengthM: number;
    totalAreaM2: number;
    totalHiddenPieces?: number;
}

export interface CollectedLeafNode {
    node: INode;
    hidden: boolean;
}

export function isNodeEffectiveVisible(node: INode): boolean {
    if (node.visible === false) return false;
    let curr: INode | undefined = node.parent;
    while (curr) {
        if (curr.visible === false) return false;
        curr = curr.parent;
    }
    return true;
}

function getChildren(node: INode): INode[] {
    const list: INode[] = [];
    if (NodeUtils.isLinkedListNode(node)) {
        let child = node.firstChild;
        while (child) {
            list.push(child);
            child = child.nextSibling;
        }
    }
    return list;
}

export function collectLeafNodes(doc: IDocument, targetNodeIds?: string[]): CollectedLeafNode[] {
    const leafNodes: CollectedLeafNode[] = [];
    const root = doc.modelManager.rootNode;

    if (targetNodeIds && targetNodeIds.length > 0) {
        // Explicit nodeIds passed: include hidden nodes, but mark hidden: true
        const visit = (node: INode) => {
            const children = getChildren(node);
            if (children.length > 0 && (node instanceof FolderNode || node === root)) {
                for (const child of children) {
                    visit(child);
                }
            } else if (!(node instanceof Annotation) && node !== root) {
                const hidden = !isNodeEffectiveVisible(node);
                leafNodes.push({ node, hidden });
            }
        };

        for (const id of targetNodeIds) {
            const node = findNode(doc, id);
            if (node) visit(node);
        }
    } else {
        // No nodeIds passed: omit hidden nodes and nodes inside hidden folders entirely
        const visit = (node: INode) => {
            if (node !== root && node.visible === false) return;
            const children = getChildren(node);
            if (children.length > 0 && (node instanceof FolderNode || node === root)) {
                for (const child of children) {
                    visit(child);
                }
            } else if (!(node instanceof Annotation) && node !== root) {
                leafNodes.push({ node, hidden: false });
            }
        };

        visit(root);
    }

    return leafNodes;
}

function getMaterialInfo(doc: IDocument, node: INode): { name: string; color: string } {
    const matId = Reflect.get(node, "materialId") ?? Reflect.get(node, "faceMaterialId");
    if (matId && doc.modelManager.materials) {
        for (const mat of doc.modelManager.materials) {
            if (mat.id === matId) {
                const hex =
                    mat.color !== undefined ? `#${mat.color.toString(16).padStart(6, "0")}` : "#d3d3d3";
                return { name: mat.name || "Vật liệu", color: hex };
            }
        }
    }

    const cleanName = node.name
        ? node.name.replace(/_copy\d*|\s*-\s*copy\d*|\s*\(\d+\)/gi, "").trim()
        : "Mặc định (Chưa gán)";
    return { name: cleanName, color: "#d3d3d3" };
}

export function classifyForm(
    lengthMm: number,
    widthMm: number,
    thicknessMm: number,
): {
    form: MaterialForm;
    ratios: { aspectLW: number; aspectWT: number; slendernessTL: number };
    evidence: string;
} {
    const L = lengthMm;
    const W = widthMm;
    const T = thicknessMm;

    const ratios = {
        aspectLW: Math.round((L / (W || 1)) * 100) / 100,
        aspectWT: Math.round((W / (T || 1)) * 100) / 100,
        slendernessTL: Math.round((T / (L || 1)) * 1000) / 1000,
    };

    if (T <= 0.05) {
        if (W > 0.05) {
            return {
                form: "flat-2d",
                ratios,
                evidence: `Biên dạng phẳng 2D: T=${T} <= 0.05 mm, W=${W} mm, L=${L} mm`,
            };
        }
        return {
            form: "wire-1d",
            ratios,
            evidence: `Đường nét / Dây 1D: T=${T} <= 0.05 mm, W=${W} <= 0.05 mm, L=${L} mm`,
        };
    }

    const tOverL = T / (L || 1);
    const wOverT = W / (T || 1);
    const lOverW = L / (W || 1);

    if (tOverL <= 0.12 && wOverT >= 3) {
        return {
            form: "sheet",
            ratios,
            evidence: `Tấm / Ván / Mặt đá mỏng: T/L=${tOverL.toFixed(3)} <= 0.12, W/T=${wOverT.toFixed(2)} >= 3`,
        };
    }

    if (lOverW >= 3 && wOverT < 3) {
        return {
            form: "bar",
            ratios,
            evidence: `Thanh / Hộp / Ray dài: L/W=${lOverW.toFixed(2)} >= 3, W/T=${wOverT.toFixed(2)} < 3`,
        };
    }

    return {
        form: "block",
        ratios,
        evidence: `Khối / Cục / Trụ đặc: T/L=${tOverL.toFixed(3)}, W/T=${wOverT.toFixed(2)}, L/W=${lOverW.toFixed(2)}`,
    };
}

interface BomToolArgs {
    nodeIds?: string[];
}

export function buildBomTools(): Tool[] {
    return [
        {
            name: "classify_material",
            description:
                "Classify visible parts into stock forms (sheet / bar / block / flat-2d / wire-1d) based on geometric aspect ratios L >= W >= T mm and material properties. Omits hidden parts when nodeIds is omitted; marks hidden:true when hidden nodeIds are explicitly passed.",
            parameters: {
                type: "object",
                properties: {
                    nodeIds: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Optional list of node IDs to classify. If omitted, classifies all visible document nodes.",
                    },
                },
            },
            handler: (args) => {
                const doc = requireDocument();
                if (typeof doc === "string") return Promise.resolve(doc);

                const nodeIds = (args as unknown as BomToolArgs).nodeIds;
                const leafNodes = collectLeafNodes(doc, nodeIds);

                const items: MaterialClassification[] = [];
                for (const { node, hidden } of leafNodes) {
                    const m = measureNode(node);
                    if (!m) continue;

                    const dx = Math.round(m.dimensions.x * 10) / 10;
                    const dy = Math.round(m.dimensions.y * 10) / 10;
                    const dz = Math.round(m.dimensions.z * 10) / 10;
                    const sorted = [dx, dy, dz].sort((a, b) => b - a);
                    const L = sorted[0];
                    const W = sorted[1];
                    const T = sorted[2];

                    const mat = getMaterialInfo(doc, node);
                    const { form, ratios, evidence } = classifyForm(L, W, T);

                    items.push({
                        nodeId: node.id,
                        name: node.name,
                        materialName: mat.name,
                        materialColor: mat.color,
                        dimensions: { lengthMm: L, widthMm: W, thicknessMm: T },
                        form,
                        ratios,
                        evidence,
                        ...(hidden ? { hidden: true } : {}),
                    });
                }

                return Promise.resolve(
                    JSON.stringify({
                        count: items.length,
                        items,
                    }),
                );
            },
        },
        {
            name: "bom_report",
            description:
                "Generate Bill of Materials (BOM) summary report grouping parts by material and L x W x T specifications, with piece counts, linear meters, square meters, and Markdown table. Strict parity with UI measure.bom calculation formula. Omits hidden nodes when nodeIds is omitted; includes hidden parts with hiddenCount when explicit nodeIds are given.",
            parameters: {
                type: "object",
                properties: {
                    nodeIds: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Optional list of node IDs or folder IDs to include in the BOM report. If omitted, calculates BOM for all visible document geometry.",
                    },
                },
            },
            handler: (args) => {
                const doc = requireDocument();
                if (typeof doc === "string") return Promise.resolve(doc);

                const nodeIds = (args as unknown as BomToolArgs).nodeIds;
                const leafNodes = collectLeafNodes(doc, nodeIds);

                const groupMap = new Map<string, BomReportItem>();

                for (const { node, hidden } of leafNodes) {
                    const m = measureNode(node);
                    if (!m) continue;

                    const dx = Math.round(m.dimensions.x * 10) / 10;
                    const dy = Math.round(m.dimensions.y * 10) / 10;
                    const dz = Math.round(m.dimensions.z * 10) / 10;
                    if (dx === 0 && dy === 0 && dz === 0) continue;

                    const sorted = [dx, dy, dz].sort((a, b) => b - a);
                    const L = sorted[0];
                    const W = sorted[1];
                    const T = sorted[2];

                    let dimStr: string;
                    if (T > 0.05) {
                        dimStr = `${L} × ${W} × ${T} mm`;
                    } else if (W > 0.05) {
                        dimStr = `${L} × ${W} mm`;
                    } else {
                        dimStr = `${L} mm`;
                    }

                    const mat = getMaterialInfo(doc, node);
                    const { form } = classifyForm(L, W, T);
                    const groupKey = `${mat.name}___${mat.color}___${dimStr}`;

                    let item = groupMap.get(groupKey);
                    if (!item) {
                        item = {
                            id: groupKey,
                            materialName: mat.name,
                            materialColor: mat.color,
                            dimensions: dimStr,
                            lengthMm: L,
                            widthMm: W,
                            thicknessMm: T,
                            form,
                            unit: T > 0.05 && W > 0.05 ? "piece" : W > 0.05 ? "m2" : "m",
                            count: 0,
                            totalLengthM: 0,
                            totalAreaM2: 0,
                            nodeIds: [],
                            hiddenCount: 0,
                        };
                        groupMap.set(groupKey, item);
                    }
                    item.count += 1;
                    if (hidden) {
                        item.hiddenCount = (item.hiddenCount ?? 0) + 1;
                    }
                    item.nodeIds.push(node.id);
                }

                const items = Array.from(groupMap.values());
                let totalPieces = 0;
                let totalLengthM = 0;
                let totalAreaM2 = 0;
                let totalHiddenPieces = 0;

                for (const item of items) {
                    item.totalLengthM = Math.round(((item.lengthMm * item.count) / 1000) * 100) / 100;
                    item.totalAreaM2 =
                        Math.round(((item.lengthMm * item.widthMm * item.count) / 1000000) * 100) / 100;
                    totalPieces += item.count;
                    totalLengthM += item.totalLengthM;
                    totalAreaM2 += item.totalAreaM2;
                    if (item.hiddenCount) {
                        totalHiddenPieces += item.hiddenCount;
                    }
                }

                totalLengthM = Math.round(totalLengthM * 100) / 100;
                totalAreaM2 = Math.round(totalAreaM2 * 100) / 100;

                // Sort identically to computeBomReport in packages/app/src/commands/measure/bom.ts
                items.sort((a, b) => a.materialName.localeCompare(b.materialName) || b.count - a.count);

                const summary: BomReportSummary = {
                    totalTypes: items.length,
                    totalPieces,
                    totalLengthM,
                    totalAreaM2,
                    ...(totalHiddenPieces > 0 ? { totalHiddenPieces } : {}),
                };

                // Generate Markdown table
                const tableRows = items.map((item, index) => {
                    const hiddenSuffix =
                        item.hiddenCount && item.hiddenCount > 0 ? ` (${item.hiddenCount} ẩn)` : "";
                    return `| ${index + 1} | ${item.materialName} | ${item.dimensions} | ${item.form} | ${item.count}${hiddenSuffix} | ${item.totalLengthM.toFixed(2)} | ${item.totalAreaM2.toFixed(2)} |`;
                });

                const markdownTable = [
                    "| STT | Tên vật tư / Mô tả | Quy cách (L×W×T mm) | Dạng | SL (cái) | Mét dài (m) | Diện tích (m²) |",
                    "| :---: | :--- | :--- | :---: | :---: | :---: | :---: |",
                    ...tableRows,
                    `| **Tổng** | **${items.length} quy cách** | - | - | **${totalPieces}${totalHiddenPieces > 0 ? ` (${totalHiddenPieces} ẩn)` : ""}** | **${totalLengthM.toFixed(2)}** | **${totalAreaM2.toFixed(2)}** |`,
                ].join("\n");

                return Promise.resolve(
                    JSON.stringify({
                        summary,
                        items,
                        markdownTable,
                    }),
                );
            },
        },
    ];
}
