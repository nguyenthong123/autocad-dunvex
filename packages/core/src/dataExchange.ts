// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "./document";
import type { VisualNode } from "./model";
import type { DataExchangeExportOptions, PdfExportPlan, PdfPageOptions } from "./pdf";

export interface IDataExchange {
    importFormats(): string[];
    exportFormats(): string[];
    import(document: IDocument, files: FileList | File[]): Promise<void>;
    export(
        type: string,
        nodes: VisualNode[],
        options?: DataExchangeExportOptions,
    ): Promise<BlobPart[] | undefined>;
    /**
     * Build the paper-space plan used by both the PDF preview and the writer.
     * Optional so mocks / non-PDF exchanges can omit it.
     */
    planPdfExport?(nodes: VisualNode[], options: PdfPageOptions): PdfExportPlan | undefined;
    /** Prefetch pdf-lib + OFL font when the user selects the PDF format. */
    preloadPdfWriter?(): Promise<void>;
}

export type { DataExchangeExportOptions, PdfExportPlan, PdfPageOptions };
