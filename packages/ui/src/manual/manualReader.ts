// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    clearRuntimeErrorReports,
    exportRuntimeErrorReports,
    findCommandGuide,
    listRuntimeErrorReports,
    type RuntimeErrorReport,
    searchCommandGuides,
} from "@chili3d/ai";
import { Localize } from "@chili3d/core";
import { button, div, span } from "@chili3d/element";
import { Marked } from "marked";
import style from "./manualReader.module.css";

const marked = new Marked();

interface ChapterItem {
    readonly title: string;
    readonly file: string;
}

const DEFAULT_CHAPTERS: readonly ChapterItem[] = [
    { title: "Giới thiệu sổ tay và mục lục", file: "README.md" },
    { title: "1. Bắt đầu nhanh", file: "01-getting-started.md" },
    { title: "2. Tổng quan giao diện", file: "02-interface.md" },
    { title: "3. Góc nhìn, chọn đối tượng và bắt điểm", file: "03-view-navigation-selection.md" },
    { title: "4. Dựng hình trực tiếp", file: "04-direct-modeling.md" },
    { title: "5. Chỉnh sửa, đo lường và chú thích", file: "05-modify-convert-measure.md" },
    { title: "6. Dựng hình tham số", file: "06-parametric-modeling.md" },
    { title: "7. Phác thảo", file: "07-sketch.md" },
    { title: "8. Tài liệu, tệp và hoàn tác", file: "08-document-files.md" },
    { title: "9. Trợ lý AI", file: "09-ai-assistant.md" },
    { title: "10. Cài đặt, plugin và mở rộng", file: "10-settings-plugins.md" },
    { title: "11. Các câu hỏi thường gặp", file: "11-faq.md" },
    { title: "12. Quy trình làm việc điển hình", file: "12-workflows.md" },
    { title: "13. Pro chỉnh sửa trực tiếp", file: "13-pro-direct-editing.md" },
    { title: "Phụ lục A: Bảng tra nhanh lệnh", file: "appendix-commands.md" },
    { title: "Phụ lục B: Phím tắt và thao tác chuột", file: "appendix-shortcuts.md" },
    { title: "Phụ lục C: Bảng thuật ngữ", file: "appendix-glossary.md" },
];

/**
 * Sanitizes rendered HTML to prevent XSS while allowing standard document tags,
 * code blocks, tables, images, and compatibility anchor tags.
 */
function sanitizeHtml(dirty: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, "text/html");

    // Remove forbidden tags
    const forbiddenTags = [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "textarea",
        "button",
        "link",
        "meta",
    ];
    for (const tag of forbiddenTags) {
        const elements = doc.querySelectorAll(tag);
        for (let i = 0; i < elements.length; i++) {
            elements[i].remove();
        }
    }

    // Sanitize attributes across all remaining elements
    const allElements = doc.querySelectorAll("*");
    for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
            const attrName = attr.name.toLowerCase();
            // Disallow all inline event handlers (on*)
            if (attrName.startsWith("on")) {
                el.removeAttribute(attr.name);
                continue;
            }
            // Disallow javascript: or vbscript: URLs in href/src
            if (attrName === "href" || attrName === "src") {
                const val = attr.value.trim().toLowerCase();
                if (
                    val.startsWith("javascript:") ||
                    val.startsWith("vbscript:") ||
                    val.startsWith("data:text/html")
                ) {
                    el.removeAttribute(attr.name);
                }
            }
        }
    }

    return doc.body.innerHTML;
}

export class ManualReader extends HTMLElement {
    private currentFile = "README.md";
    private chapters: ChapterItem[] = [...DEFAULT_CHAPTERS];
    private isDiagnosticsView = false;
    private searchQuery = "";
    private searchInput!: HTMLInputElement;
    private diagItemEl!: HTMLElement;
    private chapterListEl!: HTMLElement;
    private sidebarEl!: HTMLElement;
    private contentEl!: HTMLElement;
    private readonly onCloseCallback?: () => void;

