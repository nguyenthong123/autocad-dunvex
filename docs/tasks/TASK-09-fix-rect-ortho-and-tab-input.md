# TASK-09: Khắc phục lỗi công cụ Hình chữ nhật (`Rect` / `Box`) khi bật chế độ 2D + `ORTHO (F8)` và Hỗ trợ phím `Tab` nhập kích thước 2 chiều $[dx, dy]$

- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** `HIGH (Critical 2D/3D Floor & Wall Drafting Bug)`
- **Phụ thuộc:** `TASK-04`, `TASK-07`

---

## 1. Bối cảnh & Chẩn đoán kỹ thuật (Root Cause Analysis)

Qua kiểm tra trực tiếp mã nguồn, lỗi người dùng gặp phải khi bật đồng thời chế độ **`2D`** và **`ORTHO (F8)`** rồi dùng lệnh **Hình chữ nhật (`create.rect` - phím `R`)** hoàn toàn có thật và xuất phát từ **3 nguyên nhân kỹ thuật trực tiếp trong codebase**:

### Nguyên nhân 1: Xung đột giữa khóa trục `orthoMode` trong `PlaneSnapBase` và bộ kiểm tra `handleValid` của `RectCommandBase`
1. Tại [`packages/core/src/snap/snaps/planeSnap.ts`](../../packages/core/src/snap/snaps/planeSnap.ts) (dòng 22-31):
   ```ts
   if (Config.instance.orthoMode && this.refPoint) {
       const ref = this.refPoint();
       const delta = point.sub(ref);
       const dx = delta.dot(plane.xvec);
       const dy = delta.dot(plane.yvec);
       point =
           Math.abs(dx) >= Math.abs(dy)
               ? ref.add(plane.xvec.multiply(dx))
               : ref.add(plane.yvec.multiply(dy));
   }
   ```
2. Khi chạy lệnh `Rect` ([`packages/app/src/commands/create/rect.ts`](../../packages/app/src/commands/create/rect.ts) dòng 40), bước chọn góc đối diện dùng `LengthAtPlaneStep` $\rightarrow$ `SnapLengthAtPlaneHandler` $\rightarrow$ khởi tạo `new PlaneSnap(lengthData.plane, lengthData.point)`.
3. Vì `lengthData.point` được truyền vào làm `refPoint`, khi `Config.instance.orthoMode === true` (`F8` bật), `PlaneSnapBase.snapAtPlane` ép điểm góc thứ 2 phải nằm thẳng hàng trên trục X (`dy = 0`) hoặc trục Y (`dx = 0`)!
4. Ngay sau đó, hàm `RectCommandBase.handleValid` (`rect.ts` dòng 58-61):
   ```ts
   private readonly handleValid = (end: XYZ) => {
       const data = this.rectDataFromTemp(end);
       return data !== undefined && !MathUtils.anyEqualZero(data.dx, data.dy);
   };
   ```
   kiểm tra thấy `dx === 0` hoặc `dy === 0` nên trả về `false`!
5. Hệ quả:
   - `SnapEventHandler.validateSnapPoint` ([`packages/core/src/snap/handlers/snapEventHandler.ts`](../../packages/core/src/snap/handlers/snapEventHandler.ts) dòng 151) trả về `false`, khiến `this._snaped` luôn bị `undefined`.
   - Không có `this._snaped?.point` nên `previewRect` không vẽ được khung hình chữ nhật preview.
   - Khi click chuột lần 2 để chốt góc, `pointerDown` thấy `this._snaped === undefined` nên từ chối nhận điểm.

