// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Fields a model may invent to self-grant write rights. Stripped before impact analysis;
 * they never reach the permission decision as authority.
 */
const SELF_GRANT_KEYS = new Set([
    "approved",
    "force",
    "permission",
    "permissions",
    "grant",
    "bypass",
    "skipPermission",
    "skip_permission",
    "allowProtected",
    "allow_protected",
    "authorized",
    "selfApproved",
    "self_approved",
]);

/** Deep-clone args while dropping self-grant keys at every object level. */
export function stripSelfApproval(args: Record<string, unknown>): Record<string, unknown> {
    return stripValue(args) as Record<string, unknown>;
}

function stripValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(stripValue);
    }
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (SELF_GRANT_KEYS.has(key)) continue;
            out[key] = stripValue(child);
        }
        return out;
    }
    return value;
}
