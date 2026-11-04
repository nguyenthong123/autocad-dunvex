// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { beforeEach, describe, expect, test } from "@rstest/core";
import { buildSystemPrompt } from "../src/llm/prompt";
import {
    clearSessionMemory,
    formatSessionMemorySummary,
    getSessionMemory,
    onNodeRenamed,
    onNodesCreated,
    onNodesRemoved,
    onRecentError,
    onUserConstraint,
    SESSION_MEMORY_MAX_SUMMARY_CHARS,
    updateSessionMemory,
} from "../src/memory";
import { buildTools } from "../src/tools";

describe("sessionMemory short-term AI memory", () => {
    beforeEach(() => {
        clearSessionMemory();
    });

    test("initializes with empty structured memory", () => {
        const mem = getSessionMemory();
        expect(mem.goal).toBe("");
        expect(mem.currentPlan).toEqual([]);
        expect(mem.completedSteps).toEqual([]);
        expect(mem.pendingSteps).toEqual([]);
        expect(mem.userConstraints).toEqual({});
        expect(mem.activeNodes).toEqual([]);
        expect(mem.removedNodeIds).toEqual([]);
        expect(mem.recentErrors).toEqual([]);
    });

    test("updates goal, steps, and user constraints via patch", () => {
        updateSessionMemory({
            goal: "Thiết kế bàn trà gỗ 4 chân",
            currentPlan: ["Tạo mặt bàn", "Tạo 4 chân bàn", "Tạo giằng chân"],
            pendingSteps: ["Tạo mặt bàn", "Tạo 4 chân bàn", "Tạo giằng chân"],
            userConstraints: { chieu_cao: 450, duong_kinh: 800 },
        });

        let mem = getSessionMemory();
        expect(mem.goal).toBe("Thiết kế bàn trà gỗ 4 chân");
        expect(mem.currentPlan.length).toBe(3);
        expect(mem.userConstraints["chieu_cao"]).toBe(450);

        updateSessionMemory({
            completedSteps: ["Tạo mặt bàn"],
            pendingSteps: ["Tạo 4 chân bàn", "Tạo giằng chân"],
        });

        mem = getSessionMemory();
        expect(mem.completedSteps).toEqual(["Tạo mặt bàn"]);
        expect(mem.pendingSteps).toEqual(["Tạo 4 chân bàn", "Tạo giằng chân"]);
    });

    test("lifecycle hooks track created, removed, and renamed nodes", () => {
        onNodesCreated([
            { id: "mat_ban", name: "Mặt bàn tròn" },
            { id: "chan_1", name: "Chân 1" },
            { id: "chan_2", name: "Chân 2" },
        ]);

        let mem = getSessionMemory();
        expect(mem.activeNodes.length).toBe(3);
        expect(mem.activeNodes.some((n) => n.id === "mat_ban")).toBe(true);

        onNodeRenamed("mat_ban", "Mặt bàn gỗ sồi");
        mem = getSessionMemory();
        expect(mem.activeNodes.find((n) => n.id === "mat_ban")?.name).toBe("Mặt bàn gỗ sồi");

        // When a node is consumed/removed (e.g. by booleanCut or delete)
        onNodesRemoved(["chan_2"]);
        mem = getSessionMemory();
        expect(mem.activeNodes.some((n) => n.id === "chan_2")).toBe(false);
        expect(mem.removedNodeIds).toContain("chan_2");
    });

    test("lifecycle hooks record user constraints and recent errors", () => {
        onUserConstraint("ban_kinh_goc", 15);
        onRecentError({
            toolName: "run_program",
            operation: "fillet",
            errorMessage: "Radius too large for adjacent face",
        });

        const mem = getSessionMemory();
        expect(mem.userConstraints["ban_kinh_goc"]).toBe(15);
        expect(mem.recentErrors.length).toBe(1);
        expect(mem.recentErrors[0].toolName).toBe("run_program");
    });

    test("formatSessionMemorySummary stays within character limit", () => {
        updateSessionMemory({
            goal: "Thiết kế chi tiết phức tạp với nhiều bước kiểm tra",
            currentPlan: Array.from({ length: 20 }, (_, i) => `Bước ${i + 1} chi tiết`),
            completedSteps: ["Bước 1", "Bước 2"],
            pendingSteps: ["Bước 3"],
            userConstraints: { a: 1, b: 2, c: 3 },
            activeNodes: Array.from({ length: 20 }, (_, i) => ({ id: `node_${i}`, name: `Chi tiết ${i}` })),
            removedNodeIds: Array.from({ length: 20 }, (_, i) => `consumed_${i}`),
        });

        const summary = formatSessionMemorySummary();
        expect(summary.length).toBeLessThanOrEqual(SESSION_MEMORY_MAX_SUMMARY_CHARS);
        expect(summary).toContain("## Active Session Memory");
        expect(summary).toContain("Removed/Consumed nodes (FORBIDDEN to reuse/reference)");
    });

    test("injects session memory into volatile section of buildSystemPrompt", () => {
        updateSessionMemory({
            goal: "Dựng hộp giảm tốc trục vít",
            userConstraints: { ti_so_truyen: 20 },
        });

        const { stable, volatile } = buildSystemPrompt();
        expect(volatile).toContain("## Active Session Memory");
        expect(volatile).toContain("Dựng hộp giảm tốc trục vít");
        expect(volatile).toContain("ti_so_truyen");

        // Stable portion must NOT contain session memory to preserve prompt cache
        expect(stable).not.toContain("Dựng hộp giảm tốc trục vít");
    });

    test("session memory tools operate correctly", async () => {
        const tools = buildTools();
        const getTool = tools.find((t) => t.name === "get_session_memory");
        const updateTool = tools.find((t) => t.name === "update_session_memory");
        const clearTool = tools.find((t) => t.name === "clear_session_memory");

        expect(getTool).toBeDefined();
        expect(updateTool).toBeDefined();
        expect(clearTool).toBeDefined();

        await updateTool!.handler({
            goal: "Mô hình hóa khung giàn thép",
            currentPlan: ["Dựng cột", "Dựng xà"],
            userConstraints: { vat_lieu: "SS400" },
        });

        const getRes = JSON.parse((await getTool!.handler({})) as string);
        expect(getRes.goal).toBe("Mô hình hóa khung giàn thép");
        expect(getRes.userConstraints["vat_lieu"]).toBe("SS400");

        const clearRes = JSON.parse((await clearTool!.handler({})) as string);
        expect(clearRes.cleared).toBe(true);
        expect(getSessionMemory().goal).toBe("");
    });

    test("requireNode checks removedNodeIds in sessionMemory", async () => {
        const { requireNode } = await import("../src/tools/documentContext");
        const mockDoc = {
            modelManager: {
                findNodes: () => [],
            },
        } as any;

        // Mark node as removed in session memory
        onNodesRemoved(["consumed_cylinder_1"]);

        const res = requireNode(mockDoc, "consumed_cylinder_1");
        expect(typeof res).toBe("string");
        const parsed = JSON.parse(res as string);
        expect(parsed.error).toContain("consumed_cylinder_1");
        expect(parsed.error).toContain("sessionMemory.removedNodeIds");
    });
});
