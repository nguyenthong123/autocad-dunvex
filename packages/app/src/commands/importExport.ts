// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    CancelableCommand,
    Combobox,
    command,
    DEFAULT_PDF_PAGE_OPTIONS,
    download,
    drawPdfPlanToCanvas,
    I18n,
    type IApplication,
    type ICommand,
    type PdfExportPlan,
    type PdfPageOptions,
    PropertyUtils,
    PubSub,
    property,
    readFilesAsync,
    SelectNodeStep,
    type VisualNode,
} from "@chili3d/core";
import { importFiles } from "../utils";

@command({
    key: "file.import",
    icon: "icon-import",
})
export class Import implements ICommand {
    async execute(application: IApplication): Promise<void> {
        const extenstions = application.dataExchange.importFormats().join(",");
        const files = await readFilesAsync(extenstions, true);
        if (!files.isOk || files.value.length === 0) {
            alert(files.error);
            return;
        }
        importFiles(application, files.value);
    }
}

const pdfDep = [{ property: "format" as const, value: ".pdf" }];

@command({
    key: "file.export",
    icon: "icon-export",
})
export class Export extends CancelableCommand {
    @property("file.format", {
        combobox: new Combobox<string>(),
    })
    public get format() {
        return this.getPrivateValue("format", ".step");
    }
    public set format(value: string) {
        this.setProperty("format", value);
        // Warm the pdf-lib + font chunks when the user picks PDF.
        if (value === ".pdf") {
            void this.application?.dataExchange.preloadPdfWriter?.();
        }
    }

    @property("option.command.merge")
    public get merge() {
        return this.getPrivateValue("merge", true);
    }
    public set merge(value: boolean) {
        this.setProperty("merge", value);
    }

    @property("pdf.pageSize", {
        group: "pdf.group",
        combobox: Combobox.from(["A4", "A3"]),
        dependencies: pdfDep,
    })
    public get pdfPageSize() {
        return this.getPrivateValue("pdfPageSize", DEFAULT_PDF_PAGE_OPTIONS.pageSize);
    }
    public set pdfPageSize(value: "A4" | "A3") {
        this.setProperty("pdfPageSize", value);
    }

    @property("pdf.orientation", {
        group: "pdf.group",
        combobox: Combobox.from(["pdf.orientation.landscape", "pdf.orientation.portrait"]),
        dependencies: pdfDep,
    })
    public get pdfOrientation() {
        return this.getPrivateValue("pdfOrientation", "pdf.orientation.landscape");
    }
    public set pdfOrientation(value: string) {
        this.setProperty("pdfOrientation", value);
    }

    @property("pdf.marginMm", {
        group: "pdf.group",
        dependencies: pdfDep,
    })
    public get pdfMarginMm() {
        return this.getPrivateValue("pdfMarginMm", DEFAULT_PDF_PAGE_OPTIONS.marginMm);
    }
    public set pdfMarginMm(value: number) {
        if (value >= 0) this.setProperty("pdfMarginMm", value);
    }

    @property("pdf.scaleMode", {
        group: "pdf.group",
        combobox: Combobox.from(["pdf.scaleMode.fixed", "pdf.scaleMode.fit"]),
        dependencies: pdfDep,
    })
    public get pdfScaleMode() {
        return this.getPrivateValue("pdfScaleMode", "pdf.scaleMode.fixed");
    }
    public set pdfScaleMode(value: string) {
        this.setProperty("pdfScaleMode", value);
    }

    @property("pdf.scale", {
        group: "pdf.group",
        dependencies: [...pdfDep, { property: "pdfScaleMode", value: "pdf.scaleMode.fixed" }],
    })
    public get pdfScale() {
        return this.getPrivateValue("pdfScale", DEFAULT_PDF_PAGE_OPTIONS.scale);
    }
    public set pdfScale(value: number) {
        if (value > 0) this.setProperty("pdfScale", value);
    }

    constructor() {
        super();
        const property = PropertyUtils.getProperty(Export.prototype, "format")!;
        property.combobox!.items.clear();
        // In the constructor, this.application has not been assigned yet, so use the global app.
        property.combobox!.items.push(...app.dataExchange.exportFormats());
    }

