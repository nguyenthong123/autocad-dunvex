# TASK-10: Rà soát & Khắc phục tổng thể các lỗi Hệ thống (Phím tắt AutoCAD, Bắt điểm ORTHO trên bề mặt, Chống suy biến Extrude/Offset = 0, Đồng bộ Pre-selection & Chuyển đổi 2D/3D)

- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** `CRITICAL (System-Wide Stability & UX Polish)`
- **Phụ thuộc:** `TASK-03`, `TASK-04`, `TASK-07`, `TASK-08`, `TASK-09`

---

## 1. Báo cáo Rà soát Toàn diện Codebase (Full System Audit Findings)

Qua rà soát toàn bộ mã nguồn các phân hệ `@chili3d/core`, `@chili3d/app`, `@chili3d/three`, `@chili3d/ui`, hệ thống hiện còn tồn tại **4 nhóm lỗi hệ thống nghiêm trọng** gây cản trở trực tiếp trải nghiệm vẽ 2D/3D của người dùng:

---

### Nhóm lỗi 1: Xung đột Phím tắt đơn vs Chuỗi phím trong `AutoCADShortcuts` (`packages/core/src/command/shortcutProfiles.ts`)
1. **Phím đơn `R`, `T`, `D` không hoạt động ở chế độ mặc định (`navigation3D = "AutoCAD"`):**
   - Trong `AutoCADShortcuts` ([`shortcutProfiles.ts`](../../packages/core/src/command/shortcutProfiles.ts) dòng 159-181), `"create.rect"` bị ghi đè từ `"r"` thành `"r+e+c"`, `"modify.trim"` thành `"t+r"`, `"annotate.dimension"` thành `"d+l+i"`. Khi người dùng nhấn phím đơn **`R`** (vẽ hình chữ nhật), **`T`** (cắt Trim), hoặc **`D`** (đo kích thước), `HotkeyService` không khớp được lệnh nào!
2. **Các chuỗi phím đa ký tự (`p+l`, `c+h+a`, `m+i`) bị chết 100% (Unreachable):**
   - Trong `HotkeyService.getCommand` ([`hotkeyService.ts`](../../packages/app/src/services/hotkeyService.ts) dòng 161-166), ngay khi người dùng nhấn chữ cái đầu tiên của chuỗi (ví dụ nhấn `P` để gõ `P+L`, hoặc nhấn `C` để gõ `C+H+A`, hoặc nhấn `M` để gõ `M+I`), hệ thống khớp ngay tức khắc với phím đơn `"p"` (`create.extrude`), `"c"` (`create.circle`), `"m"` (`modify.move`) và xóa mảng `this.keys = []`!
3. **Giải pháp chuẩn hóa:**
   - Trong `AutoCADShortcuts`, gán **phím tắt đơn (1 phím hoặc `Shift + phím`)** cho toàn bộ các lệnh trên vùng vẽ để bấm 1 phím là ăn ngay (`l`, `r`, `c`, `a`, `p`, `h`, `o`, `m`, `t`, `f`, `x`, `d`, `q`, `b`, `s`, `y`, `n`), **tuyệt đối không dùng chuỗi phím nhiều ký tự có tiền tố trùng với phím đơn** trong `ShortcutMap`.
   - Toàn bộ lệnh viết tắt nhiều chữ cái của AutoCAD (`REC`, `PL`, `RO`, `MI`, `TR`, `EX`, `CHA`, `EL`, `DLI`, `DRA`, `DAN`, `EXT`, `PAN`, `REV`...) được xử lý qua thanh `COMMAND:` (`CommandBar`).

---

### Nhóm lỗi 2: Chế độ `ORTHO (F8)` bị vô hiệu hóa khi vẽ đè lên bề mặt (`SurfaceSnap`) & Crash `PointSnapEventHandler` khi nhập số lúc chưa di chuột
1. **`SurfaceSnap` làm mất tác dụng của `ORTHO (F8)` khi vẽ trên mặt sàn / mặt tường:**
   - Trong [`PointSnapEventHandler.getInitSnaps`](../../packages/core/src/snap/handlers/pointSnapEventHandler.ts) (dòng 37-45), thứ tự ưu tiên là `[objectSnap, trackingSnap, surfaceSnap, workplaneSnap]`.
   - Khi người dùng đã vẽ mặt sàn `Face1` hoặc tường `Prism1`, rồi bật **`ORTHO (F8)`** để vẽ `Line` (`L`), `Polygon`, hoặc `Move` (`M`) nằm trên mặt đó: `surfaceSnap` ([`packages/core/src/snap/snaps/surfaceSnap.ts`](../../packages/core/src/snap/snaps/surfaceSnap.ts)) bắt trúng mặt `Face1` **trước** khi tới `workplaneSnap`, và trả về điểm tự do chưa khóa trục vuông góc!
