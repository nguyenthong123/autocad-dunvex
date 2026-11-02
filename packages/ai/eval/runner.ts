// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import "./setupGlobals";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Id, Result, ShapeNode, ShapeTypes, setCurrentApplication } from "@chili3d/core";
import { createMockApplication, initializeI18n, MockShape, TestDocument } from "@chili3d/core/test-utils";
import { runAgent } from "../src/llm/agent";
import type { ChatMessage, TokenUsage } from "../src/llm/types";
import { buildTools } from "../src/tools";
import { ReplayProvider } from "./replayProvider";
import type { EvalReport, Scenario, ScenarioRecording, ScenarioResult } from "./types";

initializeI18n();

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = resolve(__dirname);
const SCENARIOS_DIR = resolve(EVAL_DIR, "scenarios");
const FIXTURES_DIR = resolve(EVAL_DIR, "fixtures");
const SYNTHETIC_RECORDINGS_DIR = resolve(EVAL_DIR, "synthetic-recordings");
const REPORTS_DIR = resolve(EVAL_DIR, "reports");

function createEvalShapeFactory(): any {
    return new Proxy(
        {},
        {
            get(_target, prop: string) {
                return (..._args: any[]) => {
                    const mockShape = new MockShape({
                        shapeType: ShapeTypes.solid,
                        id: `shape-${prop}-${Id.generate()}`,
                    });
                    (mockShape as any).transformedMul = () => new MockShape({ shapeType: ShapeTypes.solid });
                    return Result.ok(mockShape);
                };
            },
        },
    );
}

let sharedApp: any = null;

function setupApplicationForDoc(doc: TestDocument) {
    if (!sharedApp) {
        sharedApp = createMockApplication({
            shapeProvider: {
                factory: createEvalShapeFactory(),
                converter: {} as any,
            },
        });
        try {
            setCurrentApplication(sharedApp);
        } catch {
            // Already initialized
        }
    }
    sharedApp.activeView = { document: doc };
    (doc as any).application = sharedApp;
    return sharedApp;
}

function loadScenario(file: string): Scenario {
    const content = readFileSync(join(SCENARIOS_DIR, file), "utf-8");
    return JSON.parse(content) as Scenario;
}

