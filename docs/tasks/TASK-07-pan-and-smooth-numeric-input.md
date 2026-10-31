# TASK-07: Bổ sung lệnh `P` (`PAN`) kéo màn hình bằng chuột trái & Khắc phục lỗi khựng khi nhập số kích thước lúc vẽ

- **ID:** `TASK-07`
- **Tiêu đề:** Bổ sung lệnh `P` (`PAN`) kéo màn hình bằng chuột trái & Khắc phục lỗi khựng khi nhập số kích thước lúc vẽ
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Cao (P1 - Trải nghiệm người dùng cốt lõi)
- **Độ khó:** Trung bình (Medium)

---

## 1. Mục tiêu & Phân tích Nguyên nhân (Objectives & Root Cause Analysis)

Qua kiểm thử thực tế trên giao diện người dùng, có **3 vấn đề trải nghiệm cốt lõi** cần xử lý dứt điểm:

### Vấn đề 1: Thiếu lệnh `P` / `PAN` chuẩn AutoCAD (Kéo màn hình bằng chuột trái)
- **Hiện trạng:** Chili3D gốc chỉ cho phép kéo dịch chuyển vùng nhìn (`Pan`) bằng cách nhấn giữ **con lăn chuột giữa (`Middle Mouse`)**. Phím `P` đang bị gán cho `create.extrude`. Khi người dùng dùng Trackpad trên MacBook hoặc quen gõ lệnh `P` + `Enter` trong AutoCAD để giữ chuột trái kéo bản vẽ thì không thực hiện được.
- **Giải pháp:**
  - Tạo lệnh `view.pan` (`PanViewCommand`) kèm bộ xử lý sự kiện `PanEventHandler` thực thi `IEventHandler`.
  - Khi gõ `P` hoặc `PAN` (trên `CommandBar` hoặc phím tắt trực tiếp), con trỏ chuột đổi sang bàn tay (`grab` / `grabbing`), cho phép **nhấn giữ chuột trái kéo màn hình (`view.cameraController.pan(dx, dy)`)** mượt mà. Nhấn `ESC`, `Enter`, `Space` hoặc `Chuột phải` để thoát chế độ `Pan`.

### Vấn đề 2: Bấm checkbox `2D` dưới thanh trạng thái nhưng màn hình chưa tự xoay ngay
- **Hiện trạng:** Trong `packages/three/src/cameraController.ts`, hàm `setTopView2D()` gọi `this.lookAt(...)` (khởi tạo hiệu ứng chuyển cảnh `this._transition`), nhưng không gọi `this.view.update()` ở cuối hàm. Do đó nếu chuột đang đứng yên ở thanh trạng thái dưới đáy màn hình, vòng lặp render của `ThreeView` chưa được kích hoạt cho tới khi người dùng đưa chuột lên vùng vẽ.
- **Giải pháp:** Gọi `this.view.update()` ngay cuối hàm `setTopView2D()` trong `packages/three/src/cameraController.ts`.

