// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { COMMAND_GUIDE_CARDS, commandGuide, findCommandGuide, SkillStore, searchCommandGuides } from "../src";

describe("commandGuide skill & knowledge base", () => {
    test("registers command-guide skill in SkillStore", () => {
        const skills = SkillStore.getAll();
        const skill = skills.find((s) => s.name === "command-guide");
        expect(skill).toBeDefined();
        expect(skill?.name).toBe("command-guide");
        expect(skill?.content).toContain("Chili3D Command Knowledge Base");
        expect(skill?.content).toContain("Core Geometric Rules");
    });

    test("contains comprehensive cards covering all focus commands", () => {
        expect(COMMAND_GUIDE_CARDS.length).toBeGreaterThanOrEqual(45);

        const categories = new Set(COMMAND_GUIDE_CARDS.map((c) => c.category));
        expect(categories).toContain("create");
        expect(categories).toContain("modify");
        expect(categories).toContain("measure");
        expect(categories).toContain("annotate");
        expect(categories).toContain("boolean");
        expect(categories).toContain("convert");
        expect(categories).toContain("sketch");
        expect(categories).toContain("parametric");
        expect(categories).toContain("pro");
    });

    test("every command card has complete metadata and instructions", () => {
        for (const card of COMMAND_GUIDE_CARDS) {
            expect(card.commandKey.length).toBeGreaterThan(0);
            expect(card.aliases.length).toBeGreaterThan(0);
            expect(card.purpose.length).toBeGreaterThan(5);
            expect(card.whenToUse.length).toBeGreaterThan(0);
            expect(card.whenNotToUse.length).toBeGreaterThan(0);
            expect(card.requiredPreconditions.length).toBeGreaterThan(0);
            expect(card.acceptedSelectionTypes.length).toBeGreaterThan(0);
            expect(card.inputSequence.length).toBeGreaterThan(0);
            expect(card.geometryConstraints.length).toBeGreaterThan(0);
            expect(card.commonFailures.length).toBeGreaterThan(0);
            expect(card.recoverySteps.length).toBeGreaterThan(0);
            expect(card.verificationSteps.length).toBeGreaterThan(0);
            expect(card.userStepByStepGuide.length).toBeGreaterThan(0);
        }
    });

    test("findCommandGuide finds cards by key, alias, or Vietnamese keyword", () => {
        const box = findCommandGuide("create.box");
        expect(box).toBeDefined();
        expect(box?.commandKey).toBe("create.box");

        const cut = findCommandGuide("trừ bớt");
        expect(cut).toBeDefined();
        expect(cut?.commandKey).toBe("boolean.cut");

        const extrude = findCommandGuide("extrude");
        expect(extrude).toBeDefined();

        const fillet = findCommandGuide("bo góc");
        expect(fillet).toBeDefined();

        const notFound = findCommandGuide("nonexistent.command.xyz");
        expect(notFound).toBeUndefined();
    });

    test("searchCommandGuides filters multiple matching cards", () => {
        const sketchCards = searchCommandGuides("sketch");
        expect(sketchCards.length).toBeGreaterThan(5);
        expect(sketchCards.some((c) => c.commandKey === "sketch.line")).toBe(true);

        const proCards = searchCommandGuides("pro");
        expect(proCards.length).toBeGreaterThan(3);

        const all = searchCommandGuides("");
        expect(all.length).toBe(COMMAND_GUIDE_CARDS.length);
    });

    test("enforces coordinate placement rules: corner vs base center vs true center", () => {
        const box = findCommandGuide("create.box");
        expect(box?.geometryConstraints.some((g) => g.includes("GÓC"))).toBe(true);

        const cyl = findCommandGuide("create.cylinder");
        expect(cyl?.geometryConstraints.some((g) => g.includes("TÂM MẶT ĐÁY"))).toBe(true);

        const sphere = findCommandGuide("create.sphere");
        expect(sphere?.geometryConstraints.some((g) => g.includes("TÂM THẬT"))).toBe(true);
    });

    test("enforces through-hole cutter overshoot on boolean.cut", () => {
        const cut = findCommandGuide("boolean.cut");
        expect(cut?.consumesInputs).toBe(true);
        expect(cut?.replacesInputs).toBe(true);
        expect(
            cut?.geometryConstraints.some(
                (g) => g.includes("VƯỢT QUA CẢ 2 MẶT TƯỜNG") || g.includes("overshoot"),
            ),
        ).toBe(true);
    });

    test("enforces closed and coplanar profile on extrude and revol", () => {
        const ext = findCommandGuide("create.extrude");
        expect(ext?.geometryConstraints.some((g) => g.includes("KHÉP KÍN") && g.includes("ĐỒNG PHẲNG"))).toBe(
            true,
        );

        const revol = findCommandGuide("create.revol");
        expect(revol?.geometryConstraints.some((g) => g.includes("trục xoay"))).toBe(true);
    });
});
