# TASK-03: Tùy biến hệ thống Phím tắt (Hotkeys) và Thanh nhập lệnh (Command Bar) chuẩn AutoCAD

- **ID:** `TASK-03`
- **Tiêu đề:** Tùy biến hệ thống Phím tắt (Hotkeys) và Thanh nhập lệnh (Command Bar) chuẩn AutoCAD
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Cao (P1)
- **Độ khó:** Khá (Medium-Hard)

---

## 1. Mục tiêu (Objective)

Người dùng kỹ thuật quen thuộc với **AutoCAD** có thói quen gõ lệnh tắt trên bàn phím (Alias như `L`, `PL`, `REC`, `C`, `A`, `TR`, `EX`, `O`, `M`, `CO`, `RO`, `MI`, `F`, `CHA`, `X`, `E`, `DIM`, `DLI`, `DRA`, `DAN`) rồi nhấn `Enter` hoặc `Space` để kích hoạt lệnh, thay vì tìm biểu tượng trên thanh Ribbon.

Mục tiêu của Task này là:
1. Bổ sung hồ sơ điều hướng và phím tắt **`AutoCAD`** vào `Navigation3DTypes` (`packages/core/src/navigation.ts`) và `ShortcutProfiles` (`packages/core/src/command/shortcutProfiles.ts`).
2. Xây dựng **Thanh nhập lệnh chuẩn AutoCAD (`CommandBar`)** tích hợp vào phía dưới vùng nhìn (`Editor` / `Statusbar`) có khả năng:
   - Tự động hiển thị danh sách gợi ý lệnh (Auto-complete) khi người dùng gõ các ký tự lệnh tắt (ví dụ gõ `L` gợi ý `L (LINE) - Đoạn thẳng`, `PL (POLYLINE) - Đa giác`).
   - Nhấn `Enter` hoặc `Space` để thực thi lệnh thông qua `PubSub.default.pub("executeCommand", commandKey)`.
   - Nhấn `Enter` hoặc `Space` khi ô lệnh trống để gọi lại lệnh vừa dùng (`"special.last"`).
   - Hiển thị dòng nhắc lệnh (Command Prompt) đồng bộ với sự kiện `"statusBarTip"` của `PubSub`.

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `packages/core/src/navigation.ts` | Chỉnh sửa | Định nghĩa danh sách `Navigation3DTypes` và ánh xạ nút chuột `navigationKeyMap()` (Pan bằng chuột giữa `Middle`, Rotate bằng `Shift+Middle`). |
| `packages/core/src/command/shortcutProfiles.ts` | Chỉnh sửa | Định nghĩa bảng phím tắt cho từng hồ sơ (`Chili3d`, `Revit`, `Blender`, `Creo`, `Solidworks`) và thêm `AutoCADShortcuts`. |
| `packages/app/src/services/hotkeyService.ts` | Chỉnh sửa | Dịch vụ lắng nghe sự kiện bàn phím (`keydown`), ghép chuỗi phím (`this.keys`) và phát sự kiện `"executeCommand"`. |
| `packages/ui/src/statusbar/commandBar.ts` | Tạo mới | Web Component `<chili-command-bar>` cung cấp ô nhập lệnh AutoCAD kèm popup gợi ý (Auto-complete) và lịch sử lệnh. |
| `packages/ui/src/statusbar/commandBar.module.css` | Tạo mới | Định kiểu giao diện cho Thanh nhập lệnh kiểu AutoCAD. |
| `packages/ui/src/statusbar/statusbar.ts` | Chỉnh sửa | Nhúng `CommandBar` vào thanh trạng thái hoặc đồng bộ hiển thị lời nhắc lệnh (`statusBarTip`). |
| `packages/core/test/navigation.test.ts` | Chỉnh sửa | Cập nhật unit test kiểm tra `Navigation3DTypes` (6 phần tử, bao gồm `"AutoCAD"`) và `Navigation3D.navigationKeyMap()` cho `"AutoCAD"`. |
| `packages/ui/test/statusbar.test.ts` | Chỉnh sửa | Bổ sung mock cho `CommandBar` tương tự `SnapConfig` và `ErrorStatus` để đảm bảo bộ unit test `Statusbar` chạy độc lập. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Thêm cấu hình điều hướng `"AutoCAD"` vào `packages/core/src/navigation.ts`

