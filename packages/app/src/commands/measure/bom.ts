// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Annotation,
    type BoundingBox,
    command,
    FolderNode,
    type IApplication,
    type ICommand,
    type IDocument,
    type INode,
    PubSub,
} from "@chili3d/core";
import { getChildren, traverseNodes } from "../folder";
import style from "./bom.module.css";

export interface BomReportItem {
    id: string;
    materialName: string;
    materialColor: string;
    dimensions: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
    count: number;
    totalLengthM: number;
    totalAreaM2: number;
    unit: "piece" | "m2" | "m";
    unitPrice: number;
    nodes: INode[];
}

export function computeBomReport(doc: IDocument, inputNodes: INode[]): BomReportItem[] {
    const leafNodes: INode[] = [];
    const visit = (node: INode) => {
        const children = getChildren(node);
        if (children.length > 0 && (node instanceof FolderNode || node === doc.modelManager.rootNode)) {
            for (const child of children) {
                visit(child);
            }
        } else if (!(node instanceof Annotation) && node !== doc.modelManager.rootNode) {
            leafNodes.push(node);
        }
    };
    for (const n of inputNodes) {
        visit(n);
    }

    const materialMap = new Map<string, { name: string; color: string }>();
    for (const mat of doc.modelManager.materials) {
        const hex = mat.color !== undefined ? `#${mat.color.toString(16).padStart(6, "0")}` : "#d3d3d3";
        materialMap.set(mat.id, { name: mat.name || "Vật liệu", color: hex });
    }

    const groupMap = new Map<string, BomReportItem>();

    for (const node of leafNodes) {
        const bb: BoundingBox | undefined =
            typeof (node as any).boundingBox === "function" ? (node as any).boundingBox() : undefined;
        if (!bb || !bb.min || !bb.max) continue;

        const dx = Math.round(Math.abs(bb.max.x - bb.min.x) * 10) / 10;
        const dy = Math.round(Math.abs(bb.max.y - bb.min.y) * 10) / 10;
        const dz = Math.round(Math.abs(bb.max.z - bb.min.z) * 10) / 10;
        if (dx === 0 && dy === 0 && dz === 0) continue;

        const sorted = [dx, dy, dz].sort((a, b) => b - a);
        const L = sorted[0];
        const W = sorted[1];
        const T = sorted[2];

        let dimStr: string;
        if (T > 0.05) {
            dimStr = `${L} × ${W} × ${T} mm`;
        } else if (W > 0.05) {
            dimStr = `${L} × ${W} mm`;
        } else {
            dimStr = `${L} mm`;
        }

        const matId = (node as any).materialId ?? (node as any).faceMaterialId;
        const matInfo = matId ? materialMap.get(matId) : undefined;
        const matName =
            matInfo?.name ??
            (node.name
                ? node.name.replace(/_copy\d*|\s*-\s*copy\d*|\s*\(\d+\)/gi, "").trim()
                : "Mặc định (Chưa gán)");
        const matColor = matInfo?.color ?? "#d3d3d3";

        const groupKey = `${matName}___${matColor}___${dimStr}`;
        let item = groupMap.get(groupKey);
        if (!item) {
            item = {
                id: groupKey,
                materialName: matName,
                materialColor: matColor,
                dimensions: dimStr,
                lengthMm: L,
                widthMm: W,
                thicknessMm: T,
                count: 0,
                totalLengthM: 0,
                totalAreaM2: 0,
                unit: T > 0.05 && W > 0.05 ? "piece" : W > 0.05 ? "m2" : "m",
                unitPrice: 0,
                nodes: [],
            };
            groupMap.set(groupKey, item);
        }
        item.count += 1;
        item.nodes.push(node);
    }

    const result = Array.from(groupMap.values());
    for (const item of result) {
        item.totalLengthM = Math.round(((item.lengthMm * item.count) / 1000) * 100) / 100;
        item.totalAreaM2 = Math.round(((item.lengthMm * item.widthMm * item.count) / 1000000) * 100) / 100;
    }

    result.sort((a, b) => a.materialName.localeCompare(b.materialName) || b.count - a.count);
    return result;
}

