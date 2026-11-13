// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export type ComponentCategory = "lam-hop" | "tam-op-song" | "thanh-da-nang";

export type ComponentOrientation = "vertical" | "horizontal";

export interface CatalogItem {
    readonly code: string;
    readonly name: string;
    readonly category: ComponentCategory;
    /** Width across wall face (mm) */
    readonly width: number;
    /** Thickness protruding outward from wall face (mm) */
    readonly thickness: number;
    /** Default length along wall (mm) */
    readonly defaultLength: number;
    /** Recommended installation step / pitch between centers (mm) */
    readonly step: number;
    /** Note on gap or joint (e.g. "Khe hở kỹ thuật 10 mm", "Hèm khóa âm dương") */
    readonly jointNote: string;
    /** Material description */
    readonly material: string;
    /** Default color hex */
    readonly defaultColor: string;
    /** Detailed description */
    readonly description: string;
    /** Whether this is a verified production specification */
    readonly isVerifiedRealSpec: boolean;
    /** SVG diagram representation of the profile cross-section */
    readonly svgPreview: string;
}
