// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "./pubsub";

export interface IProfilerMarkEvent {
    type: "mark";
    timestampMs: number;
    label: string;
    description?: string;
}

export interface IProfilerInteractionEvent {
    type: "interaction";
    timestampMs: number;
    kind: "zoom" | "pan" | "drag" | "snap";
    durationMs?: number;
}

export interface IProfilerFrameEvent {
    type: "frame";
    timestampMs: number;
    durationMs: number;
    cpuRenderMs?: number;
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
    isInteractive?: boolean;
    isTabHidden?: boolean;
}

export interface IProfilerAutosaveEvent {
    type: "autosave_step";
    timestampMs: number;
    startMs?: number;
    step: "serialize" | "indexeddb" | "thumbnail" | "sync_send" | "sync_ack";
    durationMs: number;
    bytes?: number;
    success: boolean;
}

export interface IProfilerTaskEvent {
    type: "task";
    timestampMs: number;
    startMs?: number;
    name: string;
    durationMs: number;
    status: "success" | "error" | "canceled";
}

export type ProfilerEvent =
    | IProfilerMarkEvent
    | IProfilerInteractionEvent
    | IProfilerFrameEvent
    | IProfilerAutosaveEvent
    | IProfilerTaskEvent;

export interface PerformanceEnvironment {
    userAgent: string;
    devicePixelRatio: number;
    viewportWidth: number;
    viewportHeight: number;
    hardwareConcurrency: number;
    memory:
        | {
              jsHeapSizeLimit: number;
              totalJSHeapSize: number;
              usedJSHeapSize: number;
          }
        | "unavailable";
}

export interface PerformanceCapabilities {
    hasPerformanceObserver: boolean;
    hasMemoryApi: boolean;
    hasGpuTiming: boolean;
}

export interface FrameAggregates {
    count: number;
    over16msCount: number;
    over33msCount: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    avgCpuRenderMs: number;
    maxCpuRenderMs: number;
    avgDrawCalls: number;
    avgTriangles: number;
    callbackInterval: {
        description: string;
        allP50Ms: number;
        allP95Ms: number;
        interactiveP50Ms: number;
        interactiveP95Ms: number;
    };
    cpuRenderTime: {
        description: string;
        p50Ms: number;
        p95Ms: number;
        avgMs: number;
        maxMs: number;
    };
    interactiveSampleCount: number;
    idleSampleCount: number;
    hiddenTabCount: number;
}

export interface InteractionAggregates {
    panCount: number;
    zoomCount: number;
    dragCount: number;
    snapCount: number;
}

export interface AutosaveAggregates {
    serializeCount: number;
    avgSerializeMs: number;
    maxSerializeMs: number;
    indexedDBCount: number;
    avgIndexedDBMs: number;
    maxIndexedDBMs: number;
    thumbnailCount: number;
    avgThumbnailMs: number;
    maxThumbnailMs: number;
    syncCount: number;
}

export interface PerformanceReportData {
    schemaVersion: "1.0.0";
    buildSha?: string;
    environment: PerformanceEnvironment;
    capabilities: PerformanceCapabilities;
    session: {
        startTimeIso: string;
        durationMs: number;
        status: "recording" | "stopped";
        totalEventsRecorded: number;
        droppedEventsCount: number;
        bufferCapacity: number;
    };
    aggregates: {
        frames: FrameAggregates;
        interactions: InteractionAggregates;
        autosave: AutosaveAggregates;
        userMarksCount: number;
    };
    timeline: ProfilerEvent[];
}

export class PerformanceProfiler {
    private static _instance: PerformanceProfiler | undefined;

    public static get instance(): PerformanceProfiler {
        if (!PerformanceProfiler._instance) {
            PerformanceProfiler._instance = new PerformanceProfiler();
        }
        return PerformanceProfiler._instance;
    }

    private _isRecording = false;
    private _sessionStartWallTime = 0;
    private _sessionStartMonotonic = 0;
    private _sessionDurationMs = 0;
    private _events: ProfilerEvent[] = [];
    private _droppedCount = 0;
    private readonly _maxCapacity = 5000;

