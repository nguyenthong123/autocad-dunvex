// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { PerformanceProfiler } from "../src/foundation/performanceProfiler";

describe("PerformanceProfiler Unit Tests", () => {
    let profiler: PerformanceProfiler;

    beforeEach(() => {
        profiler = PerformanceProfiler.instance;
        profiler.reset();
    });

    afterEach(() => {
        profiler.reset();
    });

    test("defaults to disabled and ignores events when not recording", () => {
        expect(profiler.isRecording).toBe(false);
        profiler.recordFrame(16.6, 2.1, 10, 500);
        profiler.recordInteraction("pan");
        profiler.recordAutosaveStep("serialize", 15.2);

        expect(profiler.eventCount).toBe(0);
        const report = profiler.exportReport();
        expect(report.session.status).toBe("stopped");
        expect(report.aggregates.frames.count).toBe(0);
        expect(report.aggregates.interactions.panCount).toBe(0);
    });

    test("records frames, interactions, marks and computes statistical aggregates correctly", () => {
        profiler.startRecording();
        expect(profiler.isRecording).toBe(true);

        // Record interaction events
        profiler.recordInteraction("pan");
        profiler.recordInteraction("pan");
        profiler.recordInteraction("zoom");
        profiler.recordInteraction("drag");

        // Record frames
        profiler.recordFrame(10.0, 1.5, 5, 100);
        profiler.recordFrame(16.0, 2.0, 6, 120);
        profiler.recordFrame(25.0, 3.5, 8, 150); // > 16ms
        profiler.recordFrame(45.0, 12.0, 15, 300); // > 33ms

        // Mark a jank event
        profiler.markJank("test_jank_marker", "stutter during zoom");

        // Record autosave steps
        profiler.recordAutosaveStep("serialize", 20.0, true);
        profiler.recordAutosaveStep("indexeddb", 35.0, true);
        profiler.recordAutosaveStep("thumbnail", 8.0, true, 3500);
        profiler.recordAutosaveStep("sync_send", 0, true);
        profiler.recordAutosaveStep("sync_ack", 0, true);

        // Record custom task
        profiler.recordTask("open_document", 120.0, "success");

        profiler.stopRecording();
        expect(profiler.isRecording).toBe(false);

        const report = profiler.exportReport("test-sha-1234");
        expect(report.schemaVersion).toBe("1.0.0");
        expect(report.buildSha).toBe("test-sha-1234");
        expect(report.session.status).toBe("stopped");
        expect(report.session.totalEventsRecorded).toBe(15);
        expect(report.session.droppedEventsCount).toBe(0);

        // Check frame aggregates
        const f = report.aggregates.frames;
        expect(f.count).toBe(4);
        expect(f.over16msCount).toBe(2);
        expect(f.over33msCount).toBe(1);
        expect(f.maxMs).toBe(45.0);
        expect(f.avgCpuRenderMs).toBeGreaterThan(0);
        expect(f.avgDrawCalls).toBeGreaterThan(0);
        expect(f.avgTriangles).toBeGreaterThan(0);

        // Check interaction aggregates
        const i = report.aggregates.interactions;
        expect(i.panCount).toBe(2);
        expect(i.zoomCount).toBe(1);
        expect(i.dragCount).toBe(1);
        expect(i.snapCount).toBe(0);

        // Check autosave aggregates
        const a = report.aggregates.autosave;
        expect(a.serializeCount).toBe(1);
        expect(a.avgSerializeMs).toBe(20.0);
        expect(a.indexedDBCount).toBe(1);
        expect(a.avgIndexedDBMs).toBe(35.0);
        expect(a.thumbnailCount).toBe(1);
        expect(a.avgThumbnailMs).toBe(8.0);
        expect(a.syncCount).toBe(2);

        // Check user marks count
        expect(report.aggregates.userMarksCount).toBe(1);

        // Check timeline events order
        expect(report.timeline.length).toBe(15);
        expect(report.timeline[0].type).toBe("interaction");
        expect(report.timeline[report.timeline.length - 1].type).toBe("task");

        // Check valid JSON output
        const jsonStr = profiler.exportJson("test-sha-1234");
        const parsed = JSON.parse(jsonStr);
        expect(parsed.schemaVersion).toBe("1.0.0");
        expect(parsed.timeline.length).toBe(15);
    });

    test("enforces max capacity ring buffer and counts dropped events", () => {
        profiler.startRecording();

        // Push 5010 frames to overflow capacity 5000
        for (let i = 0; i < 5010; i++) {
            profiler.recordFrame(16.0);
        }

        const report = profiler.exportReport();
        expect(report.session.bufferCapacity).toBe(5000);
        expect(report.session.totalEventsRecorded).toBe(5000);
        expect(report.session.droppedEventsCount).toBe(10);
        expect(report.timeline.length).toBe(5000);
    });
});