    protected async executeAsync() {
        const nodes = await this.selectNodesAsync();
        if (!nodes || nodes.length === 0) {
            PubSub.default.pub("showToast", "toast.select.noSelected");
            return;
        }

        if (this.format === ".pdf") {
            await this.exportPdfAsync(nodes);
            return;
        }

        PubSub.default.pub(
            "showPermanent",
            async () => {
                PubSub.default.pub("showToast", "toast.downloading");
                if (this.merge || nodes.length === 1) {
                    await this.exportMergedAsync(nodes);
                } else {
                    await this.exportAsZipAsync(nodes);
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.file.export"),
        );
    }

    private pdfOptions(): PdfPageOptions {
        return {
            pageSize: this.pdfPageSize,
            landscape: this.pdfOrientation === "pdf.orientation.landscape",
            marginMm: this.pdfMarginMm,
            scaleMode: this.pdfScaleMode === "pdf.scaleMode.fit" ? "fit" : "fixed",
            scale: this.pdfScale,
            lineWeightMm: DEFAULT_PDF_PAGE_OPTIONS.lineWeightMm,
            thinWeightMm: DEFAULT_PDF_PAGE_OPTIONS.thinWeightMm,
        };
    }

    private async exportPdfAsync(nodes: VisualNode[]) {
        const options = this.pdfOptions();
        const plan = this.application.dataExchange.planPdfExport?.(nodes, options);
        if (!plan) {
            PubSub.default.pub("showToast", "error.export.noNodeCanBeExported");
            return;
        }

        const confirmed = await this.confirmPdfPreview(plan);
        if (!confirmed) return;

        PubSub.default.pub(
            "showPermanent",
            async () => {
                PubSub.default.pub("showToast", "toast.downloading");
                // Eagerly load the writer chunk when the user confirms export.
                const data = await this.application.dataExchange.export(".pdf", nodes, {
                    pdf: options,
                    pdfPlan: plan,
                });
                if (!data) return;
                download(data, `${nodes[0].name}.pdf`);
                if (plan.skipped.length > 0) {
                    PubSub.default.pub("showToast", "pdf.skipped:{0}", plan.skipped.join(", "));
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.file.export"),
        );
    }

    /**
     * Preview uses the same PdfExportPlan the writer will consume. Fixed scale that
     * does not fit requires an explicit confirm before export.
     */
    private confirmPdfPreview(plan: PdfExportPlan): Promise<boolean> {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            drawPdfPlanToCanvas(plan, canvas, { scale: 0.35 });
            canvas.style.maxWidth = "100%";
            canvas.style.height = "auto";
            canvas.style.border = "1px solid #ccc";

            const info = document.createElement("div");
            info.style.marginTop = "8px";
            info.style.fontSize = "12px";
            info.style.lineHeight = "1.4";
            const lines = [
                `1:${plan.layout.scale.toFixed(2)} · ${plan.options.pageSize} ${
                    plan.options.landscape ? "landscape" : "portrait"
                }`,
                `Longest edge on paper: ${plan.longestEdgePaperMm.toFixed(3)} mm`,
                `Max arc deviation on paper: ${plan.maxArcDeviationPaperMm.toFixed(4)} mm`,
            ];
            if (plan.skipped.length) {
                lines.push(`${I18n.translate("pdf.skippedLabel")}: ${plan.skipped.join(", ")}`);
            }
            if (plan.layout.clip) {
                const [ox, oy] = plan.layout.clipExcessMm;
                lines.push(`${I18n.translate("pdf.clipWarning")}: ${ox.toFixed(1)} × ${oy.toFixed(1)} mm`);
            }
            info.textContent = lines.join("\n");
            info.style.whiteSpace = "pre-wrap";

            const content = document.createElement("div");
            content.append(canvas, info);

            const buttons = plan.layout.clip
                ? [
                      {
                          content: "pdf.confirmClip" as const,
                          onclick: () => resolve(true),
                      },
                      {
                          content: "common.cancel" as const,
                          onclick: () => resolve(false),
                      },
                  ]
                : [
                      {
                          content: "common.confirm" as const,
                          onclick: () => resolve(true),
                      },
                      {
                          content: "common.cancel" as const,
                          onclick: () => resolve(false),
                      },
                  ];

            PubSub.default.pub("showDialog", "pdf.previewTitle", content, buttons);
        });
    }

    private get suffix() {
        // ".stl binary" and ".ply binary" share the plain file extension.
        if (this.format === ".stl binary") return ".stl";
        if (this.format === ".ply binary") return ".ply";
        return this.format;
    }

    private async exportMergedAsync(nodes: VisualNode[]) {
        const data = await this.application.dataExchange.export(this.format, nodes);
        if (!data) return;
        download(data, `${nodes[0].name}${this.suffix}`);
    }

    // Browsers block multiple automatic downloads, so pack the files into one zip.
    private async exportAsZipAsync(nodes: VisualNode[]) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const usedNames = new Set<string>();

        for (const node of nodes) {
            const data = await this.application.dataExchange.export(this.format, [node]);
            if (!data) continue;
            zip.file(this.uniqueFileName(node.name, usedNames), new Blob(data));
        }

        download([await zip.generateAsync({ type: "blob" })], `${nodes[0].name}.zip`);
    }

    private uniqueFileName(nodeName: string, usedNames: Set<string>) {
        let fileName = `${nodeName}${this.suffix}`;
        let counter = 1;
        while (usedNames.has(fileName)) {
            fileName = `${nodeName}-${counter++}${this.suffix}`;
        }
        usedNames.add(fileName);
        return fileName;
    }

    private async selectNodesAsync() {
        this.controller = new AsyncController();
        const step = new SelectNodeStep("prompt.select.models", { multiple: true, keepSelection: true });
        const data = await step.execute(this.application.activeView?.document!, this.controller);
        if (!data?.nodes) {
            PubSub.default.pub("showToast", "prompt.select.noModelSelected");
            return undefined;
        }
        return data.nodes;
    }
}