export function showBomDialog(doc: IDocument, initialNodes: INode[], allVisibleNodes: INode[]): HTMLElement {
    const container = document.createElement("div");
    container.className = style.container;

    let activeScope: "selected" | "all" =
        initialNodes.length > 0 && initialNodes !== allVisibleNodes ? "selected" : "all";
    let reportItems = computeBomReport(doc, activeScope === "selected" ? initialNodes : allVisibleNodes);

    // 1. Scope Bar
    const scopeBar = document.createElement("div");
    scopeBar.className = style.scopeBar;

    const btnSelected = document.createElement("button");
    btnSelected.className = `${style.scopeBtn} ${activeScope === "selected" ? style.active : ""}`;
    btnSelected.textContent = `🎯 Đang chọn (${initialNodes.length} đối tượng)`;

    const btnAll = document.createElement("button");
    btnAll.className = `${style.scopeBtn} ${activeScope === "all" ? style.active : ""}`;
    btnAll.textContent = `🌐 Toàn bộ bản vẽ (${allVisibleNodes.length} đối tượng)`;

    scopeBar.appendChild(btnSelected);
    scopeBar.appendChild(btnAll);
    container.appendChild(scopeBar);

    // 2. Table Wrap
    const tableWrap = document.createElement("div");
    tableWrap.className = style.tableWrap;
    container.appendChild(tableWrap);

    // 3. Summary Bar
    const summaryBar = document.createElement("div");
    summaryBar.className = style.summaryBar;
    container.appendChild(summaryBar);

    // 4. Actions Bar
    const actionsBar = document.createElement("div");
    actionsBar.className = style.actionsBar;

    const btnExportCsv = document.createElement("button");
    btnExportCsv.className = style.actionBtn;
    btnExportCsv.textContent = "📥 Xuất Excel (CSV)";

    const btnCopyZalo = document.createElement("button");
    btnCopyZalo.className = style.actionBtn;
    btnCopyZalo.textContent = "📋 Copy Báo giá (Zalo)";

    const btnPrint = document.createElement("button");
    btnPrint.className = style.actionBtn;
    btnPrint.textContent = "🖨️ In Bảng kê";

    actionsBar.append(btnExportCsv, btnCopyZalo, btnPrint);
    container.appendChild(actionsBar);

    const calcLineTotal = (item: BomReportItem): number => {
        if (item.unit === "piece") return Math.round(item.count * item.unitPrice);
        if (item.unit === "m2") return Math.round(item.totalAreaM2 * item.unitPrice);
        return Math.round(item.totalLengthM * item.unitPrice);
    };

    const formatCurrency = (val: number): string => {
        return `${new Intl.NumberFormat("vi-VN").format(val)} đ`;
    };

    const updateSummary = () => {
        const totalCount = reportItems.reduce((acc, it) => acc + it.count, 0);
        const totalLength = reportItems.reduce((acc, it) => acc + it.totalLengthM, 0);
        const totalArea = reportItems.reduce((acc, it) => acc + it.totalAreaM2, 0);
        const grandTotal = reportItems.reduce((acc, it) => acc + calcLineTotal(it), 0);

        summaryBar.innerHTML = `
            <div>Số loại vật tư: <strong>${reportItems.length}</strong> | Tổng chi tiết: <strong>${totalCount}</strong></div>
            <div>Tổng dài: <strong>${totalLength.toFixed(2)} m</strong> | Tổng diện tích: <strong>${totalArea.toFixed(2)} m²</strong></div>
            <div>Tổng thành tiền: <strong>${formatCurrency(grandTotal)}</strong></div>
        `;
    };

    const renderTable = () => {
        tableWrap.innerHTML = "";
        if (reportItems.length === 0) {
            const empty = document.createElement("div");
            empty.className = style.emptyMsg;
            empty.textContent = "Không tìm thấy đối tượng hình học nào trong phạm vi đã chọn.";
            tableWrap.appendChild(empty);
            updateSummary();
            return;
        }

        const table = document.createElement("table");
        table.className = style.table;

        const thead = document.createElement("thead");
        thead.innerHTML = `
            <tr>
                <th style="width: 40px; text-align: center;">STT</th>
                <th style="width: 80px;">Màu</th>
                <th>Tên Sản phẩm / Vật liệu</th>
                <th>Quy cách (L × W × T)</th>
                <th style="text-align: right;">SL</th>
                <th style="text-align: right;">Dài (m)</th>
                <th style="text-align: right;">Diện tích (m²)</th>
                <th style="width: 110px;">ĐVT</th>
                <th style="width: 100px; text-align: right;">Đơn giá</th>
                <th style="width: 120px; text-align: right;">Thành tiền</th>
                <th style="width: 50px; text-align: center;">Chọn</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        reportItems.forEach((item, index) => {
            const tr = document.createElement("tr");

            // STT
            const tdStt = document.createElement("td");
            tdStt.style.textAlign = "center";
            tdStt.textContent = `${index + 1}`;
            tr.appendChild(tdStt);

            // Color
            const tdColor = document.createElement("td");
            const colorDiv = document.createElement("div");
            colorDiv.className = style.colorCell;
            const swatch = document.createElement("span");
            swatch.className = style.colorSwatch;
            swatch.style.backgroundColor = item.materialColor;
            const hexSpan = document.createElement("span");
            hexSpan.textContent = item.materialColor;
            hexSpan.style.fontSize = "11px";
            colorDiv.append(swatch, hexSpan);
            tdColor.appendChild(colorDiv);
            tr.appendChild(tdColor);

            // Name
            const tdName = document.createElement("td");
            tdName.textContent = item.materialName;
            tdName.style.fontWeight = "500";
            tr.appendChild(tdName);

            // Dimensions
            const tdDim = document.createElement("td");
            tdDim.textContent = item.dimensions;
            tr.appendChild(tdDim);

            // Count
            const tdCount = document.createElement("td");
            tdCount.style.textAlign = "right";
            tdCount.textContent = `${item.count}`;
            tr.appendChild(tdCount);

            // Total Length
            const tdLen = document.createElement("td");
            tdLen.style.textAlign = "right";
            tdLen.textContent = item.totalLengthM.toFixed(2);
            tr.appendChild(tdLen);

            // Total Area
            const tdArea = document.createElement("td");
            tdArea.style.textAlign = "right";
            tdArea.textContent = item.totalAreaM2.toFixed(2);
            tr.appendChild(tdArea);

            // Unit select
            const tdUnit = document.createElement("td");
            const selectUnit = document.createElement("select");
            selectUnit.className = style.unitSelect;
            selectUnit.innerHTML = `
                <option value="piece" ${item.unit === "piece" ? "selected" : ""}>Thanh/Tấm</option>
                <option value="m2" ${item.unit === "m2" ? "selected" : ""}>m²</option>
                <option value="m" ${item.unit === "m" ? "selected" : ""}>m dài</option>
            `;
            tdUnit.appendChild(selectUnit);
            tr.appendChild(tdUnit);

            // Unit Price input
            const tdPrice = document.createElement("td");
            tdPrice.style.textAlign = "right";
            const inputPrice = document.createElement("input");
            inputPrice.type = "number";
            inputPrice.className = style.numberInput;
            inputPrice.value = `${item.unitPrice}`;
            inputPrice.min = "0";
            inputPrice.step = "1000";
            tdPrice.appendChild(inputPrice);
            tr.appendChild(tdPrice);

            // Line Total
            const tdTotal = document.createElement("td");
            tdTotal.style.textAlign = "right";
            tdTotal.style.fontWeight = "600";
            tdTotal.textContent = formatCurrency(calcLineTotal(item));
            tr.appendChild(tdTotal);

            const updateRow = () => {
                tdTotal.textContent = formatCurrency(calcLineTotal(item));
                updateSummary();
            };

            selectUnit.onchange = () => {
                item.unit = selectUnit.value as "piece" | "m2" | "m";
                updateRow();
            };

            inputPrice.oninput = () => {
                item.unitPrice = Math.max(0, Number(inputPrice.value) || 0);
                updateRow();
            };

            // Select button
            const tdSelect = document.createElement("td");
            tdSelect.style.textAlign = "center";
            const btnSelect = document.createElement("button");
            btnSelect.className = style.selectBtn;
            btnSelect.textContent = "🎯";
            btnSelect.title = "Chọn các đối tượng này trên 3D";
            btnSelect.onclick = (e) => {
                e.stopPropagation();
                doc.selection?.setSelectedNodes?.(item.nodes, false);
                doc.visual?.update?.();
                const activeView = (doc as any).application?.activeView;
                activeView?.cameraController?.fitContent?.({ duration: 800, scope: "selection" });
            };
            tdSelect.appendChild(btnSelect);
            tr.appendChild(tdSelect);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        updateSummary();
    };

    btnSelected.onclick = () => {
        if (activeScope === "selected") return;
        activeScope = "selected";
        btnSelected.classList.add(style.active);
        btnAll.classList.remove(style.active);
        reportItems = computeBomReport(doc, initialNodes);
        renderTable();
    };

    btnAll.onclick = () => {
        if (activeScope === "all") return;
        activeScope = "all";
        btnAll.classList.add(style.active);
        btnSelected.classList.remove(style.active);
        reportItems = computeBomReport(doc, allVisibleNodes);
        renderTable();
    };

    // Actions implementation
    btnExportCsv.onclick = () => {
        const rows = [
            [
                "STT",
                "Ma Mau",
                "Ten San Pham / Vat Lieu",
                "Quy Cach (L x W x T)",
                "So Luong",
                "Tong Met Dai (m)",
                "Tong Dien Tich (m2)",
                "Don Vi Tinh",
                "Don Gia (VND)",
                "Thanh Tien (VND)",
            ],
            ...reportItems.map((it, idx) => [
                `${idx + 1}`,
                `"${it.materialColor}"`,
                `"${it.materialName}"`,
                `"${it.dimensions}"`,
                `${it.count}`,
                `${it.totalLengthM.toFixed(2)}`,
                `${it.totalAreaM2.toFixed(2)}`,
                `"${it.unit === "piece" ? "Thanh/Tấm" : it.unit === "m2" ? "m²" : "m dài"}"`,
                `${it.unitPrice}`,
                `${calcLineTotal(it)}`,
            ]),
        ];
        const csvContent = `\uFEFF${rows.map((e) => e.join(",")).join("\n")}`;
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanName = (doc.name || "DuAn").replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, "_");
        a.download = `BOM_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    btnCopyZalo.onclick = async () => {
        const totalCount = reportItems.reduce((acc, it) => acc + it.count, 0);
        const totalArea = reportItems.reduce((acc, it) => acc + it.totalAreaM2, 0);
        const grandTotal = reportItems.reduce((acc, it) => acc + calcLineTotal(it), 0);

        const lines = [
            "📊 BẢNG BÓC TÁCH KHỐI LƯỢNG & BÁO GIÁ VẬT TƯ",
            `Dự án: ${doc.name || "Bản vẽ"}`,
            "-------------------------------------------",
            ...reportItems.map((it, idx) => {
                const uStr = it.unit === "piece" ? "Thanh/Tấm" : it.unit === "m2" ? "m²" : "m";
                return `${idx + 1}. ${it.materialName} | ${it.dimensions}\n   👉 SL: ${it.count} ${uStr} | Dài: ${it.totalLengthM.toFixed(2)}m | DT: ${it.totalAreaM2.toFixed(2)}m² | ĐG: ${formatCurrency(it.unitPrice)} | TT: ${formatCurrency(calcLineTotal(it))}`;
            }),
            "-------------------------------------------",
            `👉 TỔNG CỘNG: ${totalCount} chi tiết | ${totalArea.toFixed(2)} m²`,
            `💰 TỔNG THÀNH TIỀN: ${formatCurrency(grandTotal)}`,
        ];

        const text = lines.join("\n");
        try {
            await navigator.clipboard.writeText(text);
            PubSub.default.pub("showToast", "toast.bom.copied");
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            PubSub.default.pub("showToast", "toast.bom.copied");
        }
    };

    btnPrint.onclick = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;
        const totalCount = reportItems.reduce((acc, it) => acc + it.count, 0);
        const totalArea = reportItems.reduce((acc, it) => acc + it.totalAreaM2, 0);
        const grandTotal = reportItems.reduce((acc, it) => acc + calcLineTotal(it), 0);

        printWindow.document.write(`
            <html>
                <head>
                    <title>Bảng Thống kê Vật tư - ${doc.name}</title>
                    <style>
                        body { font-family: sans-serif; padding: 24px; color: #333; }
                        h2 { margin-bottom: 4px; }
                        p { margin-top: 0; color: #666; }
                        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
                        th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
                        th { background: #f0f0f0; }
                        .text-right { text-align: right; }
                        .text-center { text-align: center; }
                        .swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid #999; margin-right: 6px; vertical-align: middle; }
                        .footer { margin-top: 20px; font-weight: bold; text-align: right; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <h2>BẢNG THỐNG KÊ VẬT TƯ & BÓC TÁCH KHỐI LƯỢNG</h2>
                    <p>Dự án: <strong>${doc.name}</strong> - Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}</p>
                    <table>
                        <thead>
                            <tr>
                                <th class="text-center" style="width: 40px;">STT</th>
                                <th>Vật liệu / Sản phẩm</th>
                                <th>Quy cách (L × W × T)</th>
                                <th class="text-right">SL</th>
                                <th class="text-right">Dài (m)</th>
                                <th class="text-right">Diện tích (m²)</th>
                                <th>ĐVT</th>
                                <th class="text-right">Đơn giá</th>
                                <th class="text-right">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reportItems
                                .map(
                                    (it, idx) => `
                                <tr>
                                    <td class="text-center">${idx + 1}</td>
                                    <td><span class="swatch" style="background:${it.materialColor}"></span>${it.materialName}</td>
                                    <td>${it.dimensions}</td>
                                    <td class="text-right">${it.count}</td>
                                    <td class="text-right">${it.totalLengthM.toFixed(2)}</td>
                                    <td class="text-right">${it.totalAreaM2.toFixed(2)}</td>
                                    <td>${it.unit === "piece" ? "Thanh/Tấm" : it.unit === "m2" ? "m²" : "m dài"}</td>
                                    <td class="text-right">${formatCurrency(it.unitPrice)}</td>
                                    <td class="text-right">${formatCurrency(calcLineTotal(it))}</td>
                                </tr>`,
                                )
                                .join("")}
                        </tbody>
                    </table>
                    <div class="footer">
                        Tổng cộng: ${totalCount} chi tiết | ${totalArea.toFixed(2)} m² | Thành tiền: ${formatCurrency(grandTotal)}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    renderTable();

    // Trigger dialog popup
    PubSub.default.pub("showDialog", "command.measure.bom", container, [
        {
            content: "common.cancel",
        },
    ]);

    return container;
}

@command({
    key: "measure.bom",
    icon: "icon-measureSelect",
})
export class BomCommand implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (!document) return;

        const allVisibleNodes: INode[] = [];
        traverseNodes(document.modelManager.rootNode, (n) => {
            if (
                n !== document.modelManager.rootNode &&
                n.visible &&
                !(n instanceof FolderNode) &&
                !(n instanceof Annotation)
            ) {
                allVisibleNodes.push(n);
            }
        });

        const selected =
            typeof document.selection?.getSelectedNodes === "function"
                ? document.selection
                      .getSelectedNodes()
                      .filter((n) => !(n instanceof Annotation) && n !== document.modelManager.rootNode)
                : [];

        if (selected.length > 0) {
            showBomDialog(document, selected, allVisibleNodes);
        } else {
            showBomDialog(document, allVisibleNodes, allVisibleNodes);
        }
    }
}