Mở `packages/core/src/navigation.ts` và thêm `"AutoCAD"` vào mảng `Navigation3DTypes` (dòng 6) cũng như `navigationKeyMap` (dòng 30-57):

```ts
// File: packages/core/src/navigation.ts
export const Navigation3DTypes = ["Chili3d", "AutoCAD", "Revit", "Blender", "Creo", "Solidworks"] as const;

export type Navigation3DType = (typeof Navigation3DTypes)[number];

export class Navigation3D {
    // ... giữ nguyên getKey(event: MouseEvent) ...

    static navigationKeyMap(profile: Navigation3DType = Config.instance.navigation3D): {
        pan: string;
        rotate: string;
    } {
        const functionKey = {
            ["Chili3d"]: {
                pan: "Middle",
                rotate: "Shift+Middle",
            },
            ["AutoCAD"]: {
                pan: "Middle",
                rotate: "Shift+Middle",
            },
            ["Revit"]: {
                pan: "Middle",
                rotate: "Shift+Middle",
            },
            // ... giữ nguyên Blender, Creo, Solidworks ...
        } satisfies Record<Navigation3DType, { pan: string; rotate: string }>;
        return functionKey[profile];
    }
}
```

### Bước 3.2: Định nghĩa bảng lệnh tắt `AutoCADShortcuts` trong `packages/core/src/command/shortcutProfiles.ts`

Trong `HotkeyService` (`packages/app/src/services/hotkeyService.ts`, dòng 161-166), chuỗi nhiều phím liên tiếp được nối bằng dấu `+` (ví dụ gõ `T` rồi `R` sẽ tạo chuỗi `"t+r"`). Ta định nghĩa `AutoCADShortcuts` và bảng `AutoCADCommandAliases` (dùng cho cả phím tắt nhanh lẫn thanh Command Bar):

```ts
// File: packages/core/src/command/shortcutProfiles.ts
import type { Navigation3DType } from "../navigation";
import type { CommandKeys } from "./commandKeys";

export type ShortcutMap = Partial<Record<CommandKeys, string | string[]>>;

/**
 * Bảng ánh xạ Alias chuẩn AutoCAD sang CommandKeys thực tế của Chili3D.
 * Dùng cho Thanh nhập lệnh (Command Bar) khi người dùng gõ lệnh + Enter/Space.
 */
export const AutoCADCommandAliases: Record<string, CommandKeys> = {
    L: "create.line",
    LINE: "create.line",
    PL: "create.polygon",
    PLINE: "create.polygon",
    REC: "create.rect",
    RECTANG: "create.rect",
    C: "create.circle",
    CIRCLE: "create.circle",
    A: "create.arc3point",
    ARC: "create.arc",
    EL: "create.ellipse",
    ELLIPSE: "create.ellipse",
    POL: "create.regularPolygon",
    POLYGON: "create.regularPolygon",
    PO: "create.point",
    SPL: "create.bezier",
    O: "create.offset",
    OFFSET: "create.offset",
    EXT: "create.extrude",
    EXTRUDE: "create.extrude",
    REV: "create.revolve",
    REVOLVE: "create.revolve",
    SWEEP: "create.sweep",
    LOFT: "create.loft",
    M: "modify.move",
    MOVE: "modify.move",
    RO: "modify.rotate",
    ROTATE: "modify.rotate",
    MI: "modify.mirror",
    MIRROR: "modify.mirror",
    AR: "modify.array",
    ARRAY: "modify.array",
    TR: "modify.trim",
    TRIM: "modify.trim",
    EX: "modify.extend",
    EXTEND: "modify.extend",
    BR: "modify.break",
    BREAK: "modify.break",
    F: "modify.fillet",
    FILLET: "modify.fillet",
    CHA: "modify.chamfer",
    CHAMFER: "modify.chamfer",
    X: "modify.explode",
    EXPLODE: "modify.explode",
    E: "modify.deleteNode",
    ERASE: "modify.deleteNode",
    DIM: "annotate.dimension",
    DLI: "annotate.dimension",
    DRA: "annotate.radialDimension",
    DAN: "annotate.angleDimension",
    T: "annotate.text",
    MTEXT: "annotate.text",
    DI: "measure.length",
    DIST: "measure.length",
    LA: "create.folder",
    LAYER: "create.folder",
    U: "edit.undo",
    UNDO: "edit.undo",
    REDO: "edit.redo",
    QSAVE: "doc.save",
    OPEN: "doc.open",
    NEW: "doc.new",
    IMPORT: "file.import",
    EXPORT: "file.export",
};

export const AutoCADShortcuts: ShortcutMap = {
    ...Chili3dShortcuts,
    "create.line": "l",
    "create.polygon": "p+l",
    "create.rect": "r+e+c",
    "create.circle": "c",
    "create.arc3point": "a",
    "create.ellipse": "e+l",
    "create.offset": "o",
    "modify.move": "m",
    "modify.rotate": "r+o",
    "modify.mirror": "m+i",
    "modify.trim": "t+r",
    "modify.extend": "e+x",
    "modify.fillet": "f",
    "modify.chamfer": "c+h+a",
    "modify.explode": "x",
    "modify.deleteNode": ["Delete", "Backspace"],
    "annotate.dimension": "d+l+i",
    "annotate.radialDimension": "d+r+a",
    "annotate.angleDimension": "d+a+n",
};

export const ShortcutProfiles: Record<Navigation3DType, ShortcutMap> = {
    Chili3d: Chili3dShortcuts,
    AutoCAD: AutoCADShortcuts,
    Revit: RevitShortcuts,
    Blender: BlenderShortcuts,
    Creo: CreoShortcuts,
    Solidworks: SolidworksShortcuts,
};
```