### Vấn đề 3: Khi kéo vẽ và nhập số kích thước bị khựng, mất chữ số thứ 2 hoặc rung ô nhập
- **Nguyên nhân gốc rễ (Root Causes):**
  1. **Trễ `setTimeout` khi focus ô nhập số (`packages/ui/src/viewport/flyout/flyout.ts` dòng 74-79):**
     Khi người dùng đang kéo chuột và gõ nhanh một con số nhiều chữ số (ví dụ `500`), phím đầu tiên (`5`) kích hoạt `SnapEventHandler.handleNumericInput` -> phát sự kiện `showInput`. Tuy nhiên `Flyout.displayInput` lại đặt `this._input?.focus()` bên trong `setTimeout(..., 0)`. Nếu chữ số thứ hai (`0`) được gõ nhanh trước khi `setTimeout` chạy (hoặc khi chuột vừa nhích nhẹ), sự kiện `keydown('0')` vẫn rơi vào `window` -> `SnapEventHandler.handleNumericInput` gọi lại `showInput("0")` -> gọi `this.clearInput()` **xóa mất chữ số `5` vừa gõ**!
  2. **Vị trí con trỏ văn bản (`caret`) khi focus (`packages/ui/src/viewport/flyout/input.ts` dòng 61-63):**
     Khi `this.textbox.focus()` được gọi mà không đặt `this.textbox.setSelectionRange(len, len)` (trong trường hợp `options?.selectAll` không bật), một số trình duyệt đặt con trỏ ở đầu chuỗi hoặc bôi đen chữ số đầu, gây đè số khi gõ tiếp.
  3. **Ô nhập số (`Flyout`) bị giật vị trí khi chuột nhích nhẹ lúc đang gõ (`packages/ui/src/viewport/viewport.ts` dòng 354-359):**
     Mỗi khi tay người dùng cầm chuột rung nhẹ lúc đang gõ phím số, `Viewport.pointerMove` cập nhật liên tục `this._flyout.style.top/left` làm ô `<input>` đang gõ bị nhảy vị trí trên màn hình. Ngoài ra, trong AutoCAD người dùng thường gõ số xong nhấn **`Space` hoặc `Enter`** để xác nhận, nhưng `input.ts` hiện chỉ mới bắt phím `Enter`.

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `packages/ui/src/viewport/flyout/flyout.ts` | Chỉnh sửa | Bỏ `setTimeout` gây trễ khi focus `_input`, focus đồng bộ ngay khi gắn vào DOM và đặt con trỏ về cuối chuỗi; thêm getter `hasActiveInput`. |
| `packages/ui/src/viewport/flyout/input.ts` | Chỉnh sửa | Trong `focus()`: đặt `setSelectionRange(len, len)` để gõ nối tiếp mượt mà; trong `handleKeyDown`: hỗ trợ cả phím `Enter` và `Space` (`" "`) để xác nhận số đo chuẩn AutoCAD. |
| `packages/core/src/snap/handlers/snapEventHandler.ts` | Chỉnh sửa | Trong `handleNumericInput`: gọi `event.preventDefault()` trước khi `pub("showInput")` để khi `Flyout` focus đồng bộ không bị nhân đôi ký tự đầu tiên; trong `removeTempShapes`: bỏ lệnh `this.document.visual.update()` thừa khi đang trong luồng `pointerMove`. |
| `packages/parametric/src/commands/axisDragHandler.ts` | Chỉnh sửa | Thêm `event.preventDefault()` trong `handleNumericInput` (dòng 437) để đồng bộ hành vi focus tức thì với `Flyout`. |
| `packages/ui/src/viewport/viewport.ts` | Chỉnh sửa | Trong `pointerMove`: giữ cố định vị trí `this._flyout` khi người dùng đang gõ trong ô nhập số (`!this._flyout.hasActiveInput`), tránh làm ô nhập nhảy theo chuột. |
| `packages/three/src/cameraController.ts` | Chỉnh sửa | Gọi `this.view.update()` ở cuối `setTopView2D()` để màn hình xoay phẳng về 2D ngay lập tức khi tích chọn checkbox `2D`. |
| `packages/core/src/command/commandKeys.ts` | Chỉnh sửa | Thêm khóa lệnh `"view.pan"` vào danh sách `CommandKeys`. |
| `packages/core/src/command/shortcutProfiles.ts` | Chỉnh sửa | Thêm `P: "view.pan"`, `PAN: "view.pan"` vào `AutoCADCommandAliases` và `"view.pan": "p"`, `"create.extrude": "e+x+t"` vào `AutoCADShortcuts`. |
| `packages/i18n/src/en.ts` & `packages/i18n/src/vi.ts` | Chỉnh sửa | Bổ sung bản dịch cho khóa `"command.view.pan"` (`"Pan View"` / `"Di chuyển vùng nhìn (Pan)"`). |
| `packages/app/src/commands/application/panView.ts` | Tạo mới | Triển khai lệnh `PanViewCommand` (`view.pan`) và `PanEventHandler` cho phép giữ chuột trái kéo màn hình, nhấn `ESC` / `Enter` / `Space` / `Chuột phải` để thoát. |
| `packages/app/src/commands/application/index.ts` | Chỉnh sửa | Export `panView.ts`. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Khắc phục triệt để lỗi khựng khi nhập số kích thước (`flyout.ts`, `input.ts`, `snapEventHandler.ts`, `viewport.ts`)

1. **Trong `packages/ui/src/viewport/flyout/input.ts`:**
   - Cập nhật hàm `focus()` để đặt con trỏ ở cuối văn bản mặc định:
     ```ts
     override focus() {
         this.textbox.focus();
         const len = this.textbox.value.length;
         this.textbox.setSelectionRange?.(len, len);
     }
     ```
   - Trong `handleKeyDown`: cho phép nhấn `Enter` hoặc `Space` (`e.key === "Enter" || e.key === " "`) để xác nhận nhập số:
     ```ts
     private readonly handleKeyDown = (e: KeyboardEvent) => {
         e.stopPropagation();
         if (e.key === "Enter" || e.key === " ") {
             e.preventDefault();
             this.processEnterKey();
         } else if (e.key === "Escape") {
             e.preventDefault();
             this._cancelledCallbacks.forEach((callback) => callback());
         } else {
             this.removeTip();
         }
     };
     ```