    constructor(onClose?: () => void) {
        super();
        this.onCloseCallback = onClose;
        this.className = style.backdrop;
        this.tabIndex = -1;
    }

    connectedCallback(): void {
        this.render();
        this.focus();
        this.loadSummaryAndInit();
        this.addEventListener("keydown", this.handleKeyDown);
    }

    disconnectedCallback(): void {
        this.removeEventListener("keydown", this.handleKeyDown);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        }
    };

    private close(): void {
        this.onCloseCallback?.();
        this.remove();
    }

    private render(): void {
        const header = div(
            { className: style.header },
            div(
                { className: style.headerTitle },
                div({
                    innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M8 7h8"></path><path d="M8 11h6"></path></svg>`,
                }),
                span({ textContent: new Localize("app.manual.title") }),
            ),
            div(
                { className: style.headerActions },
                button(
                    {
                        className: style.closeButton,
                        title: "Escape",
                        onclick: () => this.close(),
                    },
                    span({ textContent: new Localize("app.manual.back") }),
                    span({ textContent: "✕" }),
                ),
            ),
        );

        // Quick search bar: created once so input focus and IME are never lost
        this.searchInput = document.createElement("input");
        this.searchInput.type = "search";
        this.searchInput.className = style.searchInput;
        this.searchInput.placeholder = "Tìm nhanh sổ tay hoặc lệnh...";
        this.searchInput.value = this.searchQuery;
        this.searchInput.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.handleSearch();
        });
        const searchBox = div({ className: style.searchContainer }, this.searchInput);

        // Diagnostics navigation button
        this.diagItemEl = div({
            className: style.navItem,
            title: "Xem danh sách và tải báo cáo lỗi runtime của trợ lý AI",
            onclick: () => {
                this.isDiagnosticsView = true;
                this.updateSidebarState();
                this.renderDiagnosticsView();
            },
        });

        // Dedicated container for chapter items
        this.chapterListEl = div({ className: style.chapterList });

        this.sidebarEl = div(
            { className: style.sidebar },
            searchBox,
            this.diagItemEl,
            div({ className: style.navDivider }),
            this.chapterListEl,
        );

        this.contentEl = div({ className: style.contentArea });
        this.contentEl.addEventListener("click", this.handleContentClick);

        const bodyEl = div({ className: style.body }, this.sidebarEl, this.contentEl);

        const container = div(
            {
                className: style.container,
                onclick: (e: MouseEvent) => e.stopPropagation(),
            },
            header,
            bodyEl,
        );

        // Clicking backdrop closes
        this.onclick = () => this.close();
        this.appendChild(container);

        this.updateSidebarState();
    }

    private async loadSummaryAndInit(): Promise<void> {
        try {
            const resp = await fetch("manual/SUMMARY.md");
            if (resp.ok) {
                const text = await resp.text();
                const parsed = this.parseSummary(text);
                if (parsed.length > 0) {
                    this.chapters = parsed;
                    this.updateSidebarState();
                }
            }
        } catch {
            // Keep default chapters on error
        }
        await this.loadDocument(this.currentFile);
    }

    private parseSummary(markdown: string): ChapterItem[] {
        const items: ChapterItem[] = [];
        const regex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
        let match = regex.exec(markdown);
        while (match !== null) {
            items.push({
                title: match[1].trim(),
                file: match[2].trim(),
            });
            match = regex.exec(markdown);
        }
        return items;
    }

    /**
     * Backward-compatibility alias for tests or external callers.
     */
    private renderSidebar(): void {
        this.updateSidebarState();
    }

    private updateSidebarState(): void {
        const errorReports = listRuntimeErrorReports();
        const errCount = errorReports.length;
        this.diagItemEl.className = `${style.navItem} ${this.isDiagnosticsView ? style.navItemActive : ""}`;
        this.diagItemEl.textContent = `Báo cáo lỗi AI (${errCount})`;
        this.renderChapterList();
    }

    private renderChapterList(): void {
        this.chapterListEl.innerHTML = "";

        const query = this.searchQuery.trim().toLowerCase();
        const filteredChapters = query
            ? this.chapters.filter((c) => c.title.toLowerCase().includes(query))
            : this.chapters;

        let inAppendix = false;
        for (const chapter of filteredChapters) {
            if (!inAppendix && chapter.file.startsWith("appendix-")) {
                inAppendix = true;
                this.chapterListEl.appendChild(div({ className: style.navDivider }));
            }

            const isCurrent = !this.isDiagnosticsView && chapter.file === this.currentFile;
            const item = div({
                className: `${style.navItem} ${isCurrent ? style.navItemActive : ""}`,
                textContent: chapter.title,
                title: chapter.title,
                onclick: () => {
                    this.isDiagnosticsView = false;
                    this.loadDocument(chapter.file);
                },
            });
            this.chapterListEl.appendChild(item);
        }
    }

    private handleSearch(): void {
        this.updateSidebarState();
        const query = this.searchQuery.trim();
        if (!query) {
            this.loadDocument(this.currentFile);
            return;
        }

        const matchingCommands = searchCommandGuides(query);
        const queryLower = query.toLowerCase();
        const matchingChapters = this.chapters.filter((c) => c.title.toLowerCase().includes(queryLower));

        if (matchingCommands.length === 0 && matchingChapters.length === 0) {
            const md = `# Không tìm thấy kết quả cho "${query}"\n\nKhông có lệnh hoặc chương tài liệu nào phù hợp với từ khóa này. Hãy thử tìm theo tên tiếng Việt hoặc lệnh tắt (ví dụ: \`box\`, \`cắt\`, \`vẽ\`, \`dim\`, \`lỗ\`).`;
            this.renderMarkdownContent(md);
            return;
        }

        const sections: string[] = [`# Kết quả tra cứu cho "${query}"\n`];

        if (matchingCommands.length > 0) {
            sections.push(`## 🛠️ Các lệnh phù hợp (${matchingCommands.length})\n`);
            for (const c of matchingCommands) {
                const aliasStr = c.aliases.length > 0 ? ` (Lệnh tắt: \`${c.aliases.join("`, `")}\`)` : "";
                sections.push(
                    `### Lệnh: \`${c.commandKey}\`${aliasStr}`,
                    `> **Chế độ:** \`${c.modelingMode}\` | **Danh mục:** \`${c.category}\``,
                    `#### 🎯 Mục đích\n${c.purpose}\n`,
                    `#### 📌 Khi nào nên dùng\n${c.whenToUse.map((s) => `- ${s}`).join("\n")}\n`,
                    `#### ⚠️ Khi nào không nên dùng\n${c.whenNotToUse.map((s) => `- ${s}`).join("\n")}\n`,
                    `#### 📋 Điều kiện tiên quyết (Preconditions)\n${c.requiredPreconditions.map((s) => `- ${s}`).join("\n")}\n`,
                    `#### 📐 Đối tượng chọn & Ràng buộc hình học\n- **Đối tượng chấp nhận:** ${c.acceptedSelectionTypes.join(", ")}\n- **Đối tượng cấm:** ${c.forbiddenInputs.join(", ")}\n\n**Ràng buộc hình học:**\n${c.geometryConstraints.map((s) => `  - ${s}`).join("\n")}\n`,
                    `#### ⌨️ Trình tự thao tác (Input Sequence)\n${c.inputSequence.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`,
                    `#### 📝 Hướng dẫn từng bước cho người dùng\n${c.userStepByStepGuide.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`,
                    `#### ❌ Lỗi thường gặp & Cách khắc phục\n${c.commonFailures.map((f, i) => `- **Lỗi:** ${f}\n  - *Khắc phục:* ${c.recoverySteps[i] ?? "Kiểm tra lại điều kiện đầu vào"}`).join("\n")}\n`,
                    `#### ✅ Kiểm chứng sau lệnh\n${c.verificationSteps.map((s) => `- ${s}`).join("\n")}\n`,
                    `---\n`,
                );
            }
        }

        if (matchingChapters.length > 0) {
            sections.push(
                `## 📚 Các chương tài liệu liên quan\n`,
                matchingChapters.map((c) => `- [${c.title}](${c.file})`).join("\n"),
            );
        }

        this.renderMarkdownContent(sections.join("\n\n"));
    }

    public openDiagnosticsView(): void {
        this.isDiagnosticsView = true;
        this.updateSidebarState();
        this.renderDiagnosticsView();
    }

    public async loadDocument(file: string, targetAnchor?: string): Promise<void> {
        this.isDiagnosticsView = false;
        this.currentFile = file;
        this.updateSidebarState();

        this.contentEl.innerHTML = `<div class="${style.loading}">${new Localize("app.manual.loading")}</div>`;

        try {
            const resp = await fetch(`manual/${file}`);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);
            }
            const markdown = await resp.text();
            this.renderMarkdownContent(markdown, targetAnchor);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.contentEl.innerHTML = `<div class="${style.error}">Không thể tải tài liệu "${file}": ${message}</div>`;
        }
    }

    private renderDiagnosticsView(): void {
        const reports = listRuntimeErrorReports();
        this.contentEl.innerHTML = "";

        const titleSpan = span({ textContent: "Báo cáo Lỗi Runtime AI (AI Diagnostics)" });
        const downloadMdBtn = button(
            {
                className: style.actionButton,
                onclick: () => this.downloadErrorReportMarkdown(),
            },
            span({ textContent: "📥 Tải báo cáo lỗi (.md)" }),
        );
        const downloadJsonBtn = button(
            {
                className: `${style.actionButton} ${style.actionButtonSecondary}`,
                onclick: () => this.downloadErrorReportJson(),
            },
            span({ textContent: "📥 Tải báo cáo (.json)" }),
        );
        const clearBtn = button(
            {
                className: `${style.actionButton} ${style.actionButtonSecondary}`,
                onclick: () => {
                    clearRuntimeErrorReports();
                    this.updateSidebarState();
                    this.renderDiagnosticsView();
                },
            },
            span({ textContent: "🗑️ Xóa danh sách" }),
        );

        const actions = div(
            { className: style.diagnosticsActions },
            downloadMdBtn,
            downloadJsonBtn,
            clearBtn,
        );
        const headerEl = div({ className: style.diagnosticsHeader }, titleSpan, actions);
        this.contentEl.appendChild(headerEl);

        if (reports.length === 0) {
            const emptyEl = div({
                className: style.loading,
                textContent: "Chưa ghi nhận lỗi runtime nào trong phiên làm việc hiện tại.",
            });
            this.contentEl.appendChild(emptyEl);
            return;
        }

        for (const report of reports) {
            const badgeClass =
                report.errorClass === "kernel"
                    ? style.badgeKernel
                    : report.errorClass === "geometry-precondition"
                      ? style.badgeGeometry
                      : report.errorClass === "ai-planning"
                        ? style.badgePlanning
                        : report.errorClass === "code-bug"
                          ? style.badgeBug
                          : report.errorClass === "user-input"
                            ? style.badgeInput
                            : style.badgeApplication;

            const timeStr = new Date(report.timestamp).toLocaleTimeString();
            const opInfo = report.operation ? ` (${report.operation})` : "";
            const cmdInfo = report.commandKey ? ` [${report.commandKey}]` : "";
            const titleRow = div(
                { className: style.errorTitleRow },
                span({
                    className: style.errorToolName,
                    textContent: `${report.toolName}${opInfo}${cmdInfo} - ${timeStr}`,
                }),
                span({
                    className: `${style.errorBadge} ${badgeClass}`,
                    textContent: report.errorClass,
                }),
            );

            // Prominent error message
            const errorMsgEl = div({
                className: style.errorMessageText,
                textContent: `Lỗi: ${report.errorMessage}`,
            });

            const causeEl = div({
                className: style.errorCause,
                textContent: `Nguyên nhân: ${report.suspectedCause}`,
            });

            const fixEl = div({
                className: style.errorFix,
                textContent: `Gợi ý sửa code: ${report.suggestedFixForDeveloper}`,
            });

            const cardChildren: HTMLElement[] = [titleRow, errorMsgEl, causeEl, fixEl];

            if (report.documentSummary) {
                const nodeNames = report.documentSummary.nodes
                    .map((n) => n.name || n.id)
                    .slice(0, 5)
                    .join(", ");
                const more = report.documentSummary.nodeCount > 5 ? "..." : "";
                const summaryEl = div({
                    className: style.errorMeta,
                    textContent: `Tài liệu: ${report.documentSummary.nodeCount} node (${nodeNames}${more})`,
                });
                cardChildren.push(summaryEl);
            }

            // Sanitized args details
            const argsDetails = document.createElement("details");
            argsDetails.className = style.errorDetails;
            const argsSummary = document.createElement("summary");
            argsSummary.textContent = "Tham số đầu vào (sanitized)";
            const argsPre = document.createElement("pre");
            argsPre.textContent = JSON.stringify(report.sanitizedArgs, null, 2);
            argsDetails.appendChild(argsSummary);
            argsDetails.appendChild(argsPre);
            cardChildren.push(argsDetails);

            // Stack trace details if present
            if (report.stack) {
                const stackDetails = document.createElement("details");
                stackDetails.className = style.errorDetails;
                const stackSummary = document.createElement("summary");
                stackSummary.textContent = "Call stack";
                const stackPre = document.createElement("pre");
                stackPre.textContent = report.stack;
                stackDetails.appendChild(stackSummary);
                stackDetails.appendChild(stackPre);
                cardChildren.push(stackDetails);
            }

            const card = div({ className: style.errorCard }, ...cardChildren);
            this.contentEl.appendChild(card);
        }
    }

    private downloadErrorReportMarkdown(): void {
        const md = exportRuntimeErrorReports("markdown");
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = `chili3d-error-report-${dateStr}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private downloadErrorReportJson(): void {
        const json = exportRuntimeErrorReports("json");
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = `chili3d-error-report-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private renderMarkdownContent(rawMarkdown: string, targetAnchor?: string): void {
        // Rewrite relative image paths: images/... -> manual/images/...
        const adjustedMarkdown = rawMarkdown.replace(/!\[(.*?)\]\((images\/[^)]+)\)/g, "![$1](manual/$2)");

        const rawHtml = marked.parse(adjustedMarkdown, {
            gfm: true,
            breaks: false,
            async: false,
        }) as string;

        const safeHtml = sanitizeHtml(rawHtml);
        this.contentEl.innerHTML = safeHtml;

        // Scroll to target anchor or top
        if (targetAnchor) {
            setTimeout(() => this.scrollToAnchor(targetAnchor), 50);
        } else {
            this.contentEl.scrollTop = 0;
        }
    }

    private scrollToAnchor(anchor: string): void {
        const cleanAnchor = anchor.startsWith("#") ? anchor.slice(1) : anchor;
        if (!cleanAnchor) return;

        // Find element by id
        const target =
            this.contentEl.querySelector(`#${CSS.escape(cleanAnchor)}`) ||
            this.contentEl.querySelector(`[id="${cleanAnchor}"]`);

        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    private handleContentClick = (e: MouseEvent): void => {
        const anchor = (e.target as HTMLElement).closest("a");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href) return;

        // External links
        if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
            anchor.setAttribute("target", "_blank");
            anchor.setAttribute("rel", "noopener noreferrer");
            return;
        }

        e.preventDefault();

        // Internal anchor on current page
        if (href.startsWith("#")) {
            this.scrollToAnchor(href);
            return;
        }

        // Link to another markdown file (with optional anchor)
        const [filePart, anchorPart] = href.split("#");
        if (filePart.endsWith(".md")) {
            this.loadDocument(filePart, anchorPart);
        }
    };
}

if (!customElements.get("chili-manual-reader")) {
    customElements.define("chili-manual-reader", ManualReader);
}