2. **Crash `TypeError` trong `PointSnapEventHandler.calculatePointFromCoordinates` khi chưa di chuột:**
   - Tại [`pointSnapEventHandler.ts`](../../packages/core/src/snap/handlers/pointSnapEventHandler.ts) (dòng 69):
     ```ts
     const plane = this.data.plane?.() ?? this.snaped!.view.workplane;
     ```
     Nếu người dùng bật lệnh `Line` / `Point` / `Move`, chưa di chuột (`this.snaped` đang là `undefined`) mà gõ ngay tọa độ `100, 200` $\rightarrow$ `Enter`, `this.snaped!.view` sẽ văng lỗi `TypeError: Cannot read properties of undefined (reading 'view')`!
3. **Lỗi `"Không thể chỉ nhập một số"` hoặc crash khi nhập 1 số lúc con trỏ trùng `refPoint`:**
   - Tại `pointSnapEventHandler.ts` (dòng 63-66 & 105-108): Nếu người dùng click điểm thứ nhất của `Line` rồi gõ ngay `1500` $\rightarrow$ `Enter` mà chưa kịp rê chuột ra xa (`!this._snaped` hoặc `this._snaped.point.isEqualTo(refPoint)`), hệ thống từ chối nhập hoặc crash tại `this._snaped!.point!.sub(refPoint).normalize()!` thay vì fallback về hướng trục `plane.xvec`.

---

### Nhóm lỗi 3: Suy biến chiều dài bằng `0` trong `SnapLengthAtAxisHandler` (`Extrude`, `Box`, `Offset`) & Thiếu `GetOrSelectShapeStep` ở các lệnh 3D
1. **Nhập `0` hoặc chuỗi rỗng trong `Extrude` / `Offset` / `Box` gây lỗi WASM `[Lỗi: ...]`:**
   - Trong [`SnapLengthAtAxisHandler.inputError`](../../packages/core/src/snap/handlers/lengthSnapEventHandler.ts) (dòng 49-51):
     ```ts
     protected inputError(text: string): I18nKeys | undefined {
         return Number.isNaN(Number(text)) ? "error.input.invalidNumber" : undefined;
     }
     ```
     Khi người dùng đang ở bước kéo chiều cao tường / độ dày `Extrude` (hoặc `Box`, `Cylinder`, `Offset`), nếu gõ `0` hoặc bấm `Space`/`Enter` khi ô input rỗng (`Number("") === 0`), `inputError` trả về `undefined` (hợp lệ!) và tạo ra `ExtrudeNode` / `BoxNode` với `length = 0`, khiến nhân C++ OpenCascade WASM báo lỗi runtime `[Lỗi: ...]` ở góc phải màn hình!
   - Tương tự trong `ExtrudeNode.generateShape()` ([`packages/app/src/bodys/extrude.ts`](../../packages/app/src/bodys/extrude.ts)): nếu `Math.abs(this.length) < Precision.Distance`, cần trả về `Result.err(...)` sớm trước khi gọi xuống WASM.
2. **Các lệnh `Offset`, `Revolve`, `Shell`, `Boolean` (`Join` / `Cut` / `Common`) chưa dùng `GetOrSelectShapeStep`:**
   - Trong [`packages/app/src/commands/create/offset.ts`](../../packages/app/src/commands/create/offset.ts) (dòng 62), [`revolve.ts`](../../packages/app/src/commands/create/revolve.ts) (dòng 83), [`shell.ts`](../../packages/app/src/commands/modify/shell.ts) (dòng 110), [`boolean.ts`](../../packages/app/src/commands/boolean.ts) (dòng 83): Bước 1 vẫn dùng `SelectShapeStep` làm xóa mất đối tượng người dùng đã chọn trước trên Cây bản vẽ hoặc Viewport.
   - Trong `OffsetCommand.getAxis()` (`offset.ts` dòng 95): `const start = this.stepDatas[0].shapes[0].point!;` chưa có fallback `BoundingBox.center` khi chọn từ Cây bản vẽ!

---

