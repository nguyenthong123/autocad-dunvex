# TASK-02: Việt hóa toàn diện giao diện (i18n) và Tùy biến thương hiệu / Giao diện

- **ID:** `TASK-02`
- **Tiêu đề:** Việt hóa toàn diện giao diện (i18n) và Tùy biến thương hiệu / Giao diện
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Cao (P1)
- **Độ khó:** Trung bình

---

## 1. Mục tiêu (Objective)

1. Bổ sung gói ngôn ngữ **Tiếng Việt (`vi`)** đầy đủ theo chuẩn thuật ngữ kỹ thuật CAD/AutoCAD Việt Nam vào hệ thống đa ngôn ngữ `@chili3d/i18n`, tự động nạp thông qua `AppBuilder.initI18n()` và đặt Tiếng Việt làm ngôn ngữ mặc định khi khởi chạy lần đầu.
2. Tùy biến bộ nhận diện thương hiệu (Branding):
   - Thay đổi tiêu đề trang, thẻ meta, favicon trong `public/index.html` và gỡ bỏ mã theo dõi Microsoft Clarity mặc định.
   - Thay đổi tên thương hiệu (`wordmark`), logo, liên kết mạng xã hội trên màn hình `Home` (`packages/ui/src/home/home.ts`).
   - Tinh chỉnh bảng màu giao diện (Theme Variables) và font chữ hỗ trợ đầy đủ dấu Tiếng Việt trong `packages/ui/src/mainWindow.module.css` và `public/index.css`.

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `packages/i18n/src/vi.ts` | Tạo mới | Chứa từ điển dịch thuật Tiếng Việt thực thi kiểu `Locale` từ `@chili3d/core` (gồm toàn bộ các khóa trong `I18N_KEYS`). |
| `packages/i18n/src/index.ts` | Chỉnh sửa | Export thêm module `vi` để `AppBuilder.initI18n()` tự động quét và đăng ký bằng `I18n.addLanguage()`. |
| `packages/core/src/i18n/i18n.ts` | Chỉnh sửa | Điều chỉnh hàm `I18n.defaultLanguage()` để ưu tiên nhận diện `"vi"` / `"vi-vn"` hoặc trả về `"vi"` làm mặc định. |
| `packages/core/src/i18n/keys.ts` | Tham chiếu / Chỉnh sửa | Định nghĩa mảng hằng số `I18N_KEYS` và kiểu `I18nKeys` cho toàn bộ ứng dụng. |
| `packages/ui/src/home/home.ts` | Chỉnh sửa | Màn hình trang chủ: chứa `logoSection()` (dòng 112-122), `links()` (dòng 193-219, có nút `wechat.group`), và phần hiển thị video hướng dẫn. |
| `public/index.html` | Chỉnh sửa | Khung HTML gốc chứa `<title>`, `<meta>`, `<link rel="icon">` và script Clarity. |
| `public/index.css` | Chỉnh sửa | Khai báo `font-family` gốc cho toàn bộ DOM. |
| `packages/ui/src/mainWindow.module.css` | Chỉnh sửa | Khai báo các biến CSS chủ đề `:root[theme="light"]` và `:root[theme="dark"]`. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Khởi tạo file từ điển Tiếng Việt `packages/i18n/src/vi.ts`

Trong Chili3D, kiểu `Locale` tại `packages/core/src/i18n/i18n.ts` yêu cầu đối tượng ngôn ngữ phải có cấu trúc `{ display: string, language: string, translation: Record<I18nKeys, string> }`. Sao chép cấu trúc từ `packages/i18n/src/en.ts` sang `packages/i18n/src/vi.ts` và dịch chuẩn thuật ngữ kỹ thuật CAD:

```ts
// File: packages/i18n/src/vi.ts
// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Locale } from "@chili3d/core";
import en from "./en";

const vi: Locale = {
    display: "Tiếng Việt",
    language: "vi",
    translation: {
        ...en.translation,
        // Common
        "common.name": "Tên đối tượng",
        "common.language": "Ngôn ngữ",
        "common.theme": "Giao diện",
        "common.theme.light": "Sáng",
        "common.theme.dark": "Tối",
        "common.theme.system": "Theo hệ thống",
        "common.3DNavigation": "Kiểu điều hướng",
        "common.orbitMode": "Chế độ xoay vùng nhìn",
        "common.orbitMode.turntable": "Bàn xoay (Turntable)",
        "common.orbitMode.trackball": "Tự do (Trackball)",
        "common.back": "Quay lại bản vẽ",
        "common.confirm": "Xác nhận",
        "common.cancel": "Hủy bỏ",
        "common.matrix": "Ma trận biến đổi",
        "common.shapeType": "Loại hình học",

        // Home
        "home.welcome": "Chào mừng đến với Dunvex CAD",
        "home.welcome.subtitle": "Nền tảng thiết kế kỹ thuật 2D/3D trực tuyến",
        "home.recent": "Bản vẽ gần đây",
        "home.recent.empty": "Chưa có bản vẽ nào gần đây",
        "home.videos": "Tài liệu & Hướng dẫn",

        // Ribbon Tabs & Groups
        "ribbon.tab.home": "Trang chính",
        "ribbon.tab.sketch": "Phác thảo 2D",
        "ribbon.tab.parametric": "Mô hình 3D",
        "ribbon.group.document": "Tài liệu",
        "ribbon.group.edit": "Chỉnh sửa",
        "ribbon.group.draw": "Vẽ 2D (Draw)",
        "ribbon.group.create": "Khối cơ bản",
        "ribbon.group.modify": "Hiệu chỉnh (Modify)",
        "ribbon.group.boolean": "Phép toán khối",
        "ribbon.group.annotate": "Ghi kích thước & Chú thích",
        "ribbon.group.measure": "Đo lường",

        // Commands - Document & File
        "command.doc.new": "Tạo bản vẽ mới",
        "command.doc.open": "Mở bản vẽ",
        "command.doc.save": "Lưu bản vẽ",
        "command.doc.saveToFile": "Tải tệp xuống (.chili3d)",
        "command.file.import": "Nhập bản vẽ (Import)",
        "command.file.export": "Xuất bản vẽ (Export)",
        "command.edit.undo": "Hoàn tác (Undo)",
        "command.edit.redo": "Làm lại (Redo)",

        // Commands - 2D / 3D Creation
        "command.create.line": "Đoạn thẳng (Line)",
        "command.create.rect": "Hình chữ nhật (Rect)",
        "command.create.circle": "Đường tròn (Circle)",
        "command.create.arc": "Cung tròn tâm - góc",
        "command.create.polygon": "Đa giác (Polyline)",
        "command.create.regularPolygon": "Đa giác đều",
        "command.create.ellipse": "Hình Elip",
        "command.create.bezier": "Đường cong Bezier",
        "command.create.point": "Điểm (Point)",
        "command.create.offset": "Song song (Offset)",
        "command.create.extrude": "Đùn khối (Extrude)",
        "command.create.revolve": "Xoay tròn khối (Revolve)",
        "command.create.sweep": "Quét đường dẫn (Sweep)",
        "command.create.loft": "Nối mặt cắt (Loft)",
        "command.create.folder": "Tạo Lớp / Thư mục",

        // Commands - Modify
        "command.modify.move": "Di chuyển (Move)",
        "command.modify.rotate": "Xoay (Rotate)",
        "command.modify.mirror": "Đối xứng (Mirror)",
        "command.modify.array": "Sao chép mảng (Array)",
        "command.modify.trim": "Cắt xén (Trim)",
        "command.modify.extend": "Kéo dài (Extend)",
        "command.modify.break": "Ngắt đoạn (Break)",
        "command.modify.fillet": "Bo góc (Fillet)",
        "command.modify.chamfer": "Vát mép (Chamfer)",
        "command.modify.explode": "Phân rã (Explode)",
        "command.modify.deleteNode": "Xóa đối tượng (Erase)",

        // Commands - Annotate & Dimension
        "command.annotate.dimension": "Kích thước thẳng (DimLinear)",
        "command.annotate.radialDimension": "Kích thước bán kính (DimRadius)",
        "command.annotate.angleDimension": "Kích thước góc (DimAngular)",
        "command.annotate.text": "Ghi chữ (Text)",

        // Object Snap (OsSnap)
        "statusBar.snap": "Bắt điểm (OSNAP)",
        "statusBar.tracking": "Dóng trục (OTRACK)",
        "snap.end": "Điểm cuối (Endpoint)",
        "snap.mid": "Trung điểm (Midpoint)",
        "snap.center": "Tâm (Center)",
        "snap.perpendicular": "Vuông góc (Perpendicular)",
        "snap.intersection": "Giao điểm (Intersection)",
        "snap.tangent": "Tiếp tuyến (Tangent)",
        "snap.nearCurve": "Trên cạnh (Nearest)",
        "snap.onSurface": "Trên bề mặt",

        // Prompts
        "prompt.default{0}{1}": "Di chuyển vùng nhìn: {0} | Xoay vùng nhìn: {1} | Phóng to/Thu nhỏ: Cuộn chuột",
        "prompt.pickFistPoint": "Chọn điểm đầu tiên:",
        "prompt.pickNextPoint": "Chọn điểm tiếp theo:",
        "prompt.pickCircleCenter": "Chọn tâm đường tròn:",
        "prompt.pickRadius": "Nhập bán kính hoặc chọn điểm trên đường tròn:",
        "prompt.pickDimensionPosition": "Chọn vị trí đặt đường ghi kích thước:",
    },
};

export default vi;
```

> **Mẹo triển khai:** Việc rải `...en.translation` ở đầu giúp đảm bảo TypeScript luôn thỏa mãn kiểu `Record<I18nKeys, string>` ngay cả khi dự án có thêm khóa mới, sau đó dịch toàn bộ các khóa trong file `vi.ts`.

### Bước 3.2: Đăng ký ngôn ngữ Tiếng Việt vào `@chili3d/i18n` và `@chili3d/core`

