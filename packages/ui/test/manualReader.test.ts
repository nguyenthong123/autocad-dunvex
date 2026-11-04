// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { ManualReader } from "../src/manual/manualReader";

describe("ManualReader", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            return {
                ok: true,
                status: 200,
                statusText: "OK",
                text: async () => `# Mục lục\n\n- [Test](01-getting-started.md)\n`,
            } as any;
        }) as any;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("should instantiate custom element", () => {
        const reader = new ManualReader();
        expect(reader).toBeInstanceOf(HTMLElement);
    });

    test("should render header with title and close button when connected", () => {
        let closed = false;
        const reader = new ManualReader(() => {
            closed = true;
        });

        document.body.appendChild(reader);

        const closeBtn = reader.querySelector("button");
        expect(closeBtn).not.toBeNull();

        closeBtn?.click();
        expect(closed).toBe(true);

        reader.remove();
    });

    test("should close on Escape keydown", () => {
        let closed = false;
        const reader = new ManualReader(() => {
            closed = true;
        });

        document.body.appendChild(reader);

        const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
        reader.dispatchEvent(event);

        expect(closed).toBe(true);
        reader.remove();
    });

    test("should sanitize dangerous script tags from markdown content", async () => {
        const reader = new ManualReader();
        document.body.appendChild(reader);

        const maliciousMarkdown = `# Test Heading\n\n<script>alert("xss")</script>\n\n<img src="x" onerror="alert(1)">\n\nNormal paragraph`;

        (reader as any).renderMarkdownContent(maliciousMarkdown);

        const contentEl = reader.querySelector("div[class*='contentArea']");
        expect(contentEl).not.toBeNull();
        expect(contentEl?.querySelector("script")).toBeNull();
        expect(contentEl?.innerHTML).not.toContain("onerror");
        expect(contentEl?.innerHTML).toContain("Normal paragraph");

        reader.remove();
    });

    test("should preserve anchor tags with id attribute", async () => {
        const reader = new ManualReader();
        document.body.appendChild(reader);

        const markdownWithAnchor = `<a id="test-anchor"></a>\n\n## Section Title`;

        (reader as any).renderMarkdownContent(markdownWithAnchor);

        const contentEl = reader.querySelector("div[class*='contentArea']");
        expect(contentEl?.querySelector("#test-anchor, a[id='test-anchor']")).not.toBeNull();

        reader.remove();
    });

    test("should render quick search bar and AI error reports navigation", () => {
        const reader = new ManualReader();
        document.body.appendChild(reader);

        const searchInput = reader.querySelector("input[type='search']") as HTMLInputElement;
        expect(searchInput).not.toBeNull();

        const diagNavItem = Array.from(reader.querySelectorAll("div[class*='navItem']")).find((el) =>
            el.textContent?.includes("Báo cáo lỗi AI"),
        );
        expect(diagNavItem).not.toBeNull();

        // Click diagnostics nav item
        diagNavItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const contentEl = reader.querySelector("div[class*='contentArea']");
        expect(contentEl?.textContent).toContain("Báo cáo Lỗi Runtime AI");
        expect(contentEl?.textContent).toContain("Tải báo cáo lỗi");

        reader.remove();
    });

    test("should keep searchInput element reference and focus across typing strokes", () => {
        const reader = new ManualReader();
        document.body.appendChild(reader);

        const searchInput = reader.querySelector("input[type='search']") as HTMLInputElement;
        expect(searchInput).not.toBeNull();
        searchInput.focus();

        const firstRef = searchInput;

        // Simulate typing keystroke 1: 'b'
        searchInput.value = "b";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));

        const currentRef1 = reader.querySelector("input[type='search']") as HTMLInputElement;
        expect(currentRef1).toBe(firstRef);

        // Simulate typing keystroke 2: 'bo'
        searchInput.value = "bo";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));

        const currentRef2 = reader.querySelector("input[type='search']") as HTMLInputElement;
        expect(currentRef2).toBe(firstRef);

        // Verify content updated with command guide card
        const contentEl = reader.querySelector("div[class*='contentArea']");
        expect(contentEl?.textContent).toContain("box");

        // Clear search input: should restore document
        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        const currentRef3 = reader.querySelector("input[type='search']") as HTMLInputElement;
        expect(currentRef3).toBe(firstRef);

        reader.remove();
    });

    test("renderDiagnosticsView displays errorMessage, sanitizedArgs, and download buttons", () => {
        const reader = new ManualReader();
        document.body.appendChild(reader);

        // Seed a dummy error report via recordRuntimeError
        const { recordRuntimeError } = require("@chili3d/ai");
        recordRuntimeError({
            toolName: "run_program",
            operation: "booleanCut",
            error: new Error("Test Boolean Cut Failure: Cutter does not intersect"),
            args: { target: "solid-1", tool: "solid-2" },
        });

        // Switch to diagnostics view
        (reader as any).isDiagnosticsView = true;
        (reader as any).renderDiagnosticsView();

        const contentEl = reader.querySelector("div[class*='contentArea']");
        expect(contentEl?.textContent).toContain("Test Boolean Cut Failure: Cutter does not intersect");
        expect(contentEl?.textContent).toContain("run_program (booleanCut)");
        expect(contentEl?.textContent).toContain("Tải báo cáo (.json)");
        expect(contentEl?.textContent).toContain("Tải báo cáo lỗi (.md)");

        // Verify sanitizedArgs inside details/pre
        const preElements = Array.from(contentEl?.querySelectorAll("pre") ?? []);
        const hasArgs = preElements.some((pre) => pre.textContent?.includes("solid-1"));
        expect(hasArgs).toBe(true);

        reader.remove();
    });
});
