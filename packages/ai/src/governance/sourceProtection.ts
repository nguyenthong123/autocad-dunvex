// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, INode } from "@chili3d/core";
import { NodeUtils } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";

/**
 * Source-node protection state for the active document.
 * Existing nodes are protected by default; task-owned creations are not.
 */
const protectedByDocument = new WeakMap<IDocument, Set<string>>();
const boundDocuments = new WeakMap<IDocument, true>();

export function listDocumentNodeIds(doc: IDocument): string[] {
    const ids = new Set<string>();
    for (const node of doc.modelManager.findNodes()) {
        ids.add(node.id);
    }
    if (typeof doc.modelManager.findNodesDeep === "function") {
        for (const node of doc.modelManager.findNodesDeep()) {
            ids.add(node.id);
        }
    }
    return [...ids];
}

/** Snapshot every current node as a protected source. Safe to call repeatedly. */
export function refreshSourceProtection(doc: IDocument): void {
    protectedByDocument.set(doc, new Set(listDocumentNodeIds(doc)));
    boundDocuments.set(doc, true);
}

/** Ensure the active document has a protection snapshot. */
export function ensureSourceProtection(doc?: IDocument): IDocument | undefined {
    const active = doc ?? getDocument();
    if (!active) return undefined;
    if (!boundDocuments.has(active) || !protectedByDocument.has(active)) {
        refreshSourceProtection(active);
    }
    return active;
}

export function getProtectedNodeIds(doc?: IDocument): ReadonlySet<string> {
    const active = ensureSourceProtection(doc);
    if (!active) return new Set();
    return protectedByDocument.get(active) ?? new Set();
}

export function isSourceProtected(nodeId: string, doc?: IDocument): boolean {
    return getProtectedNodeIds(doc).has(nodeId);
}

/**
 * Absorb nodes that appeared outside the agent's task-owned set into the protected
 * snapshot (user-created geometry mid-session). Call before each write check.
 */
export function absorbForeignNodes(taskOwnedNodeIds: ReadonlySet<string> | string[], doc?: IDocument): void {
    const active = ensureSourceProtection(doc);
    if (!active) return;
    const owned = taskOwnedNodeIds instanceof Set ? taskOwnedNodeIds : new Set(taskOwnedNodeIds);
    const protectedIds = protectedByDocument.get(active) ?? new Set<string>();
    for (const id of listDocumentNodeIds(active)) {
        if (owned.has(id)) continue;
        protectedIds.add(id);
    }
    protectedByDocument.set(active, protectedIds);
}

/** Collect a node and every descendant id for tree / delete impact. */
export function collectSubtreeIds(node: INode): string[] {
    if (NodeUtils.isLinkedListNode(node)) {
        return [node.id, ...[...NodeUtils.children(node)].map((child) => child.id)];
    }
    return [node.id];
}

/** Test helper: drop the binding so the next ensure re-snapshots. */
export function resetSourceProtectionForTests(doc?: IDocument): void {
    const active = doc ?? getDocument();
    if (!active) return;
    protectedByDocument.delete(active);
    boundDocuments.delete(active);
}