    public get isRecording(): boolean {
        return this._isRecording;
    }

    public get eventCount(): number {
        return this._events.length;
    }

    public startRecording(): void {
        this._isRecording = true;
        this._sessionStartWallTime = Date.now();
        this._sessionStartMonotonic = typeof performance !== "undefined" ? performance.now() : Date.now();
        this._sessionDurationMs = 0;
        this._events = [];
        this._droppedCount = 0;
        this.emitStateChange();
    }

    public stopRecording(): void {
        if (this._isRecording) {
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            this._sessionDurationMs = Math.max(0, now - this._sessionStartMonotonic);
            this._isRecording = false;
            this.emitStateChange();
        }
    }

    public reset(): void {
        this._isRecording = false;
        this._events = [];
        this._droppedCount = 0;
        this._sessionDurationMs = 0;
        this.emitStateChange();
    }

    public markJank(label = "user_freeze_marked", description?: string): void {
        const timestampMs = this.getRelativeTime();
        this.pushEvent({
            type: "mark",
            timestampMs,
            label,
            description,
        });
    }

    public recordInteraction(kind: "zoom" | "pan" | "drag" | "snap", durationMs?: number): void {
        if (!this._isRecording) return;
        const timestampMs = this.getRelativeTime();
        this.pushEvent({
            type: "interaction",
            timestampMs,
            kind,
            durationMs,
        });
    }

    public recordFrame(
        durationMs: number,
        cpuRenderMs?: number,
        drawCalls?: number,
        triangles?: number,
        geometries?: number,
        textures?: number,
        isInteractive = true,
    ): void {
        if (!this._isRecording) return;
        const isTabHidden = typeof document !== "undefined" ? Boolean(document.hidden) : false;
        const timestampMs = this.getRelativeTime();
        this.pushEvent({
            type: "frame",
            timestampMs,
            durationMs: Math.round(durationMs * 10) / 10,
            cpuRenderMs: cpuRenderMs !== undefined ? Math.round(cpuRenderMs * 10) / 10 : undefined,
            drawCalls,
            triangles,
            geometries,
            textures,
            isInteractive,
            isTabHidden,
        });
    }

    public recordAutosaveStep(
        step: "serialize" | "indexeddb" | "thumbnail" | "sync_send" | "sync_ack",
        durationMs: number,
        success = true,
        bytes?: number,
    ): void {
        if (!this._isRecording) return;
        const timestampMs = this.getRelativeTime();
        const startMs = Math.max(0, Math.round((timestampMs - durationMs) * 10) / 10);
        this.pushEvent({
            type: "autosave_step",
            timestampMs,
            startMs,
            step,
            durationMs: Math.round(durationMs * 10) / 10,
            bytes,
            success,
        });
    }

    public recordTask(
        name: string,
        durationMs: number,
        status: "success" | "error" | "canceled" = "success",
    ): void {
        if (!this._isRecording) return;
        const timestampMs = this.getRelativeTime();
        const startMs = Math.max(0, Math.round((timestampMs - durationMs) * 10) / 10);
        this.pushEvent({
            type: "task",
            timestampMs,
            startMs,
            name,
            durationMs: Math.round(durationMs * 10) / 10,
            status,
        });
    }

    private getRelativeTime(): number {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        return Math.max(0, Math.round((now - this._sessionStartMonotonic) * 10) / 10);
    }

    private pushEvent(event: ProfilerEvent): void {
        if (this._events.length >= this._maxCapacity) {
            // Ring buffer drop oldest
            this._events.shift();
            this._droppedCount++;
        }
        this._events.push(event);
    }

    private emitStateChange(): void {
        try {
            PubSub.default.pub("performanceProfilerStateChanged", {
                isRecording: this._isRecording,
                eventCount: this._events.length,
            });
        } catch {
            // Ignore in tests if PubSub not initialized
        }
    }