### Nhóm lỗi 4: Lỗi kẹt Mặt phẳng làm việc (`workplane`) và Camera khi bật/tắt nút `2D` trên thanh trạng thái (`SnapConfig` & `CameraController`)
- Tại [`packages/ui/src/statusbar/snapConfig.ts`](../../packages/ui/src/statusbar/snapConfig.ts) (dòng 62-73):
  1. Khi người dùng tích chọn `[x] 2D`: Hệ thống gọi `setTopView2D(true)` đưa Camera về góc nhìn chiếu bằng từ trên xuống (nhìn dọc theo trục $Z$), nhưng **không đặt lại `view.workplane = Plane.XY`**. Nếu trước đó người dùng vừa vẽ trên mặt tường đứng 3D (`workplane` đang là mặt phẳng đứng $XZ$ hoặc $YZ$), tia nhìn từ đỉnh xuống sẽ **song song với mặt phẳng làm việc**, khiến `plane.intersectRay(ray)` trả về `undefined` $\rightarrow$ **Không thể click vẽ được bất kỳ điểm nào trong chế độ 2D!**
  2. Khi người dùng bỏ tích `[ ] 2D` để chuyển sang vẽ 3D: Hệ thống chưa chuyển `cameraType` về `"perspective"` (hoặc giữ nguyên góc nhìn đang khóa thẳng đứng), khiến người dùng tưởng phần mềm vẫn đang kẹt ở 2D.

---

## 2. Danh sách các File mục tiêu cần can thiệp (Target Files)

| STT | Đường dẫn File | Hành động | Mô tả phạm vi thay đổi |
| :-: | :--- | :---: | :--- |
| 1 | `packages/core/src/command/shortcutProfiles.ts` | **Modify** | Chuẩn hóa `AutoCADShortcuts`: Khôi phục toàn bộ phím tắt đơn (`"create.rect": "r"`, `"modify.trim": "t"`, `"annotate.dimension": "d"`, `"create.polygon": "w"`, `"modify.rotate": "shift+r"`, `"modify.chamfer": "shift+c"`...) để không bao giờ xung đột tiền tố với phím đơn `p`, `c`, `r`, `m`, `t`. Bổ sung đầy đủ alias vào `AutoCADCommandAliases` (`BOX`, `CYL`, `SPH`, `UNI`, `SU`, `IN`, `SH`, `PRESSPULL`...). |
| 2 | `packages/core/src/snap/snaps/surfaceSnap.ts` | **Modify** | Bổ sung `readonly refPoint?: () => XYZ` và `readonly allowOrtho: boolean = true` vào `SurfaceSnap`. Khi `this.allowOrtho && Config.instance.orthoMode && this.refPoint`, áp dụng phép chiếu khóa trục vuông góc (`dx` hoặc `dy`) trên mặt phẳng của bề mặt (hoặc `data.view.workplane`) giống hệt `PlaneSnapBase`. |
| 3 | `packages/core/src/snap/handlers/pointSnapEventHandler.ts` | **Modify** | 1) Truyền `pointData.refPoint` vào `new SurfaceSnap(pointData.refPoint)`.<br>2) Sửa lỗi crash `this.snaped!.view.workplane` trong `calculatePointFromCoordinates` thành `this.data.plane?.() ?? view.workplane`.<br>3) Trong `calculatePointFromDistance`, `getPointFromInput` và `isInvalidSingleNumber`: Cho phép nhập 1 số dương kể cả khi chưa di chuột (`!this._snaped`), fallback vector hướng về `(this.data.plane?.() ?? view.workplane).xvec`, và từ chối giá trị bằng `0`. |
| 4 | `packages/core/src/snap/handlers/lengthSnapEventHandler.ts` | **Modify** | Trong `SnapLengthAtAxisHandler.inputError(text)`: kiểm tra `text.trim() === ""` hoặc `Number.isNaN(n)` hoặc `Math.abs(n) < Precision.Distance` thì trả về `"error.input.invalidNumber"` để chặn việc nhập `0` làm lỗi WASM. |
| 5 | `packages/app/src/bodys/extrude.ts` | **Modify** | Trong `ExtrudeNode.generateShape()`, kiểm tra sớm `if (Math.abs(this.length) < Precision.Distance) return Result.err("Extrude length cannot be zero")` trước khi gọi xuống WASM. |
| 6 | `packages/app/src/commands/create/offset.ts` | **Modify** | Đổi `SelectShapeStep` sang `GetOrSelectShapeStep`; bổ sung fallback tính `start` từ `BoundingBox.center` trong `getAxis()`; kiểm tra `shape.isOk` trong `executeMainTask()` trước khi thêm `EditableShapeNode`. |
| 7 | `packages/app/src/commands/create/revolve.ts`<br>`packages/app/src/commands/modify/shell.ts`<br>`packages/app/src/commands/boolean.ts` | **Modify** | Đổi bước 1 từ `SelectShapeStep` sang `GetOrSelectShapeStep` để hỗ trợ chọn trước đối tượng (Pre-selection) từ Cây bản vẽ hoặc Viewport. |
| 8 | `packages/three/src/cameraController.ts`<br>`packages/ui/src/statusbar/snapConfig.ts` | **Modify** | Trong `setTopView2D`: tự động đặt `this.view.workplane = Plane.XY` để mặt phẳng vẽ luôn vuông góc với tia nhìn Top View 2D. Trong `SnapConfig`: khi tắt `[ ] 2D` sang 3D, tự động bật lại `dynamicWorkplane = true` và cập nhật `activeView.update()`. |

