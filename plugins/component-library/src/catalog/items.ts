// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CatalogItem } from "./types";

export const CATALOG_ITEMS: CatalogItem[] = [
    {
        code: "LH-5050",
        name: "Lam hộp WPC 50×50",
        category: "lam-hop",
        width: 50,
        thickness: 50,
        defaultLength: 3000,
        step: 60,
        jointNote: "Khe hở kỹ thuật 10 mm (bước tâm 60 mm)",
        material: "Gỗ nhựa Composite (WPC)",
        defaultColor: "#9c6644",
        description: "Lam hộp gỗ nhựa ngoài trời/trong nhà quy cách chuẩn 50×50 mm, lắp vách trang trí.",
        isVerifiedRealSpec: true,
        isRealProfile: false,
        badgeText: "Mẫu thử khối hộp",
        svgPreview: `<svg viewBox="0 0 120 90" width="100%" height="70" xmlns="http://www.w3.org/2000/svg">
            <rect x="35" y="20" width="50" height="50" rx="3" fill="#b07d58" stroke="#5a3825" stroke-width="2" />
            <rect x="42" y="27" width="36" height="36" rx="2" fill="#dfc5b2" stroke="#5a3825" stroke-width="1.2" stroke-dasharray="2 2" />
            <!-- Dimension W = 50 -->
            <line x1="35" y1="76" x2="85" y2="76" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="35" y1="73" x2="35" y2="79" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="85" y1="73" x2="85" y2="79" stroke="#2c3e50" stroke-width="1.2" />
            <text x="60" y="85" font-size="9" text-anchor="middle" fill="#2c3e50" font-weight="600">50 mm</text>
            <!-- Dimension T = 50 -->
            <line x1="28" y1="20" x2="28" y2="70" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="25" y1="20" x2="31" y2="20" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="25" y1="70" x2="31" y2="70" stroke="#2c3e50" stroke-width="1.2" />
            <text x="22" y="48" font-size="9" text-anchor="end" fill="#2c3e50" font-weight="600">50</text>
        </svg>`,
    },
    {
        code: "LH-10050",
        name: "Lam hộp WPC 100×50",
        category: "lam-hop",
        width: 100,
        thickness: 50,
        defaultLength: 3000,
        step: 120,
        jointNote: "Khe hở kỹ thuật 20 mm (bước tâm 120 mm)",
        material: "Gỗ nhựa Composite (WPC)",
        defaultColor: "#7f5539",
        description: "Lam hộp bản lớn 100×50 mm dùng cho vách sảnh, mặt tiền hoặc trần nan.",
        isVerifiedRealSpec: true,
        isRealProfile: false,
        badgeText: "Mẫu thử khối hộp",
        svgPreview: `<svg viewBox="0 0 140 90" width="100%" height="70" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="25" width="100" height="40" rx="3" fill="#8f5d38" stroke="#482e1c" stroke-width="2" />
            <rect x="27" y="32" width="40" height="26" rx="2" fill="#dfc5b2" stroke="#482e1c" stroke-width="1" stroke-dasharray="2 2" />
            <rect x="73" y="32" width="40" height="26" rx="2" fill="#dfc5b2" stroke="#482e1c" stroke-width="1" stroke-dasharray="2 2" />
            <!-- Dimension W = 100 -->
            <line x1="20" y1="73" x2="120" y2="73" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="20" y1="70" x2="20" y2="76" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="120" y1="70" x2="120" y2="76" stroke="#2c3e50" stroke-width="1.2" />
            <text x="70" y="83" font-size="9" text-anchor="middle" fill="#2c3e50" font-weight="600">100 mm</text>
            <!-- Dimension T = 50 -->
            <line x1="13" y1="25" x2="13" y2="65" stroke="#2c3e50" stroke-width="1.2" />
            <text x="10" y="48" font-size="9" text-anchor="end" fill="#2c3e50" font-weight="600">50</text>
        </svg>`,
    },
    {
        code: "LS-3S-150",
        name: "Tấm ốp lam 3 sóng 150×15",
        category: "tam-op-song",
        width: 150,
        thickness: 15,
        defaultLength: 3000,
        step: 150,
        jointNote: "Hèm khóa âm dương ghép khít (bước 150 mm)",
        material: "Nhựa Nano PVC phủ vân gỗ",
        defaultColor: "#b08968",
        description: "Tấm ốp tường lam 3 sóng cao 15 mm, bề rộng hiệu dụng 150 mm, liên kết hèm khóa.",
        isVerifiedRealSpec: true,
        isRealProfile: true,
        badgeText: "Tiết diện 3 sóng thật",
        svgPreview: `<svg viewBox="0 0 160 85" width="100%" height="70" xmlns="http://www.w3.org/2000/svg">
            <!-- 3 waves profile -->
            <path d="M 10 50 L 15 50 L 15 35 L 35 35 L 35 50 L 55 50 L 55 35 L 75 35 L 75 50 L 95 50 L 95 35 L 115 35 L 115 50 L 150 50 L 150 54 L 10 54 Z"
                  fill="#c69f7b" stroke="#5a3825" stroke-width="1.6" />
            <!-- Dimension W = 150 -->
            <line x1="10" y1="64" x2="150" y2="64" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="10" y1="61" x2="10" y2="67" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="150" y1="61" x2="150" y2="67" stroke="#2c3e50" stroke-width="1.2" />
            <text x="80" y="75" font-size="9" text-anchor="middle" fill="#2c3e50" font-weight="600">150 mm (Bước 150)</text>
            <!-- Dimension T = 15 -->
            <text x="5" y="44" font-size="9" text-anchor="end" fill="#2c3e50" font-weight="600">15</text>
        </svg>`,
    },
    {
        code: "TN-9010",
        name: "Thanh đa năng 90×10",
        category: "thanh-da-nang",
        width: 90,
        thickness: 10,
        defaultLength: 3000,
        step: 90,
        jointNote: "Cạnh phẳng ghép sát (bước 90 mm)",
        material: "Gỗ nhựa Composite (WPC)",
        defaultColor: "#6f4e37",
        description: "Thanh đa năng bản phẳng 90×10 mm làm nẹp chỉ, ốp trần phẳng hoặc viền vách.",
        isVerifiedRealSpec: true,
        isRealProfile: false,
        badgeText: "Mẫu thử khối hộp",
        svgPreview: `<svg viewBox="0 0 140 85" width="100%" height="70" xmlns="http://www.w3.org/2000/svg">
            <rect x="25" y="38" width="90" height="12" rx="1.5" fill="#805b38" stroke="#482e1c" stroke-width="1.6" />
            <!-- Dimension W = 90 -->
            <line x1="25" y1="60" x2="115" y2="60" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="25" y1="57" x2="25" y2="63" stroke="#2c3e50" stroke-width="1.2" />
            <line x1="115" y1="57" x2="115" y2="63" stroke="#2c3e50" stroke-width="1.2" />
            <text x="70" y="72" font-size="9" text-anchor="middle" fill="#2c3e50" font-weight="600">90 mm</text>
            <text x="18" y="47" font-size="9" text-anchor="end" fill="#2c3e50" font-weight="600">10</text>
        </svg>`,
    },
];

export function findCatalogItem(code: string): CatalogItem | undefined {
    return CATALOG_ITEMS.find((item) => item.code.toLowerCase() === code.toLowerCase());
}