    public exportReport(buildSha?: string): PerformanceReportData {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const durationMs = this._isRecording
            ? Math.max(0, now - this._sessionStartMonotonic)
            : this._sessionDurationMs;

        return {
            schemaVersion: "1.0.0",
            buildSha,
            environment: this.collectEnvironment(),
            capabilities: this.collectCapabilities(),
            session: {
                startTimeIso: new Date(this._sessionStartWallTime || Date.now()).toISOString(),
                durationMs: Math.round(durationMs * 10) / 10,
                status: this._isRecording ? "recording" : "stopped",
                totalEventsRecorded: this._events.length,
                droppedEventsCount: this._droppedCount,
                bufferCapacity: this._maxCapacity,
            },
            aggregates: this.computeAggregates(),
            timeline: [...this._events],
        };
    }

    public exportJson(buildSha?: string): string {
        return JSON.stringify(this.exportReport(buildSha), null, 2);
    }

    private collectEnvironment(): PerformanceEnvironment {
        let memory: PerformanceEnvironment["memory"] = "unavailable";
        if (typeof performance !== "undefined") {
            const mem = (
                performance as unknown as {
                    memory?: {
                        jsHeapSizeLimit?: number;
                        totalJSHeapSize?: number;
                        usedJSHeapSize?: number;
                    };
                }
            ).memory;
            if (mem && typeof mem.usedJSHeapSize === "number") {
                memory = {
                    jsHeapSizeLimit: mem.jsHeapSizeLimit ?? 0,
                    totalJSHeapSize: mem.totalJSHeapSize ?? 0,
                    usedJSHeapSize: mem.usedJSHeapSize,
                };
            }
        }

        return {
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "headless",
            devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
            viewportWidth: typeof window !== "undefined" ? window.innerWidth : 0,
            viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
            hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0,
            memory,
        };
    }

    private collectCapabilities(): PerformanceCapabilities {
        return {
            hasPerformanceObserver: typeof PerformanceObserver !== "undefined",
            hasMemoryApi:
                typeof performance !== "undefined" &&
                Boolean((performance as unknown as { memory?: unknown }).memory),
            hasGpuTiming: false,
        };
    }