### Nguyên nhân 2: Crash Runtime (`[Lỗi: 13]`) trong `SnapLengthAtPlaneHandler` và `RectNode` khi nhập số lúc `this._snaped` bị `undefined` hoặc suy biến 1 trục
1. Tại [`packages/core/src/snap/handlers/lengthSnapEventHandler.ts`](../../packages/core/src/snap/handlers/lengthSnapEventHandler.ts) (dòng 93-95):
   ```ts
   private calculatePointFromDistance(distance: number): XYZ {
       const vector = this._snaped?.point!.sub(this.data.point()).normalize();
       return this.data.point().add(vector!.multiply(distance));
   }
   ```
   - Khi `ORTHO (F8)` đang bật khiến `this._snaped` là `undefined`, người dùng gõ số (ví dụ `1500`) rồi bấm `Enter`: `this._snaped?.point` là `undefined` $\rightarrow$ `vector` là `undefined` $\rightarrow$ `vector!.multiply(distance)` ném ngoại lệ `TypeError`!
   - Hoặc khi con trỏ chuột vô tình bắt vào trục Tracking X/Y (`dy = 0` hoặc `dx = 0`), việc nhập 1 số `1500` tạo ra điểm có `dy = 0` hoặc `dx = 0`. Hàm `handleNumericInput` (`snapEventHandler.ts` dòng 339-340) không chạy qua `validator` mà gọi thẳng `handleSuccess()`, đẩy `dx = 0` hoặc `dy = 0` xuống [`RectNode.generateShape()`](../../packages/app/src/bodys/rect.ts) (dòng 63-68), làm nhân OpenCascade WASM (`shapeFactory.polygon` / `toFace()`) báo lỗi và làm tăng bộ đếm `[Lỗi: 13]` trên thanh trạng thái góc phải!

### Nguyên nhân 3: Ô nhập kích thước động (`Input`) chưa hỗ trợ phím `Tab` để chuyển giữa Chiều rộng ($dx$) và Chiều dài ($dy$)
- Tại [`packages/ui/src/viewport/flyout/input.ts`](../../packages/ui/src/viewport/flyout/input.ts) (dòng 95-106), sự kiện `handleKeyDown` chỉ xử lý `Enter`, `Space`, `Escape` mà chưa bắt phím `Tab`.
- Khi người dùng vẽ hình chữ nhật theo chuẩn AutoCAD: gõ số thứ nhất (`1500`) $\rightarrow$ bấm `Tab` $\rightarrow$ gõ số thứ hai (`2000`) $\rightarrow$ bấm `Enter`, phím `Tab` không chèn dấu phân cách `,` mà lại làm mất focus của ô input.

---

## 2. Danh sách các File mục tiêu cần can thiệp (Target Files)