---

## 3. Hướng dẫn triển khai chi tiết từng bước (Step-by-Step Implementation Guide)

### Bước 3.1: Chuẩn hóa `AutoCADShortcuts` & `AutoCADCommandAliases` (`packages/core/src/command/shortcutProfiles.ts`)

Mở file [`packages/core/src/command/shortcutProfiles.ts`](../../packages/core/src/command/shortcutProfiles.ts):
1. Cập nhật `AutoCADShortcuts` (dòng 159-181) sao cho thừa hưởng toàn bộ phím đơn nhạy bén của `Chili3dShortcuts` mà **không có bất kỳ chuỗi `a+b` nào bắt đầu bằng một phím đơn `a` đang được sử dụng**:
   ```ts
   export const AutoCADShortcuts: ShortcutMap = {
       ...Chili3dShortcuts,
       "view.pan": "h",
       "create.line": "l",
       "create.polygon": "w",
       "create.rect": "r",
       "create.circle": "c",
       "create.arc3point": "a",
       "create.ellipse": "e",
       "create.offset": "o",
       "create.extrude": "p",
       "modify.move": "m",
       "modify.rotate": "shift+r",
       "modify.mirror": "shift+m",
       "modify.trim": "t",
       "modify.extend": "shift+e",
       "modify.fillet": "f",
       "modify.chamfer": "shift+c",
       "modify.explode": "x",
       "modify.deleteNode": ["Delete", "Backspace"],
       "annotate.dimension": "d",
       "annotate.radius": "shift+d",
       "annotate.angle": "alt+d",
   };
   ```
   *(Lưu ý: Kiểm tra lại `packages/core/test/shortcutProfiles.test.ts` để cập nhật các assertion tương ứng với bảng phím tắt đơn mới này).*
2. Trong `AutoCADCommandAliases`, bổ sung thêm các lệnh 3D thông dụng:
   ```ts
   BOX: "create.box",
   CYL: "create.cylinder",
   CYLINDER: "create.cylinder",
   SPH: "create.sphere",
   SPHERE: "create.sphere",
   CONE: "create.cone",
   PYR: "create.pyramid",
   UNI: "boolean.join",
   UNION: "boolean.join",
   SU: "boolean.cut",
   SUBTRACT: "boolean.cut",
   IN: "boolean.common",
   INTERSECT: "boolean.common",
   SHELL: "modify.shell",
   PRESSPULL: "feature.pressPull",
   ```

### Bước 3.2: Khóa trục `ORTHO (F8)` trong `SurfaceSnap` & Chống crash `PointSnapEventHandler`

1. Mở [`packages/core/src/snap/snaps/surfaceSnap.ts`](../../packages/core/src/snap/snaps/surfaceSnap.ts):
   - Bổ sung constructor nhận `readonly refPoint?: () => XYZ` và `readonly allowOrtho: boolean = true`:
     ```ts
     export class SurfaceSnap implements ISnap {
         constructor(
             readonly refPoint?: () => XYZ,
             readonly allowOrtho: boolean = true,
         ) {}
     ```
   - Trong `snap(data: MouseAndDetected)`:
     Sau khi tính được `let point = projectOntoWorldSurface(shapes[0]);` (nếu `point !== undefined`):
     ```ts
     if (this.allowOrtho && Config.instance.orthoMode && this.refPoint) {
         const ref = this.refPoint();
         const plane = data.view.workplane;
         const delta = point.sub(ref);
         const dx = delta.dot(plane.xvec);
         const dy = delta.dot(plane.yvec);
         point =
             Math.abs(dx) >= Math.abs(dy)
                 ? ref.add(plane.xvec.multiply(dx))
                 : ref.add(plane.yvec.multiply(dy));
     }
     ```