    private computeAggregates(): PerformanceReportData["aggregates"] {
        const allFrameTimes: number[] = [];
        const interactiveFrameTimes: number[] = [];
        const cpuRenderTimes: number[] = [];
        let cpuRenderSum = 0;
        let cpuRenderCount = 0;
        let maxCpuRender = 0;
        let drawCallsSum = 0;
        let drawCallsCount = 0;
        let trianglesSum = 0;
        let trianglesCount = 0;
        let over16 = 0;
        let over33 = 0;
        let interactiveCount = 0;
        let idleCount = 0;
        let hiddenTabCount = 0;

        let pan = 0;
        let zoom = 0;
        let drag = 0;
        let snap = 0;

        const serializeTimes: number[] = [];
        const idbTimes: number[] = [];
        const thumbTimes: number[] = [];
        let syncCount = 0;
        let userMarks = 0;

        for (const ev of this._events) {
            if (ev.type === "frame") {
                allFrameTimes.push(ev.durationMs);
                if (ev.isTabHidden) {
                    hiddenTabCount++;
                } else if (ev.isInteractive !== false) {
                    interactiveCount++;
                    interactiveFrameTimes.push(ev.durationMs);
                } else {
                    idleCount++;
                }

                if (ev.durationMs > 16.7) over16++;
                if (ev.durationMs > 33.3) over33++;
                if (ev.cpuRenderMs !== undefined) {
                    cpuRenderTimes.push(ev.cpuRenderMs);
                    cpuRenderSum += ev.cpuRenderMs;
                    cpuRenderCount++;
                    if (ev.cpuRenderMs > maxCpuRender) maxCpuRender = ev.cpuRenderMs;
                }
                if (ev.drawCalls !== undefined) {
                    drawCallsSum += ev.drawCalls;
                    drawCallsCount++;
                }
                if (ev.triangles !== undefined) {
                    trianglesSum += ev.triangles;
                    trianglesCount++;
                }
            } else if (ev.type === "interaction") {
                if (ev.kind === "pan") pan++;
                else if (ev.kind === "zoom") zoom++;
                else if (ev.kind === "drag") drag++;
                else if (ev.kind === "snap") snap++;
            } else if (ev.type === "autosave_step") {
                if (ev.step === "serialize") serializeTimes.push(ev.durationMs);
                else if (ev.step === "indexeddb") idbTimes.push(ev.durationMs);
                else if (ev.step === "thumbnail") thumbTimes.push(ev.durationMs);
                else if (ev.step === "sync_send" || ev.step === "sync_ack") syncCount++;
            } else if (ev.type === "mark") {
                userMarks++;
            }
        }

        const percentile = (arr: number[], pct: number) => {
            if (arr.length === 0) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length * pct)] ?? 0;
        };
        const maxVal = (arr: number[]) => (arr.length > 0 ? Math.max(...arr) : 0);
        const avgVal = (arr: number[]) =>
            arr.length > 0 ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : 0;

        return {
            frames: {
                count: allFrameTimes.length,
                over16msCount: over16,
                over33msCount: over33,
                p50Ms: Math.round(percentile(allFrameTimes, 0.5) * 10) / 10,
                p95Ms: Math.round(percentile(allFrameTimes, 0.95) * 10) / 10,
                maxMs: Math.round(maxVal(allFrameTimes) * 10) / 10,
                avgCpuRenderMs:
                    cpuRenderCount > 0 ? Math.round((cpuRenderSum / cpuRenderCount) * 10) / 10 : 0,
                maxCpuRenderMs: Math.round(maxCpuRender * 10) / 10,
                avgDrawCalls: drawCallsCount > 0 ? Math.round(drawCallsSum / drawCallsCount) : 0,
                avgTriangles: trianglesCount > 0 ? Math.round(trianglesSum / trianglesCount) : 0,
                callbackInterval: {
                    description:
                        "Khoảng cách giữa các callback requestAnimationFrame (nhịp render trình duyệt)",
                    allP50Ms: Math.round(percentile(allFrameTimes, 0.5) * 10) / 10,
                    allP95Ms: Math.round(percentile(allFrameTimes, 0.95) * 10) / 10,
                    interactiveP50Ms: Math.round(percentile(interactiveFrameTimes, 0.5) * 10) / 10,
                    interactiveP95Ms: Math.round(percentile(interactiveFrameTimes, 0.95) * 10) / 10,
                },
                cpuRenderTime: {
                    description: "Thời gian CPU thực thi lệnh vẽ Three.js (renderer.render)",
                    p50Ms: Math.round(percentile(cpuRenderTimes, 0.5) * 10) / 10,
                    p95Ms: Math.round(percentile(cpuRenderTimes, 0.95) * 10) / 10,
                    avgMs: avgVal(cpuRenderTimes),
                    maxMs: Math.round(maxVal(cpuRenderTimes) * 10) / 10,
                },
                interactiveSampleCount: interactiveCount,
                idleSampleCount: idleCount,
                hiddenTabCount,
            },
            interactions: {
                panCount: pan,
                zoomCount: zoom,
                dragCount: drag,
                snapCount: snap,
            },
            autosave: {
                serializeCount: serializeTimes.length,
                avgSerializeMs: avgVal(serializeTimes),
                maxSerializeMs: maxVal(serializeTimes),
                indexedDBCount: idbTimes.length,
                avgIndexedDBMs: avgVal(idbTimes),
                maxIndexedDBMs: maxVal(idbTimes),
                thumbnailCount: thumbTimes.length,
                avgThumbnailMs: avgVal(thumbTimes),
                maxThumbnailMs: maxVal(thumbTimes),
                syncCount,
            },
            userMarksCount: userMarks,
        };
    }
}