1. Mở file `packages/i18n/src/index.ts` và export thêm `vi`:
   ```ts
   // File: packages/i18n/src/index.ts
   import en from "./en";
   import ptBr from "./pt-br";
   import ru from "./ru";
   import vi from "./vi";
   import zhCn from "./zh-cn";

   export { vi, en, ptBr, ru, zhCn };
   ```
   Nhờ cơ chế `for (const key of Object.keys(i18n)) { I18n.addLanguage(...); }` trong `packages/builder/src/appBuilder.ts` (dòng 60-62), `LanguageSelector` tại `packages/ui/src/home/languageSelector.ts` sẽ tự động hiển thị tùy chọn `"Tiếng Việt"` ở vị trí đầu tiên.

2. Mở file `packages/core/src/i18n/i18n.ts` và cập nhật hàm `defaultLanguage()` (dòng 41-49) để hỗ trợ mã vùng trình duyệt `vi-VN` (so khớp tiền tố `vi`) và đặt `"vi"` làm ngôn ngữ mặc định:
   ```ts
   // File: packages/core/src/i18n/i18n.ts
   static defaultLanguage(): string {
       const browserLang = navigator.language.toLowerCase();
       const exactMatch = languages.keys().find((key) => key.toLowerCase() === browserLang);
       if (exactMatch) return exactMatch;

       const prefix = browserLang.split("-")[0];
       const prefixMatch = languages.keys().find((key) => key.toLowerCase() === prefix);
       if (prefixMatch) return prefixMatch;

       return languages.has("vi") ? "vi" : "en";
   }
   ```

### Bước 3.3: Tùy biến thương hiệu tại `public/index.html` và `packages/ui/src/home/home.ts`

1. Cập nhật `public/index.html` (xóa script theo dõi Clarity ở dòng 12-18, đổi `<html lang="vi">` và `<title>`):
   ```html
   <!DOCTYPE html>
   <html lang="vi">
       <head>
           <meta charset="utf-8" />
           <meta name="viewport" content="width=device-width, initial-scale=1" />
           <meta name="description" content="Hệ thống thiết kế kỹ thuật CAD 2D/3D trực tuyến trên trình duyệt" />
           <meta name="keywords" content="Web CAD, AutoCAD 2D, 3D CAD, DXF, Dunvex CAD" />
           <meta name="author" content="Dunvex" />
           <title>Dunvex CAD - Hệ thống thiết kế 2D/3D</title>
           <link rel="icon" href="favicon.svg">
           <link rel="stylesheet" type="text/css" href="index.css" />
       </head>
       <body>
           <noscript>Vui lòng bật JavaScript để sử dụng phần mềm CAD.</noscript>
       </body>
   </html>
   ```

2. Cập nhật `logoSection()` và `links()` trong `packages/ui/src/home/home.ts`:
   ```ts
   // File: packages/ui/src/home/home.ts (dòng 112-122)
   private logoSection() {
       return div(
           { className: style.logo },
           svg({ icon: "icon-chili" }),
           div(
               { className: style.logoText },
               span({ className: style.wordmark, textContent: "DUNVEX CAD" }),
               span({ className: style.version, textContent: `v${__APP_VERSION__}` }),
           ),
       );
   }
   ```
   Tại phương thức `links()` (dòng 193-219), ẩn hoặc thay thế nút `wechat.group` bằng liên kết tài liệu hướng dẫn nội bộ của doanh nghiệp.

### Bước 3.4: Tối ưu Font chữ Tiếng Việt và Bảng màu CAD chuyên nghiệp

1. Trong `public/index.css`, cập nhật chuỗi font hỗ trợ hiển thị rõ nét dấu Tiếng Việt trên cả Windows, macOS và Linux:
   ```css
   /* File: public/index.css */
   html,
   body {
       margin: 0px;
       padding: 0px;
       overflow: hidden;
       width: 100%;
       height: 100%;
       font-size: 14px;
       font-family: "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
       touch-action: none;
       color: var(--foreground-color);
       background-color: var(--background-color);
   }
   ```
2. Trong `packages/ui/src/mainWindow.module.css` (dòng 70-150), có thể tùy chỉnh biến `--primary-color` và `--viewport-background-color` (ví dụ chuyển màu nền Viewport ở chế độ Dark sang `#1a1d24` chuẩn AutoCAD tối thay vì `#242424` mặc định).

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] Chạy `npm run check` và `npm run test` để đảm bảo gói `@chili3d/i18n` không bị thiếu bất kỳ khóa nào trong `I18N_KEYS`.
- [x] Xóa `localStorage` của trình duyệt, tải lại trang: ứng dụng tự động hiển thị bằng **Tiếng Việt** (`Config.instance.language === "vi"`).
- [x] Tại màn hình `Home`, kiểm tra hộp chọn **Ngôn ngữ (`LanguageSelector`)**: chuyển đổi qua lại giữa `Tiếng Việt` và `English`, toàn bộ nhãn trên màn hình `Home`, thanh `Ribbon`, `ProjectView`, `PropertyView` và `Statusbar` cập nhật tức thì mà không cần tải lại trang.
- [x] Kiểm tra tab trình duyệt hiển thị đúng tiêu đề mới và không còn request nào gọi tới `https://www.clarity.ms`.