| STT | Đường dẫn File | Hành động | Mô tả phạm vi thay đổi |
| :-: | :--- | :---: | :--- |
| 1 | `packages/core/src/snap/snaps/planeSnap.ts` | **Modify** | Bổ sung cờ `allowOrtho: boolean = true` cho `PlaneSnapBase`, `WorkplaneSnap`, `PlaneSnap`. Chỉ áp dụng khóa trục `Config.instance.orthoMode` khi `this.allowOrtho === true`. |
| 2 | `packages/core/src/snap/handlers/lengthSnapEventHandler.ts` | **Modify** | 1) Thêm tùy chọn `disableOrtho?: boolean` vào `SnapLengthAtPlaneData` và truyền `!lengthData.disableOrtho` xuống `PlaneSnap`; khi `disableOrtho === true`, tắt luôn `AxisTracking` 0°/90° trong `TrackingSnap` (hoặc lọc bỏ điểm snap có $dx=0$ / $dy=0$) để con trỏ luôn di chuyển tự do trên 2 trục X-Y.<br>2) Sửa `calculatePointFromDistance` và `inputError`: Không bao giờ crash khi `this._snaped?.point` là `undefined`; nếu đang ở chế độ `disableOrtho` (như `Rect` / `Box`) mà người dùng chỉ nhập 1 số dương `d` (hoặc vector hiện tại bị suy biến 1 trục), tự động hiểu là hình vuông $(dx = \pm d, dy = \pm d)$ hoặc kiểm tra `this.data.validator` trước khi chấp nhận input. |
| 3 | `packages/core/src/snap/handlers/snapEventHandler.ts` | **Modify** | Trong `handleNumericInput` (dòng 332-342), sau khi tính `pointResult = this.getPointFromInput(view, text)`, kiểm tra nếu `this.data.validator && !this.data.validator(pointResult.point!)` thì trả về `Result.err("error.input.invalidNumber")` thay vì gọi `handleSuccess()` với điểm suy biến. |
| 4 | `packages/app/src/commands/create/rect.ts` | **Modify** | Trong `RectCommandBase.nextSnapData()`, bật `disableOrtho: true` để hình chữ nhật (`Rect`) và khối hộp (`Box`) luôn bỏ qua phép khóa 1 trục của `ORTHO (F8)`. Đồng thời kiểm tra an toàn trong `previewRect` không gọi `meshCreatedShape("rect", ...)` nếu `MathUtils.anyEqualZero(dx, dy)`. |
| 5 | `packages/app/src/bodys/rect.ts` | **Modify** | Trong `RectNode.generateShape()`, bổ sung kiểm tra đầu vào: nếu `MathUtils.anyEqualZero(this.dx, this.dy)` thì trả về `Result.err("Invalid rectangle dimensions: dx and dy must be non-zero")` sớm trước khi gọi `shapeFactory.polygon(points)`. |
| 6 | `packages/ui/src/viewport/flyout/input.ts` | **Modify** | Trong `handleKeyDown`, bắt sự kiện `e.key === "Tab"`: gọi `e.preventDefault()`, nếu chuỗi hiện tại trong `textbox` chưa có dấu `,` thì nối thêm `","` vào cuối và giữ nguyên focus tại cuối ô input để người dùng gõ tiếp kích thước thứ 2 rồi nhấn `Enter`. Nếu đã có dấu `,` (ví dụ `"1500, 2000"`), bấm `Tab` sẽ chọn (highlight) phần số trước/sau dấu phẩy để sửa nhanh như AutoCAD. |

---

## 3. Hướng dẫn triển khai chi tiết từng bước (Step-by-Step Implementation Guide)

### Bước 3.1: Bỏ qua khóa 1 trục `orthoMode` cho `PlaneSnap` khi vẽ Hình chữ nhật (`Rect` / `Box`)

1. Mở [`packages/core/src/snap/snaps/planeSnap.ts`](../../packages/core/src/snap/snaps/planeSnap.ts):
   - Cập nhật constructor của `PlaneSnapBase`, `WorkplaneSnap`, `PlaneSnap` để nhận thêm tham số `readonly allowOrtho: boolean = true`:
     ```ts
     export abstract class PlaneSnapBase implements ISnap {
         removeDynamicObject(): void {}
         clear(): void {}
         abstract snap(data: MouseAndDetected): SnapResult | undefined;

         constructor(
             readonly refPoint?: () => XYZ,
             readonly allowOrtho: boolean = true,
         ) {}

         protected snapAtPlane(plane: Plane, data: MouseAndDetected): SnapResult | undefined {
             plane = ViewUtils.ensurePlane(data.view, plane);
             const ray = data.view.rayAt(data.mx, data.my);
             let point = plane.intersectRay(ray);
             if (!point) return undefined;

             if (this.allowOrtho && Config.instance.orthoMode && this.refPoint) {
                 const ref = this.refPoint();
                 const delta = point.sub(ref);
                 const dx = delta.dot(plane.xvec);
                 const dy = delta.dot(plane.yvec);
                 point =
                     Math.abs(dx) >= Math.abs(dy)
                         ? ref.add(plane.xvec.multiply(dx))
                         : ref.add(plane.yvec.multiply(dy));
             }
             // ...
     ```
   - Trong `PlaneSnap`:
     ```ts
     export class PlaneSnap extends PlaneSnapBase {
         constructor(
             readonly plane: (point: XYZ) => Plane,
             refPoint?: () => XYZ,
             allowOrtho: boolean = true,
         ) {
             super(refPoint, allowOrtho);
         }
         // ...
     ```