*(Đừng quên export `AutoCADCommandAliases` tại `packages/core/src/command/index.ts` để package `@chili3d/ui` có thể import từ `@chili3d/core`)*.

### Bước 3.3: Tạo Component Thanh nhập lệnh `packages/ui/src/statusbar/commandBar.ts`

Tạo file `packages/ui/src/statusbar/commandBar.ts` cung cấp thanh nhập lệnh tương tác chuẩn AutoCAD:
- Khi người dùng nhấn phím dấu cách (`Space`) hoặc dấu hai chấm (`:`) hoặc nhấn chuột vào ô lệnh, con trỏ sẽ nhảy vào `CommandBar`.
- Khi gõ chữ (ví dụ `REC`, `DLI`, `TR`), danh sách gợi ý hiện lên ngay phía trên thanh trạng thái.
- Nhấn `Enter` hoặc `Space` sẽ thực thi lệnh đầu tiên khớp và xóa trắng ô nhập, trả focus về vùng vẽ 3D/2D.

```ts
// File: packages/ui/src/statusbar/commandBar.ts
// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AutoCADCommandAliases,
    type CommandKeys,
    I18n,
    type I18nKeys,
    PubSub,
} from "@chili3d/core";
import { div, input, span } from "@chili3d/element";
import style from "./commandBar.module.css";

interface SuggestionItem {
    alias: string;
    commandKey: CommandKeys;
    description: string;
}

export class CommandBar extends HTMLElement {
    private readonly _input: HTMLInputElement;
    private readonly _popup: HTMLDivElement;
    private _suggestions: SuggestionItem[] = [];
    private _selectedIndex = 0;

    constructor() {
        super();
        this.className = style.container;
        this._input = input({
            type: "text",
            className: style.input,
            placeholder: "Nhập lệnh AutoCAD (VD: L, REC, C, TR, DLI)...",
            oninput: () => this.handleInput(),
            onkeydown: (e: KeyboardEvent) => this.handleKeyDown(e),
            onblur: () => setTimeout(() => this.hidePopup(), 150),
        });
        this._popup = div({ className: style.popup });
        this.append(
            span({ className: style.prefix, textContent: "COMMAND:" }),
            this._input,
            this._popup,
        );
    }

    focusInput(initialChar?: string) {
        this._input.focus();
        if (initialChar) {
            this._input.value = initialChar.toUpperCase();
            this.handleInput();
        }
    }

    private handleInput() {
        const query = this._input.value.trim().toUpperCase();
        if (!query) {
            this.hidePopup();
            return;
        }

        this._suggestions = Object.entries(AutoCADCommandAliases)
            .filter(([alias]) => alias.startsWith(query))
            .slice(0, 8)
            .map(([alias, commandKey]) => ({
                alias,
                commandKey,
                description: I18n.translate(`command.${commandKey}` as I18nKeys),
            }));

        this._selectedIndex = 0;
        this.renderPopup();
    }

    private renderPopup() {
        this._popup.innerHTML = "";
        if (this._suggestions.length === 0) {
            this._popup.style.display = "none";
            return;
        }
        this._popup.style.display = "flex";
        this._suggestions.forEach((item, index) => {
            const row = div(
                {
                    className: `${style.item} ${index === this._selectedIndex ? style.active : ""}`,
                    onmousedown: (e: MouseEvent) => {
                        e.preventDefault();
                        this.executeAlias(item.commandKey);
                    },
                },
                span({ className: style.alias, textContent: item.alias }),
                span({ className: style.desc, textContent: item.description }),
            );
            this._popup.append(row);
        });
    }

    private handleKeyDown(e: KeyboardEvent) {
        e.stopPropagation();

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (this._suggestions.length > 0) {
                this._selectedIndex = (this._selectedIndex + 1) % this._suggestions.length;
                this.renderPopup();
            }
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (this._suggestions.length > 0) {
                this._selectedIndex =
                    (this._selectedIndex - 1 + this._suggestions.length) % this._suggestions.length;
                this.renderPopup();
            }
            return;
        }

        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const raw = this._input.value.trim().toUpperCase();
            if (!raw) {
                this.executeAlias("special.last");
                return;
            }
            const target =
                this._suggestions[this._selectedIndex]?.commandKey ?? AutoCADCommandAliases[raw];
            if (target) {
                this.executeAlias(target);
            }
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            this.clearAndBlur();
        }
    }

    private executeAlias(commandKey: CommandKeys) {
        this.clearAndBlur();
        PubSub.default.pub("executeCommand", commandKey);
    }

    private hidePopup() {
        this._popup.style.display = "none";
        this._suggestions = [];
    }

    private clearAndBlur() {
        this._input.value = "";
        this.hidePopup();
        this._input.blur();
    }
}

customElements.define("chili-command-bar", CommandBar);
```