2. Mở [`packages/core/src/snap/handlers/pointSnapEventHandler.ts`](../../packages/core/src/snap/handlers/pointSnapEventHandler.ts):
   - Trong `getInitSnaps(pointData: PointSnapData)` (dòng 37-45):
     Truyền `pointData.refPoint` vào `new SurfaceSnap(pointData.refPoint)`.
   - Trong `getPointFromInput(view: IView, text: string)` (dòng 47-61):
     ```ts
     protected getPointFromInput(view: IView, text: string): SnapResult {
         const { values, absolute } = parseDimensionInput(text);
         const refPoint = this.getRefPoint() ?? XYZ.zero;
         const result: SnapResult = { point: refPoint, view, shapes: [], type: "input" };

         if (absolute) {
             result.point = new XYZ({ x: values[0], y: values[1], z: values[2] });
         } else if (values.length === 1) {
             result.point = this.calculatePointFromDistance(view, refPoint, values[0]);
         } else if (values.length > 1) {
             result.point = this.calculatePointFromCoordinates(view, refPoint, values);
         }

         return result;
     }

     private calculatePointFromDistance(view: IView, refPoint: XYZ, distance: number): XYZ {
         const plane = this.data.plane?.() ?? view.workplane;
         const rawVec = this._snaped?.point?.sub(refPoint);
         const vector =
             rawVec && rawVec.length() > Precision.Distance ? rawVec.normalize()! : plane.xvec;
         return refPoint.add(vector.multiply(distance));
     }

     private calculatePointFromCoordinates(view: IView, refPoint: XYZ, dims: number[]): XYZ {
         const plane = this.data.plane?.() ?? this._snaped?.view.workplane ?? view.workplane;
         const axes = [plane.xvec, plane.yvec, plane.normal].slice(0, dims.length);
         return axes.reduce((point, axis, index) => {
             const value = this.followSnapedSign(refPoint, axis, dims[index]);
             return point.add(axis.multiply(value));
         }, refPoint);
     }
     ```
   - Trong `isInvalidSingleNumber(dims: number[])` (dòng 105-108):
     - Chỉ trả về `true` nếu `dims.length === 1 && Math.abs(dims[0]) < Precision.Distance` (tức là nhập `0`), hoặc nếu `!this.getRefPoint() && (!this._snaped || !this._snaped.point)`! Khi đã có `refPoint` (như điểm thứ 2 của lệnh `Line`), dù người dùng chưa di chuột (`!this._snaped`) vẫn cho phép nhập 1 số dương để vẽ theo trục `xvec` (hoặc hướng chuột hiện tại).

### Bước 3.3: Chặn chiều dài bằng `0` trong `SnapLengthAtAxisHandler` & `ExtrudeNode`, và nâng cấp `Offset`, `Revolve`, `Shell`, `Boolean`

1. Mở [`packages/core/src/snap/handlers/lengthSnapEventHandler.ts`](../../packages/core/src/snap/handlers/lengthSnapEventHandler.ts):
   - Trong `SnapLengthAtAxisHandler.inputError(text: string)` (dòng 49-51):
     ```ts
     protected inputError(text: string): I18nKeys | undefined {
         const trimmed = text.trim();
         if (trimmed.length === 0) return "error.input.invalidNumber";
         const num = Number(trimmed);
         return Number.isNaN(num) || Math.abs(num) < Precision.Distance
             ? "error.input.invalidNumber"
             : undefined;
     }
     ```
2. Mở [`packages/app/src/bodys/extrude.ts`](../../packages/app/src/bodys/extrude.ts):
   - Trong `generateShape()`: Kiểm tra `if (Math.abs(this.length) < Precision.Distance) return Result.err("Extrude length cannot be zero");` trước khi gọi xuống `shapeFactory`.
3. Mở [`packages/app/src/commands/create/offset.ts`](../../packages/app/src/commands/create/offset.ts):
   - Thay `SelectShapeStep` ở dòng 62 bằng `GetOrSelectShapeStep`.
   - Trong `getAxis()` (dòng 94-96):
     ```ts
     protected getAxis(): { direction: XYZ; point: XYZ; normal: XYZ } {
         const first = this.stepDatas[0].shapes[0];
         const start =
             first.point ?? first.transform.ofPoint(BoundingBox.center(first.shape.boundingBox()));
         const shape = this.transformdFirstShape(this.stepDatas[0]);
     ```
   - Trong `executeMainTask()` (dòng 47-58): Kiểm tra `if (!shape.isOk) { PubSub.default.pub("showToast", "error.default:{0}", shape.error); return; }` trước khi tạo `EditableShapeNode`.