2. Mở [`packages/core/src/snap/handlers/lengthSnapEventHandler.ts`](../../packages/core/src/snap/handlers/lengthSnapEventHandler.ts):
   - Thêm `disableOrtho?: boolean` vào `SnapLengthAtPlaneData`:
     ```ts
     export interface SnapLengthAtPlaneData extends SnapData {
         point: () => XYZ;
         plane: (point: XYZ | undefined) => Plane;
         disableOrtho?: boolean;
     }
     ```
   - Trong constructor của `SnapLengthAtPlaneHandler`:
     ```ts
     const objectSnap = new ObjectSnap(Config.instance.snapType, lengthData.point);
     const trackingSnap = new TrackingSnap(
         lengthData.disableOrtho ? undefined : lengthData.point,
         false,
     );
     const planeSnap = new PlaneSnap(
         lengthData.plane,
         lengthData.point,
         !lengthData.disableOrtho,
     );
     super(document, controller, [objectSnap, trackingSnap, planeSnap], lengthData);
     ```
     *(Lưu ý: Khi `lengthData.disableOrtho === true`, việc truyền `undefined` cho `referencePoint` của `TrackingSnap` vẫn giữ nguyên Object Tracking bắt gióng vào các điểm khác, nhưng tắt việc bắt dính con trỏ vào đúng đường trục $X=0$ hoặc $Y=0$ của điểm gốc hình chữ nhật, giúp con trỏ chuột không bị rơi vào vùng chết $dx=0$ hoặc $dy=0$).*

### Bước 3.2: Xử lý an toàn khi nhập 1 số hoặc 2 số trong `SnapLengthAtPlaneHandler` và `SnapEventHandler`

1. Trong [`packages/core/src/snap/handlers/lengthSnapEventHandler.ts`](../../packages/core/src/snap/handlers/lengthSnapEventHandler.ts) (dòng 80-111):
   - Cập nhật `calculatePointFromDistance(distance: number, plane: Plane)`:
     ```ts
     private calculatePoint(text: string, plane: Plane): XYZ {
         const numbers = text.split(",").map((s) => Number(s.trim()));
         return numbers.length === 1
             ? this.calculatePointFromDistance(numbers[0], plane)
             : this.calculatePointFromCoordinates(numbers, plane);
     }

     private calculatePointFromDistance(distance: number, plane: Plane): XYZ {
         const refPoint = this.data.point();
         if (this.lengthData.disableOrtho) {
             // Đối với hình chữ nhật (disableOrtho = true), nếu người dùng chỉ nhập 1 số (ví dụ 1500) rồi Enter,
             // tạo hình vuông dx = distance, dy = distance theo hướng góc phần tư hiện tại của con trỏ chuột
             const dx = this.followSnapedSign(refPoint, plane.xvec, distance);
             const dy = this.followSnapedSign(refPoint, plane.yvec, distance);
             return refPoint.add(plane.xvec.multiply(dx)).add(plane.yvec.multiply(dy));
         }
         const rawVec = this._snaped?.point?.sub(refPoint);
         const vector = rawVec?.normalize() ?? plane.xvec;
         return refPoint.add(vector.multiply(distance));
     }
     ```
   - Cập nhật `inputError(text: string)`:
     ```ts
     protected inputError(text: string): I18nKeys | undefined {
         const parts = text
             .split(",")
             .map((s) => s.trim())
             .filter((s) => s.length > 0);
         if (parts.length !== 1 && parts.length !== 2) {
             return "error.input.invalidNumber";
         }
         const numbers = parts.map(Number);
         if (numbers.some((n) => Number.isNaN(n) || Math.abs(n) < Precision.Distance)) {
             return "error.input.invalidNumber";
         }
         return undefined;
     }
     ```
     *(Lưu ý: Dùng `.filter((s) => s.length > 0)` giúp trường hợp người dùng gõ `"1500,"` rồi lỡ bấm `Enter` luôn vẫn hiểu là 1 số `1500` thay vì parse `""` thành `0`!).*
   - Đồng thời trong `calculatePoint`: dùng `const numbers = text.split(",").map((s) => s.trim()).filter((s) => s.length > 0).map(Number);` để đồng bộ với `inputError`.