### Bước 3.4: Tích hợp `CommandBar` vào `packages/ui/src/statusbar/statusbar.ts`

Mở `packages/ui/src/statusbar/statusbar.ts` và nhúng `new CommandBar()` vào phần `left` của `Statusbar` (dòng 49-51):

```ts
// File: packages/ui/src/statusbar/statusbar.ts
import { CommandBar } from "./commandBar";

export class Statusbar extends HTMLElement {
    // ...
    readonly commandBar = new CommandBar();

    private render() {
        this.append(
            div({ className: style.left }, this.commandBar, this.tip),
            this.right,
        );
    }
}
```

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] Mở phần cài đặt trên màn hình `Home`, mục **Kiểu điều hướng (`3DNavigation`)** xuất hiện tùy chọn `AutoCAD`.
- [x] Chọn chế độ `AutoCAD`, mở một bản vẽ mới và kiểm tra các phím tắt trực tiếp trên vùng vẽ:
  - Nhấn `L` kích hoạt lệnh vẽ Đoạn thẳng (`create.line`).
  - Nhấn `R` -> `E` -> `C` kích hoạt lệnh vẽ Hình chữ nhật (`create.rect`).
  - Nhấn `T` -> `R` kích hoạt lệnh Cắt xén (`modify.trim`).
  - Nhấn `D` -> `L` -> `I` kích hoạt lệnh Ghi kích thước thẳng (`annotate.dimension`).
- [x] Nhấp vào ô `COMMAND:` trên thanh trạng thái (`Statusbar`):
  - Gõ `D`, danh sách gợi ý bật lên hiển thị `DIM`, `DLI`, `DRA`, `DAN`, `DI`.
  - Dùng phím mũi tên lên/xuống để chọn `DLI` và nhấn `Space` hoặc `Enter`: lệnh ghi kích thước thẳng được kích hoạt ngay lập tức.
  - Khi đang nhập trong ô `COMMAND:`, các phím đơn lẻ không kích hoạt nhầm `HotkeyService` nhờ `canHandleKey()` kiểm tra `target.tagName === "INPUT"`.
