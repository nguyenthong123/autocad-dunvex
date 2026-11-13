// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Matrix4, Precision, XYZ } from "@chili3d/core";
import { CATALOG_ITEMS, findCatalogItem } from "../src/catalog/items";
import { calculateWallPlacement } from "../src/geometry/placementHelper";

describe("Component Library Plugin", () => {
    describe("Catalog Specifications", () => {
        test("all catalog items have valid verified real specs", () => {
            expect(CATALOG_ITEMS.length).toBeGreaterThanOrEqual(4);

            for (const item of CATALOG_ITEMS) {
                expect(item.code).toBeTruthy();
                expect(item.name).toBeTruthy();
                expect(item.width).toBeGreaterThan(0);
                expect(item.thickness).toBeGreaterThan(0);
                expect(item.defaultLength).toBeGreaterThan(0);
                expect(item.step).toBeGreaterThan(0);
                expect(item.step).toBeGreaterThanOrEqual(item.width);
                expect(item.isVerifiedRealSpec).toBe(true);
                expect(item.svgPreview).toContain("<svg");
            }
        });

        test("findCatalogItem retrieves items case-insensitively", () => {
            const item = findCatalogItem("lh-5050");
            expect(item).toBeDefined();
            expect(item?.code).toBe("LH-5050");
            expect(item?.width).toBe(50);
            expect(item?.thickness).toBe(50);
            expect(item?.step).toBe(60); // 50mm slat + 10mm technical gap
        });

        test("LS-3S-150 3-wave panel has interlock pitch equal to width", () => {
            const item = findCatalogItem("LS-3S-150");
            expect(item).toBeDefined();
            expect(item?.width).toBe(150);
            expect(item?.thickness).toBe(15);
            expect(item?.step).toBe(150); // Interlock joint: pitch equals effective width
        });
    });

    describe("Wall Placement Geometry (calculateWallPlacement)", () => {
        const anchor = new XYZ(100, 200, 300);

        test("standard vertical wall facing +Y (Ốp đứng / Vertical)", () => {
            const normal = new XYZ(0, 1, 0);
            const res = calculateWallPlacement(normal, anchor, "vertical", false);
            expect(res.isOk).toBe(true);

            const { plane, widthDir, lengthDir, normalDir } = res.value;
            // Origin at anchor
            expect(plane.origin.distanceTo(anchor)).toBeLessThan(Precision.Distance);
            // Normal matches wall normal (0, 1, 0)
            expect(normalDir.distanceTo(normal)).toBeLessThan(Precision.Distance);
            // Length runs vertically up along +Z (0, 0, 1)
            expect(lengthDir.distanceTo(new XYZ(0, 0, 1))).toBeLessThan(Precision.Distance);

            // Plane vectors
            expect(plane.xvec.distanceTo(widthDir)).toBeLessThan(Precision.Distance);
            expect(plane.yvec.distanceTo(lengthDir)).toBeLessThan(Precision.Distance);
            expect(plane.normal.distanceTo(normalDir)).toBeLessThan(Precision.Distance);
        });

        test("standard vertical wall facing +Y (Ốp ngang / Horizontal)", () => {
            const normal = new XYZ(0, 1, 0);
            const res = calculateWallPlacement(normal, anchor, "horizontal", false);
            expect(res.isOk).toBe(true);

            const { plane, widthDir, lengthDir, normalDir } = res.value;
            expect(normalDir.distanceTo(normal)).toBeLessThan(Precision.Distance);
            // Length runs horizontally in the wall plane
            expect(Math.abs(lengthDir.dot(XYZ.unitZ))).toBeLessThan(Precision.Distance);
            expect(Math.abs(lengthDir.dot(normal))).toBeLessThan(Precision.Distance);
            expect(plane.yvec.distanceTo(lengthDir)).toBeLessThan(Precision.Distance);
        });

        test("flip direction inverts length axis", () => {
            const normal = new XYZ(0, 1, 0);
            const vertFlipped = calculateWallPlacement(normal, anchor, "vertical", true);
            expect(vertFlipped.isOk).toBe(true);
            expect(vertFlipped.value.lengthDir.distanceTo(new XYZ(0, 0, -1))).toBeLessThan(
                Precision.Distance,
            );

            const horizNormal = calculateWallPlacement(normal, anchor, "horizontal", false);
            const horizFlipped = calculateWallPlacement(normal, anchor, "horizontal", true);
            expect(horizNormal.isOk).toBe(true);
            expect(horizFlipped.isOk).toBe(true);
            expect(
                horizNormal.value.lengthDir.distanceTo(horizFlipped.value.lengthDir.reverse()),
            ).toBeLessThan(Precision.Distance);
        });

        test("wall rotated at 45 degrees in world space", () => {
            const angle = Math.PI / 4;
            const normal = new XYZ(Math.sin(angle), Math.cos(angle), 0);
            const res = calculateWallPlacement(normal, anchor, "vertical", false);
            expect(res.isOk).toBe(true);

            const { plane, widthDir, lengthDir, normalDir } = res.value;
            // Length must still be vertical +Z (0, 0, 1)
            expect(lengthDir.distanceTo(new XYZ(0, 0, 1))).toBeLessThan(Precision.Distance);
            // Width direction must be perpendicular to normal and Z
            expect(Math.abs(widthDir.dot(normalDir))).toBeLessThan(Precision.Distance);
            expect(Math.abs(widthDir.dot(XYZ.unitZ))).toBeLessThan(Precision.Distance);
            // Orthonormality
            expect(Math.abs(plane.xvec.length() - 1)).toBeLessThan(Precision.Distance);
            expect(Math.abs(plane.yvec.length() - 1)).toBeLessThan(Precision.Distance);
            expect(Math.abs(plane.normal.length() - 1)).toBeLessThan(Precision.Distance);
        });

        test("slanted wall (inclined at 30 degrees)", () => {
            const rad = Math.PI / 6; // 30 degrees
            const normal = new XYZ(0, Math.cos(rad), Math.sin(rad)); // inclined normal
            const res = calculateWallPlacement(normal, anchor, "vertical", false);
            expect(res.isOk).toBe(true);

            const { plane, widthDir, lengthDir, normalDir } = res.value;
            // Must be mutually orthogonal
            expect(Math.abs(widthDir.dot(lengthDir))).toBeLessThan(Precision.Distance);
            expect(Math.abs(widthDir.dot(normalDir))).toBeLessThan(Precision.Distance);
            expect(Math.abs(lengthDir.dot(normalDir))).toBeLessThan(Precision.Distance);
            // Horizontal vector across the slanted wall must have 0 Z component
            expect(Math.abs(widthDir.z)).toBeLessThan(Precision.Distance);
        });

        test("rejects horizontal floor/ceiling with clear error", () => {
            const floorNormal = new XYZ(0, 0, 1);
            const resFloor = calculateWallPlacement(floorNormal, anchor, "vertical");
            expect(resFloor.isOk).toBe(false);
            expect(resFloor.error).toContain("mặt phẳng nằm ngang");

            const ceilingNormal = new XYZ(0, 0, -1);
            const resCeil = calculateWallPlacement(ceilingNormal, anchor, "vertical");
            expect(resCeil.isOk).toBe(false);
            expect(resCeil.error).toContain("mặt phẳng nằm ngang");
        });

        test("rejects zero or degenerate normal", () => {
            const zeroNormal = new XYZ(0, 0, 0);
            const res = calculateWallPlacement(zeroNormal, anchor, "vertical");
            expect(res.isOk).toBe(false);
        });
    });

    describe("Array Pitch & Translation Math", () => {
        test("calculates accurate translation matrix for linear array", () => {
            const normal = new XYZ(0, 1, 0);
            const placement = calculateWallPlacement(normal, new XYZ(0, 0, 0), "vertical", false).value;

            const step = 60; // mm
            const count = 5;
            const dir = placement.widthDir;

            const matrices: Matrix4[] = [];
            for (let i = 1; i < count; i++) {
                const trans = dir.multiply(step * i);
                matrices.push(Matrix4.fromTranslation(trans.x, trans.y, trans.z));
            }

            expect(matrices.length).toBe(4);

            // First copy at 60 mm along widthDir
            const p0 = new XYZ(0, 0, 0);
            const p1 = matrices[0].ofPoint(p0);
            expect(p1.distanceTo(dir.multiply(60))).toBeLessThan(Precision.Distance);

            // Last copy at 240 mm (4 * 60 mm) along widthDir
            const p4 = matrices[3].ofPoint(p0);
            expect(p4.distanceTo(dir.multiply(240))).toBeLessThan(Precision.Distance);
        });
    });
});
