// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type DataExchangeExportOptions,
    DEFAULT_PDF_PAGE_OPTIONS,
    EditableShapeNode,
    I18n,
    type IDataExchange,
    type IDocument,
    type INode,
    type IShape,
    type PdfExportPlan,
    type PdfPageOptions,
    PubSub,
    Result,
    ShapeNode,
    type VisualNode,
} from "@chili3d/core";
import { DxfConverter } from "./dxfConverter";
import { planPdfFromNodes } from "./pdf/collectDrawing";
import { writePdfPlan } from "./pdf/pdfWriter";

export class DefaultDataExchange implements IDataExchange {
    importFormats(): string[] {
        return [".dxf", ".step", ".stp", ".iges", ".igs", ".brep", ".stl"];
    }

    exportFormats(): string[] {
        return [
            ".dxf",
            ".pdf",
            ".step",
            ".iges",
            ".brep",
            ".stl",
            ".stl binary",
            ".ply",
            ".ply binary",
            ".obj",
        ];
    }

    planPdfExport(nodes: VisualNode[], options: PdfPageOptions): PdfExportPlan | undefined {
        return planPdfFromNodes(nodes, options);
    }

    async preloadPdfWriter(): Promise<void> {
        const { loadPdfFontBytes, loadPdfLib } = await import("./pdf/pdfWriter");
        await Promise.all([loadPdfLib(), loadPdfFontBytes()]);
    }

    async import(document: IDocument, files: FileList | File[]): Promise<void> {
        for (const file of files) {
            await this.handleSingleFileImport(document, file);
        }
    }

    private async handleSingleFileImport(document: IDocument, file: File) {
        let importResult: Result<INode> | undefined;

        const fileName = file.name.toLocaleLowerCase();
        if (this.extensionIs(fileName, ".dxf")) {
            const text =
                typeof file.text === "function" ? await file.text() : await new Response(file).text();
            importResult = DxfConverter.importFromDxf(document, text);
        } else if (this.extensionIs(fileName, ".brep")) {
            importResult = await this.importBrep(document, file);
        } else if (this.extensionIs(fileName, ".stl")) {
            importResult = await this.importStl(document, file);
        } else if (this.extensionIs(fileName, ".step", ".stp")) {
            importResult = await this.importStep(document, file);
        } else if (this.extensionIs(fileName, ".iges", ".igs")) {
            importResult = await this.importIges(document, file);
        }

        this.handleImportResult(document, fileName, importResult);
    }

    private extensionIs(fileName: string, ...extensions: string[]): boolean {
        return extensions.some((ext) => fileName.endsWith(ext));
    }

    private handleImportResult(document: IDocument, name: string, nodeResult: Result<INode> | undefined) {
        if (!nodeResult?.isOk) {
            alert(I18n.translate("error.import.unsupportedFileType:{0}", name));
            return;
        }

        const node = nodeResult.value;
        node.name = name;
        document.modelManager.addNode(node);
        document.visual.update();
    }

    async importBrep(document: IDocument, file: File) {
        const shape = shapeConverter.convertFromBrep(await file.text());
        if (!shape.isOk) {
            return Result.err(shape.error);
        }
        return Result.ok(new EditableShapeNode({ document, name: file.name, shape: shape.value }));
    }

    private async importStl(document: IDocument, file: File) {
        const content = new Uint8Array(await file.arrayBuffer());
        return shapeConverter.convertFromSTL(document, content);
    }

    private async importIges(document: IDocument, file: File) {
        const content = new Uint8Array(await file.arrayBuffer());
        return shapeConverter.convertFromIGES(document, content);
    }

    private async importStep(document: IDocument, file: File) {
        const content = new Uint8Array(await file.arrayBuffer());
        return shapeConverter.convertFromSTEP(document, content);
    }

    async export(
        type: string,
        nodes: VisualNode[],
        options?: DataExchangeExportOptions,
    ): Promise<BlobPart[] | undefined> {
        if (nodes.length === 0) return undefined;

        if (type === ".pdf") {
            return this.exportPdf(nodes, options);
        }

        const document = nodes[0].document;
        let shapeResult: Result<BlobPart> | undefined;
        if (type === ".dxf") {
            const shapes = this.getExportShapes(nodes);
            if (!shapes.length) return undefined;
            shapeResult = DxfConverter.exportToDxf(shapes);
        } else if (type === ".ply") {
            shapeResult = document.visual.meshExporter.exportToPly(nodes, true);
        } else if (type === ".ply binary") {
            shapeResult = document.visual.meshExporter.exportToPly(nodes, false);
        } else if (type === ".obj") {
            shapeResult = document.visual.meshExporter.exportToObj(nodes);
        } else {
            const shapes = this.getExportShapes(nodes);
            if (!shapes.length) return undefined;
            // STL goes through the headless OCCT-mesh converter (not the Three.js
            // visual exporter), so the same path works in the browser and the MCP server.
            if (type === ".stl") shapeResult = this.exportStl(document, shapes, false);
            if (type === ".stl binary") shapeResult = this.exportStl(document, shapes, true);
            if (type === ".step") shapeResult = this.exportStep(document, shapes);
            if (type === ".iges") shapeResult = this.exportIges(document, shapes);
            if (type === ".brep") shapeResult = this.exportBrep(document, shapes);
        }

        if (shapeResult) {
            return this.handleExportResult(shapeResult);
        }
        return undefined;
    }

    private getExportShapes(nodes: VisualNode[]): IShape[] {
        const shapes = nodes
            .filter((x): x is ShapeNode => x instanceof ShapeNode && !x.isReferenceGeometry)
            .map((x) => x.shape.value.transformedMul(x.worldTransform()));

        !shapes.length && PubSub.default.pub("showToast", "error.export.noNodeCanBeExported");
        return shapes;
    }

    private exportStl(doc: IDocument, shapes: IShape[], binary: boolean): Result<BlobPart> {
        return shapeConverter.convertToSTL(shapes, { binary }) as Result<BlobPart>;
    }

    private exportStep(doc: IDocument, shapes: IShape[]) {
        return shapeConverter.convertToSTEP(...shapes);
    }

    private exportIges(doc: IDocument, shapes: IShape[]) {
        return shapeConverter.convertToIGES(...shapes);
    }

    private exportBrep(document: IDocument, shapes: IShape[]) {
        const comp = shapeFactory.combine(shapes);
        if (!comp.isOk) {
            return Result.err(comp.error);
        }

        const result = shapeConverter.convertToBrep(comp.value);
        comp.value.dispose();
        return result;
    }

    private handleExportResult(result: Result<BlobPart> | undefined) {
        if (!result?.isOk) {
            PubSub.default.pub("showToast", "error.default:{0}", result?.error);
            return undefined;
        }
        return [result.value];
    }

    private async exportPdf(
        nodes: VisualNode[],
        options?: DataExchangeExportOptions,
    ): Promise<BlobPart[] | undefined> {
        const page = options?.pdf ?? DEFAULT_PDF_PAGE_OPTIONS;
        const plan = options?.pdfPlan ?? this.planPdfExport(nodes, page);
        if (!plan) {
            PubSub.default.pub("showToast", "error.export.noNodeCanBeExported");
            return undefined;
        }
        try {
            const bytes = await writePdfPlan(plan);
            // Copy into a standalone ArrayBuffer so BlobPart typing accepts it (TS ArrayBufferLike).
            return [bytes.slice().buffer];
        } catch (err) {
            PubSub.default.pub("showToast", "error.default:{0}", String(err));
            return undefined;
        }
    }
}