4. Mở [`packages/app/src/commands/create/revolve.ts`](../../packages/app/src/commands/create/revolve.ts) (dòng 83), [`packages/app/src/commands/modify/shell.ts`](../../packages/app/src/commands/modify/shell.ts) (dòng 110), và [`packages/app/src/commands/boolean.ts`](../../packages/app/src/commands/boolean.ts) (dòng 83):
   - Đổi bước chọn đầu tiên (`steps[0]`) từ `SelectShapeStep` sang `GetOrSelectShapeStep` để người dùng có thể chọn trước đối tượng rồi mới bấm lệnh.

### Bước 3.4: Đồng bộ `workplane = Plane.XY` khi bật chế độ `2D` (`packages/three/src/cameraController.ts` & `packages/ui/src/statusbar/snapConfig.ts`)

1. Mở [`packages/three/src/cameraController.ts`](../../packages/three/src/cameraController.ts):
   - Trong `setTopView2D(fit: boolean = true)` (dòng 226-237):
     ```ts
     setTopView2D(fit: boolean = true): void {
         this.cameraType = "orthographic";
         if (this.view) {
             this.view.workplane = Plane.XY;
         }
         const target = this.cameraTarget;
         const distance = Math.max(this._position.distanceTo(this._target), 1000);
         const eye = new XYZ(target.x, target.y, target.z + distance);
         const up = new XYZ(0, 1, 0);
         this.lookAt(eye, target, up, { duration: CAMERA_FLY_DURATION });
         if (fit) {
             this.fitContent({ duration: CAMERA_FLY_DURATION });
         }
         this.view.update?.();
     }
     ```
2. Mở [`packages/ui/src/statusbar/snapConfig.ts`](../../packages/ui/src/statusbar/snapConfig.ts):
   - Trong `mode2DToggle` `onclick` (dòng 62-73):
     Khi `enabled === false` (người dùng tắt `2D` để sang `3D`), gọi `getCurrentApplication()?.activeView?.update?.()` để làm mới khung nhìn ngay lập tức.

---

## 4. Danh sách kiểm thử nghiệm thu (Verification Checklist)

1. **Kiểm thử Unit Tests tự động:**
   - Cập nhật và bổ sung unit tests cho `shortcutProfiles.test.ts`, `snapSnaps.test.ts` (`SurfaceSnap` với `orthoMode`), `pointSnapEventHandler.test.ts` (nhập tọa độ và nhập 1 số khi `this._snaped === undefined`), `snapLengthHandler.test.ts` (chặn nhập `0` hoặc chuỗi rỗng), `offset.test.ts`, `cameraController.test.ts` (`setTopView2D` reset `workplane = Plane.XY`).
   - Chạy `npm run test` và `npm run check` đảm bảo 100% test pass và 0 lỗi Biome.
2. **Kiểm thử luồng thao tác thực tế:**
   - Bấm các phím đơn `L`, `R`, `C`, `P`, `H`, `O`, `M`, `T`, `F`, `D` trên bàn phím $\rightarrow$ Kích hoạt lệnh ngay lập tức trong 1 lần bấm.
   - Bật `2D` + `ORTHO (F8)`, vẽ đường thẳng `Line` (`L`) nằm đè lên mặt sàn `Face1` $\rightarrow$ Đường thẳng khóa cứng góc vuông 90° chuẩn xác.
   - Bật `2D` sau khi vừa thao tác trên mặt tường 3D $\rightarrow$ Mặt phẳng vẽ tự động reset về `Plane.XY`, vẽ được ngay trên mặt bằng.
   - Trong lệnh `Extrude` (`P`) hoặc `Offset` (`O`), thử gõ `0` $\rightarrow$ Ô input báo lỗi số không hợp lệ, tuyệt đối không văng lỗi WASM `[Lỗi: ...]`.
3. **Build & Deploy lên VPS:**
   - Cập nhật trạng thái `TASK-10` trong `ROADMAP.md` và `docs/tasks/TASK-10-system-wide-stability-and-workflow-audit.md` sang `[x] DONE`.
   - Commit code theo chuẩn Conventional Commits, đồng bộ nhánh `dev` và `main`, sau đó chạy `FORCE_BUILD=1 bash scripts/deploy-vps.sh` để cập nhật bản build mới lên `http://136.66.95.155`.