async function runScenario(scenario: Scenario, isLive: boolean): Promise<ScenarioResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Check if scenario is marked pending (e.g. pending-TASK-21)
    if (scenario.status === "pending-TASK-21") {
        return {
            id: scenario.id,
            status: "pending",
            durationMs: 0,
            toolCallsCount: 0,
            tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
            errors: [],
            pendingReason: "Depends on TASK-21 (measure_nodes / apply_array fast path)",
        };
    }

    // Check if scenario is marked needs-review
    if (scenario.status === "needs-review") {
        return {
            id: scenario.id,
            status: "needs-review",
            durationMs: 0,
            toolCallsCount: 0,
            tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
            errors: [],
            reviewReason:
                "Expectation needs review (relaxed or mismatched in synthetic run, waiting for user decision)",
        };
    }

    // Fixture loading
    const fixturePath = resolve(EVAL_DIR, scenario.fixture);
    let fixtureData: any = { nodes: [], materials: [], components: [] };
    if (existsSync(fixturePath)) {
        fixtureData = JSON.parse(readFileSync(fixturePath, "utf-8"));
    } else {
        errors.push(`Fixture not found: ${scenario.fixture}`);
    }

    const doc = new TestDocument();
    doc.selection = {
        clearSelection: () => {},
        select: () => {},
        unselect: () => {},
        getSelection: () => [],
        isSelected: () => false,
    } as any;
    if (!doc.visual) {
        doc.visual = { update: () => {}, box: () => undefined } as any;
    } else {
        (doc.visual as any).update = () => {};
    }
    setupApplicationForDoc(doc);

    try {
        if (fixtureData.nodes && fixtureData.nodes.length > 0) {
            await doc.modelManager.deserialize(fixtureData);
        }
        for (const node of doc.modelManager.findNodesDeep(() => true)) {
            if (node instanceof ShapeNode) {
                const mockShape = new MockShape({ shapeType: ShapeTypes.solid, id: node.id });
                (mockShape as any).transformedMul = () => new MockShape({ shapeType: ShapeTypes.solid });
                (node as any)._shape = Result.ok(mockShape);
            }
        }
    } catch (e: any) {
        errors.push(`Failed to deserialize fixture: ${e?.message ?? String(e)}`);
    }

    // Provider setup
    let provider: any;
    if (isLive) {
        errors.push("Live mode not enabled. Need user decision on provider and API key.");
        return {
            id: scenario.id,
            status: "fail",
            durationMs: Date.now() - startTime,
            toolCallsCount: 0,
            tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
            errors,
        };
    } else {
        const recPath = join(SYNTHETIC_RECORDINGS_DIR, `${scenario.id}.json`);
        if (!existsSync(recPath)) {
            return {
                id: scenario.id,
                status: "no-recording",
                durationMs: 0,
                toolCallsCount: 0,
                tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
                errors: [`Synthetic recording not found: ${recPath}`],
            };
        }
        const recording = JSON.parse(readFileSync(recPath, "utf-8")) as ScenarioRecording;
        provider = new ReplayProvider(recording);
    }

    // Callbacks tracking
    const executedToolCalls: Array<{ name: string; arguments: string; result?: string }> = [];
    let assistantText = "";
    let thinkingText = "";
    let lastUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
    };

    const messages: ChatMessage[] = [{ role: "user", content: scenario.prompt }];

    try {
        await runAgent({
            config: { provider: "anthropic", apiKey: "eval-key", model: "eval-model" },
            system: { stable: "Chili3D CAD Assistant", volatile: "" },
            messages,
            tools: buildTools(),
            provider,
            callbacks: {
                onTextDelta: (t) => {
                    assistantText += t;
                },
                onThinkingDelta: (t) => {
                    thinkingText += t;
                },
                onToolCall: (call) => {
                    executedToolCalls.push(call);
                },
                onUsage: (u) => {
                    lastUsage = u;
                },
            },
        });
    } catch (e: any) {
        errors.push(`Agent loop threw error: ${e?.message ?? String(e)}`);
    }

    const durationMs = Date.now() - startTime;

    // Evaluate Expectation
    const expect = scenario.expect;

    if (expect.countNodes) {
        const allNodes = doc.modelManager.findNodesDeep(() => true).filter((n) => n.id !== "root");
        let matched = allNodes;
        if (expect.countNodes.name) {
            const pattern = new RegExp(`^${expect.countNodes.name.replace(/\*/g, ".*")}$`, "i");
            matched = matched.filter((n) => pattern.test(n.name));
        }
        if (expect.countNodes.equals !== undefined && matched.length !== expect.countNodes.equals) {
            errors.push(`countNodes mismatch: expected ${expect.countNodes.equals}, got ${matched.length}`);
        }
        if (expect.countNodes.min !== undefined && matched.length < expect.countNodes.min) {
            errors.push(`countNodes < min: expected >= ${expect.countNodes.min}, got ${matched.length}`);
        }
        if (expect.countNodes.max !== undefined && matched.length > expect.countNodes.max) {
            errors.push(`countNodes > max: expected <= ${expect.countNodes.max}, got ${matched.length}`);
        }
    }

    if (expect.nodeProperties) {
        const id = expect.nodeProperties.id;
        const name = expect.nodeProperties.name;
        const node = doc.modelManager.findNodesDeep((n) => (id ? n.id === id : n.name === name))[0];
        if (!node) {
            errors.push(`Node not found for property inspection: id=${id} name=${name}`);
        } else {
            if (
                expect.nodeProperties.materialId &&
                (node as any).materialId !== expect.nodeProperties.materialId
            ) {
                errors.push(
                    `materialId mismatch on node ${node.id}: expected ${expect.nodeProperties.materialId}, got ${(node as any).materialId}`,
                );
            }
        }
    }

    if (expect.askUserCalled) {
        const calledAsk = executedToolCalls.some((c) => c.name === "ask_user");
        if (!calledAsk) {
            errors.push("Expected agent to call ask_user, but it did not");
        }
    }

    if (expect.refusal) {
        const lower = assistantText.toLowerCase();
        const indicatedRefusal =
            lower.includes("không thể") ||
            lower.includes("unable") ||
            lower.includes("cannot") ||
            lower.includes("bất khả thi");
        if (!indicatedRefusal && executedToolCalls.length > 0) {
            errors.push(
                "Expected refusal for impossible task, but agent proceeded with tool calls or gave positive answer",
            );
        }
    }

    if (expect.toolCalled) {
        for (const tool of expect.toolCalled) {
            if (!executedToolCalls.some((c) => c.name === tool)) {
                errors.push(`Expected tool "${tool}" to be called, but it was not`);
            }
        }
    }

    // Evaluate Budget
    if (executedToolCalls.length > scenario.budget.maxToolCalls) {
        errors.push(`Exceeded maxToolCalls: ${executedToolCalls.length} > ${scenario.budget.maxToolCalls}`);
    }
    if (durationMs > scenario.budget.maxSeconds * 1000) {
        errors.push(`Exceeded maxSeconds: ${durationMs / 1000}s > ${scenario.budget.maxSeconds}s`);
    }

    return {
        id: scenario.id,
        status: errors.length === 0 ? "pass" : "fail",
        durationMs,
        toolCallsCount: executedToolCalls.length,
        toolCalls: executedToolCalls,
        tokenUsage: lastUsage,
        errors,
    };
}