2. **Trong `packages/ui/src/viewport/flyout/flyout.ts`:**
   - Thêm getter `get hasActiveInput(): boolean { return this._input !== undefined; }`.
   - Trong `displayInput`: focus **đồng bộ ngay lập tức** sau `this.append(this._input)` (không bọc trong `setTimeout` để không làm rơi phím thứ 2 khi gõ nhanh), đồng thời vẫn giữ `if (options?.takeFocus === false) return;`:
     ```ts
     this.append(this._input);
     if (options?.takeFocus !== false) {
         this._input.focus();
         if (options?.selectAll) this._input.selectAll();
     }
     ```
   - *(Lưu ý: Kiểm tra và cập nhật `packages/ui/test/flyout.test.ts` nếu có bài test nào dùng `setTimeout` chờ focus).*

3. **Trong `packages/core/src/snap/handlers/snapEventHandler.ts` (và `packages/parametric/src/commands/axisDragHandler.ts`):**
   - Trong `handleNumericInput(view: IView, event: KeyboardEvent)`:
     ```ts
     private handleNumericInput(view: IView, event: KeyboardEvent) {
         if (!["#", "-", ".", ",", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(event.key)) return;

         event.preventDefault();
         this._state = "inputing";
         PubSub.default.pub("showInput", event.key, (text: string) => {
             const error = this.inputError(text);
             if (error) return Result.err(error);

             this._snaped = { ...this.getPointFromInput(view, text), input: parseDimensionInput(text) };
             this.handleSuccess();
             return Result.ok(text);
         });
     }
     ```
   - Trong `packages/parametric/src/commands/axisDragHandler.ts` (dòng 436): thêm `event.preventDefault();` ngay trước `PubSub.default.pub("showInput", event.key, ...)`.

4. **Trong `packages/ui/src/viewport/viewport.ts`:**
   - Trong `pointerMove` (dòng 354): chỉ di chuyển vị trí `_flyout` theo con trỏ chuột khi ô nhập số chưa mở (hoặc chưa được người dùng gõ vào):
     ```ts
     private readonly pointerMove = (event: PointerEvent) => {
         if (this._flyout && !this._flyout.hasActiveInput) {
             this._flyout.style.top = `${event.offsetY}px`;
             this._flyout.style.left = `${event.offsetX}px`;
         }

         this.handleEvent("pointerMove", event);
     };
     ```

### Bước 3.2: Tự động cập nhật khung nhìn ngay khi tích chọn `2D` (`packages/three/src/cameraController.ts`)

Trong `packages/three/src/cameraController.ts` (hàm `setTopView2D` dòng 226-236):
```ts
    setTopView2D(fit: boolean = true): void {
        this.cameraType = "orthographic";
        const target = this.cameraTarget;
        const distance = Math.max(this._position.distanceTo(this._target), 1000);
        const eye = new XYZ(target.x, target.y, target.z + distance);
        const up = new XYZ(0, 1, 0);
        this.lookAt(eye, target, up, { duration: CAMERA_FLY_DURATION });
        if (fit) {
            this.fitContent({ duration: CAMERA_FLY_DURATION });
        }
        this.view.update();
    }
```

### Bước 3.3: Bổ sung lệnh `P` / `PAN` (`view.pan`) chuẩn AutoCAD

1. Thêm `"view.pan"` vào `packages/core/src/command/commandKeys.ts`.
2. Thêm bản dịch `"view.pan": "Pan View"` trong `packages/i18n/src/en.ts` và `"view.pan": "Di chuyển vùng nhìn (Pan)"` trong `packages/i18n/src/vi.ts`.
3. Trong `packages/core/src/command/shortcutProfiles.ts`:
   - Thêm vào `AutoCADCommandAliases`:
     ```ts
     P: "view.pan",
     PAN: "view.pan",
     ```
   - Thêm vào `AutoCADShortcuts`:
     ```ts
     "view.pan": "p",
     "create.extrude": "e+x+t",
     ```