2. Trong [`packages/core/src/snap/handlers/snapEventHandler.ts`](../../packages/core/src/snap/handlers/snapEventHandler.ts) (dòng 332-342):
   - Kiểm tra `this.data.validator` sau khi tính điểm từ ô input:
     ```ts
     PubSub.default.pub("showInput", event.key, (text: string) => {
         const error = this.inputError(text);
         if (error) return Result.err(error);

         const pointFromInput = this.getPointFromInput(view, text);
         if (
             pointFromInput.point &&
             this.data.validator &&
             !this.data.validator(pointFromInput.point)
         ) {
             return Result.err("error.input.invalidNumber");
         }

         this._snaped = { ...pointFromInput, input: parseDimensionInput(text) };
         this.handleSuccess();
         return Result.ok(text);
     });
     ```

### Bước 3.3: Cập nhật `RectCommandBase` và `RectNode`

1. Mở [`packages/app/src/commands/create/rect.ts`](../../packages/app/src/commands/create/rect.ts):
   - Trong `nextSnapData` (dòng 44-56), thêm `disableOrtho: true`:
     ```ts
     private readonly nextSnapData = (): SnapLengthAtPlaneData => {
         const { point, view } = this.stepDatas[0];
         return {
             point: () => point!,
             preview: this.previewRect,
             plane: (tmp: XYZ | undefined) => this.findPlane(view, point!, tmp),
             validator: this.handleValid,
             disableOrtho: true,
             prompt: (snaped: SnapResult) => {
                 const data = this.rectDataFromTemp(snaped.point!);
                 return `${Math.abs(data.dx).toFixed(2)}, ${Math.abs(data.dy).toFixed(2)}`;
             },
         };
     };
     ```
   - Trong `previewRect` (dòng 63-72), thêm kiểm tra tránh tạo mesh suy biến khi `dx = 0` hoặc `dy = 0`:
     ```ts
     protected previewRect = (end: XYZ | undefined) => {
         if (end === undefined) return [this.meshPoint(this.stepDatas[0].point!)];
         const { plane, dx, dy } = this.rectDataFromTemp(end);
         if (MathUtils.anyEqualZero(dx, dy)) {
             return [this.meshPoint(this.stepDatas[0].point!), this.meshPoint(end)];
         }

         return [
             this.meshPoint(this.stepDatas[0].point!),
             this.meshPoint(end),
             this.meshCreatedShape("rect", plane, dx, dy),
         ];
     };
     ```

2. Mở [`packages/app/src/bodys/rect.ts`](../../packages/app/src/bodys/rect.ts):
   - Trong `generateShape()` (dòng 63-68), thêm guard kiểm tra `MathUtils.anyEqualZero(this.dx, this.dy)` trước khi gọi `shapeFactory.polygon(points)`:
     ```ts
     generateShape(): Result<IShape, string> {
         if (MathUtils.anyEqualZero(this.dx, this.dy)) {
             return Result.err("Rectangle dx and dy cannot be zero");
         }
         const points = RectNode.points(this.plane, this.dx, this.dy);
         const wire = shapeFactory.polygon(points);
         if (!wire.isOk || !this.isFace) return wire;
         return wire.value.toFace();
     }
     ```

### Bước 3.4: Hỗ trợ phím `Tab` chuyển đổi nhập 2 chiều $[dx, dy]$ trong `Input` (`packages/ui/src/viewport/flyout/input.ts`)