export async function main() {
    const args = process.argv.slice(2);
    const isLive = args.includes("--live");
    const scenarioFilterIndex = args.indexOf("--scenario");
    const targetScenarioId = scenarioFilterIndex >= 0 ? args[scenarioFilterIndex + 1] : undefined;

    mkdirSync(REPORTS_DIR, { recursive: true });

    let scenarioFiles = readdirSync(SCENARIOS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort();

    if (targetScenarioId) {
        scenarioFiles = scenarioFiles.filter((f) => f.includes(targetScenarioId));
    }

    console.log(`\n======================================================`);
    console.log(`🧪 Chili3D Agent Evaluation Harness (Smoke Test Only)`);
    console.log(`⚠️  CẢNH BÁO: ĐÂY LÀ CHẠY THỬ KHUNG BẰNG PHẢN HỒI TỔNG HỢP VIẾT TAY (SYNTHETIC SMOKE TEST)`);
    console.log(`    KHÔNG PHẢI LÀ BASELINE ĐO LƯỜNG CHẤT LƯỢNG THẬT CỦA AGENT.`);
    console.log(`Mode: ${isLive ? "LIVE (Real API)" : "SYNTHETIC-REPLAY (Hand-written)"}`);
    console.log(`Scenarios found: ${scenarioFiles.length}`);
    console.log(`======================================================\n`);

    const results: ScenarioResult[] = [];

    for (const file of scenarioFiles) {
        const scenario = loadScenario(file);
        process.stdout.write(`• Running [${scenario.id}]... `);
        const result = await runScenario(scenario, isLive);
        results.push(result);

        if (result.status === "pass") {
            console.log(`\x1b[32mPASS\x1b[0m (${result.durationMs}ms, ${result.toolCallsCount} tools)`);
        } else if (result.status === "pending") {
            console.log(`\x1b[33mPENDING\x1b[0m (${result.pendingReason})`);
        } else if (result.status === "needs-review") {
            console.log(`\x1b[36mNEEDS-REVIEW\x1b[0m (${result.reviewReason})`);
        } else if (result.status === "no-recording") {
            console.log(`\x1b[35mNO-RECORDING\x1b[0m`);
        } else {
            console.log(`\x1b[31mFAIL\x1b[0m (${result.errors.join("; ")})`);
        }
    }

    const total = results.length;
    const passed = results.filter((r) => r.status === "pass").length;
    const pending = results.filter((r) => r.status === "pending").length;
    const needsReview = results.filter((r) => r.status === "needs-review").length;
    const failed = results.filter((r) => r.status === "fail" || r.status === "no-recording").length;
    const activeTotal = total - pending - needsReview;
    const passRate = activeTotal > 0 ? Math.round((passed / activeTotal) * 100) : 0;

    const totalToolCalls = results.reduce((acc, r) => acc + r.toolCallsCount, 0);
    const avgToolCalls = total > 0 ? +(totalToolCalls / total).toFixed(1) : 0;
    const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);
    const avgDurationMs = total > 0 ? Math.round(totalDuration / total) : 0;

    const summary = {
        total,
        passed,
        failed,
        pending,
        needsReview,
        avgToolCalls,
        avgDurationMs,
        passRatePercent: passRate,
    };

    const report: EvalReport = {
        timestamp: new Date().toISOString(),
        label: "synthetic-smoke-test",
        mode: isLive ? "live" : "replay-synthetic",
        warning:
            "KHÔNG phải baseline chất lượng agent — chỉ dùng để kiểm tra khung chạy (smoke test) với kịch bản tổng hợp viết tay.",
        summary,
        results,
    };

    const reportFile = join(REPORTS_DIR, "synthetic-smoke-2026-11-02.json");
    writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");

    console.log(`\n------------------------------------------------------`);
    console.log(`📊 SYNTHETIC HARNESS SUMMARY (NOT A BASELINE):`);
    console.log(`- Total Scenarios : ${total}`);
    console.log(`- Passed (Smoke)  : \x1b[32m${passed}\x1b[0m`);
    console.log(`- Pending (T-21)  : \x1b[33m${pending}\x1b[0m`);
    console.log(`- Needs Review    : \x1b[36m${needsReview}\x1b[0m`);
    console.log(`- Failed          : \x1b[31m${failed}\x1b[0m`);
    console.log(`- Smoke Pass Rate : \x1b[1m${passRate}%\x1b[0m (của ${activeTotal} active scenarios)`);
    console.log(`- Smoke Report    : ${reportFile}`);
    console.log(`⚠️  LƯU Ý: Đây không phải kết quả đo năng lực mô hình thật.`);
    console.log(`------------------------------------------------------\n`);
}

if (process.argv[1] && process.argv[1].endsWith("runner.ts")) {
    main().catch((err) => {
        console.error("Eval runner fatal error:", err);
        process.exit(1);
    });
}