4. Tạo file `packages/app/src/commands/application/panView.ts` (và export trong `packages/app/src/commands/application/index.ts`):
   ```ts
   // Part of the Chili3d Project, under the AGPL-3.0 License.
   // See LICENSE file in the project root for full license information.

   import {
       AsyncController,
       CancelableCommand,
       command,
       CursorType,
       type IEventHandler,
       type IView,
       PubSub,
   } from "@chili3d/core";

   class PanEventHandler implements IEventHandler {
       isEnabled = true;
       private _isDragging = false;
       private _lastPos?: { x: number; y: number };

       constructor(
           private readonly view: IView,
           private readonly controller: AsyncController,
       ) {
           this.view.setCursor(CursorType.Grab);
           PubSub.default.pub("statusBarTip", "prompt.pan" as any);
       }

       dispose(): void {
           this.view.setCursor(CursorType.Default);
           PubSub.default.pub("clearStatusBarTip");
       }

       pointerDown(view: IView, event: PointerEvent): void {
           if (event.button === 0) {
               this._isDragging = true;
               this._lastPos = { x: event.offsetX, y: event.offsetY };
           } else if (event.button === 2) {
               this.controller.cancel();
           }
       }

       pointerMove(view: IView, event: PointerEvent): void {
           if (!this._isDragging || !this._lastPos) return;
           const dx = event.offsetX - this._lastPos.x;
           const dy = event.offsetY - this._lastPos.y;
           this._lastPos = { x: event.offsetX, y: event.offsetY };
           view.cameraController.pan(dx, dy);
           view.update();
       }

       pointerUp(_view: IView, event: PointerEvent): void {
           if (event.button === 0) {
               this._isDragging = false;
               this._lastPos = undefined;
           }
       }

       pointerOut(_view: IView, _event: PointerEvent): void {
           this._isDragging = false;
           this._lastPos = undefined;
       }

       mouseWheel(view: IView, _event: WheelEvent): void {
           view.update();
       }

       keyDown(_view: IView, event: KeyboardEvent): void {
           if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
               event.preventDefault();
               event.stopImmediatePropagation();
               this.controller.cancel();
           }
       }
   }

   @command({
       key: "view.pan",
       icon: "icon-move",
   })
   export class PanView extends CancelableCommand {
       protected override async executeTask(): Promise<void> {
           const view = this.application.activeView;
           if (!view) return;

           const visual = view.document.visual;
           const previousHandler = visual.eventHandler;
           const panHandler = new PanEventHandler(view, this.asyncController!);
           visual.eventHandler = panHandler;

           await new Promise<void>((resolve) => {
               this.asyncController!.onCancelled(() => resolve());
               this.asyncController!.onCompleted(() => resolve());
           });

           if (visual.eventHandler === panHandler) {
               visual.eventHandler = previousHandler;
           }
           panHandler.dispose();
       }
   }
   ```
   *(Lưu ý: Kiểm tra `CursorType` trong `@chili3d/core` để dùng giá trị enum có sẵn hoặc fallback hợp lệ).*

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] **Lệnh `P` / `PAN`:** Gõ `P` + `Enter` (hoặc nhấn phím `P` trên vùng vẽ): có thể nhấn giữ **chuột trái** và kéo để dịch chuyển toàn bộ màn hình bản vẽ mượt mà; nhấn `ESC`, `Enter`, `Space` hoặc `Chuột phải` để thoát lệnh `PAN`.
- [x] **Nhập số kích thước mượt mà không bị khựng:** Gõ `L` + `Enter`, click điểm đầu, kéo chuột theo hướng bất kỳ và gõ nhanh liên tiếp `500` hoặc `1250.5` rồi nhấn `Enter` (hoặc `Space`):
  - Không bị mất chữ số thứ 2 khi gõ nhanh.
  - Ô nhập số đứng yên, không bị rung giật theo tay cầm chuột.
  - Nhấn `Space` hoặc `Enter` đều chốt đoạn thẳng đúng chiều dài đã nhập.
- [x] **Nút `2D` xoay màn hình tức thì:** Click vào ô checkbox `2D` dưới thanh trạng thái, khung nhìn lập tức xoay phẳng về mặt chiếu bằng `X-Y` ngay mà không cần phải di chuột vào vùng vẽ.
- [x] **Deploy cập nhật lên VPS:** Toàn bộ unit test PASS 100%, đóng gói `dist/` mới và chạy `FORCE_BUILD=1 bash scripts/deploy-vps.sh` cập nhật thành công lên `http://136.66.95.155`.