Mở [`packages/ui/src/viewport/flyout/input.ts`](../../packages/ui/src/viewport/flyout/input.ts):
- Trong `handleKeyDown` (dòng 95-106), bổ sung xử lý cho `e.key === "Tab"`:
  ```ts
  private readonly handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.processEnterKey();
      } else if (e.key === "Tab") {
          e.preventDefault();
          this.handleTabKey();
      } else if (e.key === "Escape") {
          e.preventDefault();
          this._cancelledCallbacks.forEach((callback) => callback());
      } else {
          this.removeTip();
      }
  };

  private handleTabKey() {
      this.removeTip();
      const val = this.textbox.value;
      const commaIdx = val.indexOf(",");
      if (commaIdx === -1) {
          this.textbox.value = `${val},`;
          const len = this.textbox.value.length;
          this.textbox.setSelectionRange?.(len, len);
      } else {
          const caret = this.textbox.selectionStart ?? val.length;
          if (caret <= commaIdx) {
              this.textbox.setSelectionRange?.(commaIdx + 1, val.length);
          } else {
              this.textbox.setSelectionRange?.(0, commaIdx);
          }
      }
  }
  ```
  - **Cơ chế hoạt động:**
    - Người dùng gõ `1500` $\rightarrow$ nhấn `Tab` $\rightarrow$ ô input tự động thành `1500,` và con trỏ nằm cuối $\rightarrow$ người dùng gõ tiếp `2000` $\rightarrow$ nhấn `Enter` (hoặc `Space`) $\rightarrow$ tạo ngay hình chữ nhật $1500 \times 2000$!
    - Nếu người dùng đã gõ `1500,2000` và bấm `Tab` lần nữa, con trỏ sẽ bôi đen qua lại giữa `1500` và `2000` để sửa nhanh giống hệt Dynamic Input của AutoCAD.

---

## 4. Danh sách kiểm thử nghiệm thu (Verification Checklist)

- [x] **1. Kiểm thử Unit Tests tự động:**
  - [x] Viết bổ sung unit tests cho:
    - `PlaneSnap` khi `Config.instance.orthoMode = true` và `allowOrtho = false` (không khóa trục).
    - `SnapLengthAtPlaneHandler` khi `disableOrtho = true` (nhập 1 số `"1500"`, nhập `"1500,"`, nhập 2 số `"1500,2000"`, và nhập `"0"` báo lỗi hợp lệ mà không crash).
    - `Input` (`packages/ui/test/flyout.test.ts` & `input.test.ts`): nhấn `Tab` chèn dấu `,` và đảo vùng bôi đen giữa 2 số.
    - `Rect` command & body (`packages/app/test/`): vẽ hình chữ nhật khi bật đồng thời `is2DDraftingMode = true` và `orthoMode = true`.
  - [x] Chạy `npm run test` và `npm run check` đảm bảo pass 100%.
- [x] **2. Kiểm thử tình huống thực tế (End-to-End Workflow):**
  - [x] Bật đồng thời **`2D`** và **`ORTHO (F8)`** trên thanh trạng thái.
  - [x] Bấm phím **`R`** (`Hình chữ nhật`), click điểm đầu tiên $\rightarrow$ Di chuyển chuột thấy khung preview hình chữ nhật xuất hiện mượt mà theo 2 chiều $X-Y$.
  - [x] Thử click chuột điểm thứ 2 $\rightarrow$ Tạo mặt `Face1` thành công, không báo `[Lỗi: ...]`.
  - [x] Bấm phím **`R`**, click điểm đầu tiên $\rightarrow$ Gõ `1500` $\rightarrow$ bấm `Tab` $\rightarrow$ gõ `2000` $\rightarrow$ bấm `Enter` $\rightarrow$ Tạo ngay hình chữ nhật $1500 \times 2000$ không cần click chuột lần 2!
- [x] **3. Build & Deploy lên VPS:**
  - [x] Cập nhật trạng thái `TASK-09` trong `ROADMAP.md` và `docs/tasks/TASK-09-fix-rect-ortho-and-tab-input.md` sang `[x] DONE`.
  - [x] Commit code theo chuẩn Conventional Commits, đồng bộ nhánh `main` và `dev`, sau đó chạy `FORCE_BUILD=1 bash scripts/deploy-vps.sh` để cập nhật lên `http://136.66.95.155`.
