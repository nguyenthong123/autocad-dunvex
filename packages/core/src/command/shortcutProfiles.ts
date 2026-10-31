// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Navigation3DType } from "../navigation";
import type { CommandKeys } from "./commandKeys";

export type ShortcutMap = Partial<Record<CommandKeys, string | string[]>>;

const MODIFIER_KEYS = new Set(["ctrl", "shift", "alt"]);

/** Keys whose name is spelled out on screen rather than uppercased. */
const NAMED_KEYS = new Map([
    ["delete", "Delete"],
    ["backspace", "Backspace"],
    ["enter", "Enter"],
    ["escape", "Escape"],
    ["tab", "Tab"],
    ["space", "Space"],
]);

function displayKey(key: string): string {
    if (key === " ") return "Space";
    const named = NAMED_KEYS.get(key.toLowerCase());
    if (named !== undefined) return named;
    return key.length > 1 ? key : key.toUpperCase();
}

/**
 * Display form of one shortcut spec. A spec is leading modifiers plus a sequence of keys —
 * "ctrl+s" is Ctrl with S, while "m+v" is M then V (Revit's move), and modifiers apply to the
 * last key of a sequence.
 */
export function formatShortcutKey(key: string): string {
    const segments = key.split("+");
    const modifiers: string[] = [];
    while (segments.length > 1 && MODIFIER_KEYS.has(segments[0].toLowerCase())) {
        const modifier = segments.shift() ?? "";
        modifiers.push(modifier[0].toUpperCase() + modifier.slice(1));
    }

    const keys = segments.map(displayKey);
    const last = keys.pop() ?? "";
    keys.push([...modifiers, last].join("+"));
    return keys.join(" then ");
}

export const Chili3dShortcuts: ShortcutMap = {
    // System
    "doc.save": "ctrl+s",
    "doc.open": "ctrl+o",
    "edit.undo": "ctrl+z",
    "edit.redo": ["ctrl+y", "ctrl+shift+z"],
    "modify.deleteNode": ["Delete", "Backspace"],
    "special.last": [" ", "Enter"],

    // Sketching
    "create.line": "l",
    "create.rect": "r",
    "create.circle": "c",
    "measure.length": "d",

    // Primitives
    "create.box": "b",
    "create.sphere": "s",
    "create.cylinder": "y",
    "create.cone": "n",
    "create.pipe": "shift+p",

    // Modify
    "modify.trim": "t",
    "create.offset": "o",
    "modify.rotate": "shift+r",
    "create.extrude": "p",
    "modify.move": "m",
    "modify.array": "shift+a",
    "boolean.common": "shift+i",
    "modify.explode": "x",
    "modify.chamfer": "shift+c",
    "modify.fillet": "shift+f",
    // The one feature command with a key of its own: Press Pull is the entry point that reads the
    // selection and hands off, so the key has to reach it before any pick starts.
    "feature.pressPull": "q",
};

export const AutoCADCommandAliases: Record<string, CommandKeys> = {
    L: "create.line",
    LINE: "create.line",
    PL: "create.polygon",
    PLINE: "create.polygon",
    REC: "create.rect",
    RECTANG: "create.rect",
    C: "create.circle",
    CIRCLE: "create.circle",
    A: "create.arc3point",
    ARC: "create.arc",
    EL: "create.ellipse",
    ELLIPSE: "create.ellipse",
    POL: "create.regularPolygon",
    POLYGON: "create.regularPolygon",
    PO: "create.point",
    POINT: "create.point",
    SPL: "create.bezier",
    O: "create.offset",
    OFFSET: "create.offset",
    P: "view.pan",
    PAN: "view.pan",
    EXT: "create.extrude",
    EXTRUDE: "create.extrude",
    REV: "create.revol",
    REVOLVE: "create.revol",
    SWEEP: "create.sweep",
    LOFT: "create.loft",
    M: "modify.move",
    MOVE: "modify.move",
    RO: "modify.rotate",
    ROTATE: "modify.rotate",
    MI: "modify.mirror",
    MIRROR: "modify.mirror",
    AR: "modify.array",
    ARRAY: "modify.array",
    TR: "modify.trim",
    TRIM: "modify.trim",
    EX: "modify.extend",
    EXTEND: "modify.extend",
    BR: "modify.break",
    BREAK: "modify.break",
    F: "modify.fillet",
    FILLET: "modify.fillet",
    CHA: "modify.chamfer",
    CHAMFER: "modify.chamfer",
    X: "modify.explode",
    EXPLODE: "modify.explode",
    E: "modify.deleteNode",
    ERASE: "modify.deleteNode",
    DIM: "annotate.dimension",
    DLI: "annotate.dimension",
    DRA: "annotate.radius",
    DAN: "annotate.angle",
    T: "annotate.text",
    MTEXT: "annotate.text",
    TEXT: "annotate.text",
    DI: "measure.length",
    DIST: "measure.length",
    LA: "create.folder",
    LAYER: "create.folder",
    U: "edit.undo",
    UNDO: "edit.undo",
    REDO: "edit.redo",
    QSAVE: "doc.save",
    SAVE: "doc.save",
    OPEN: "doc.open",
    NEW: "doc.new",
    IMPORT: "file.import",
    EXPORT: "file.export",
};

export const AutoCADShortcuts: ShortcutMap = {
    ...Chili3dShortcuts,
    "view.pan": "p",
    "create.extrude": "e+x+t",
    "create.line": "l",
    "create.polygon": "p+l",
    "create.rect": "r+e+c",
    "create.circle": "c",
    "create.arc3point": "a",
    "create.ellipse": "e+l",
    "create.offset": "o",
    "modify.move": "m",
    "modify.rotate": "r+o",
    "modify.mirror": "m+i",
    "modify.trim": "t+r",
    "modify.extend": "e+x",
    "modify.fillet": "f",
    "modify.chamfer": "c+h+a",
    "modify.explode": "x",
    "modify.deleteNode": ["Delete", "Backspace"],
    "annotate.dimension": "d+l+i",
    "annotate.radius": "d+r+a",
    "annotate.angle": "d+a+n",
};

export const DefaultShortcuts: ShortcutMap = Chili3dShortcuts;

export const RevitShortcuts: ShortcutMap = {
    ...Chili3dShortcuts,
    "modify.move": "m+v", // MV
    "modify.rotate": "r+o", // RO
    "modify.trim": "t+r", // TR
    "create.line": "l+i", // LI
    // Add more as needed
};

export const BlenderShortcuts: ShortcutMap = {
    ...DefaultShortcuts,
    "modify.move": "g",
    "modify.rotate": "r",
    "create.extrude": "e",
    // "delete": "x" // if key exists
};

export const SolidworksShortcuts: ShortcutMap = {
    ...DefaultShortcuts,
    "create.line": "l",
    // Often heavily mouse/gesture based or S-key menu
};

export const CreoShortcuts: ShortcutMap = {
    ...DefaultShortcuts,
};

export const ShortcutProfiles: Record<Navigation3DType, ShortcutMap> = {
    Chili3d: Chili3dShortcuts,
    AutoCAD: AutoCADShortcuts,
    Revit: RevitShortcuts,
    Blender: BlenderShortcuts,
    Creo: CreoShortcuts,
    Solidworks: SolidworksShortcuts,
};
