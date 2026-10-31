# TASK-04: Tối ưu chế độ vẽ kỹ thuật 2D (Orthographic Top View, Bắt điểm OsSnap, quản lý Layer & Dim kích thước)

- **ID:** `TASK-04`
- **Tiêu đề:** Tối ưu chế độ vẽ kỹ thuật 2D (Orthographic Top View, Bắt điểm OsSnap, quản lý Layer & Dim kích thước)
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Cao (P1)
- **Độ khó:** Khó (Hard)

---

## 1. Mục tiêu (Objective)

Chili3D mặc định khởi tạo vùng nhìn ở chế độ **3D Phối cảnh (`perspective`)** với góc nhìn Isometric `(1500, 1500, 1500)`. Tuy nhiên, đối với kỹ sư vẽ bản vẽ kỹ thuật 2D (như mặt bằng cơ khí, kiến trúc, kết cấu giống AutoCAD), họ cần một chế độ **2D Drafting Mode** chuyên biệt:
1. **Khóa góc nhìn 2D Top View (`Orthographic`):** Camera tự động chuyển sang phép chiếu trực giao (`cameraType = "orthographic"`), nhìn thẳng từ đỉnh xuống mặt phẳng `Plane.XY` (`position = (0, 0, 1500)`, `up = (0, 1, 0)`), và khóa thao tác xoay 3D (`rotate`) để tránh lệch mặt phẳng bản vẽ khi thao tác chuột.
2. **Tối ưu Bắt điểm (`OsSnap`) & Khóa trục vuông góc (`Ortho Mode - F8`):** Bổ sung chế độ khóa góc vuông `0° / 90° / 180° / 270°` (phím tắt `F8` giống AutoCAD) kết hợp với `SnapConfig` (`F3` bật/tắt `enableSnap`, `F11` bật/tắt `enableSnapTracking`).
3. **Quản lý Layer 2D (Lớp bản vẽ):** Mở rộng `FolderNode` hoặc xây dựng cơ chế gán màu sắc/kiểu đường nét (`LineType`: `"solid"` | `"dash"`) và trạng thái Ẩn/Hiện (`visible`), Khóa (`locked`) cho từng nhóm đối tượng trong `ProjectView` (`packages/ui/src/project/projectView.ts`).
4. **Chuẩn hóa công cụ Ghi kích thước (`AnnotateDimension`):** Cố định mặt phẳng ghi kích thước trên `Plane.XY` khi ở chế độ 2D và cho phép cấu hình nhanh chiều cao chữ (`textHeight`).

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `packages/core/src/config.ts` | Chỉnh sửa | Thêm thuộc tính cấu hình `is2DDraftingMode: boolean` và `orthoMode: boolean` vào lớp `Config`. |
| `packages/three/src/cameraController.ts` | Chỉnh sửa | Điều khiển camera Three.js: thêm phương thức `setTopView2D()`, chuyển `cameraType = "orthographic"` và chặn `rotate()` khi `Config.instance.is2DDraftingMode === true`. |
| `packages/core/src/visual/cameraController.ts` | Chỉnh sửa | Bổ sung chữ ký phương thức `setTopView2D?(fit?: boolean): void` vào interface `ICameraController`. |
| `packages/app/src/application.ts` | Chỉnh sửa | Trong `createActiveView()` (dòng 243-247), kiểm tra nếu đang bật chế độ 2D thì tự động kích hoạt góc nhìn Top Orthographic trên `Plane.XY`. |
| `packages/core/src/snap/snaps/planeSnap.ts` | Chỉnh sửa | Trong `PlaneSnapBase.snapAtPlane()`, cưỡng bức chiếu điểm bắt trên mặt phẳng về trục ngang (`plane.xvec`) hoặc trục đứng (`plane.yvec`) đi qua `refPoint` khi `Config.instance.orthoMode === true`. |
| `packages/ui/src/statusbar/snapConfig.ts` | Chỉnh sửa | Bổ sung nút bật/tắt `2D Mode`, `ORTHO (F8)` bên cạnh `OSNAP (F3)` và `OTRACK (F11)` trên thanh trạng thái. |
| `packages/app/src/commands/annotate/dimension.ts` | Chỉnh sửa | Trong `AnnotateDimension.annotationPlane()` (dòng 91-103), giữ cố định mặt phẳng `Plane.XY` khi ở chế độ vẽ 2D để chữ kích thước luôn nằm phẳng trên mặt giấy. |
| `packages/ui/test/snapConfig.test.ts` | Chỉnh sửa | Cập nhật số lượng `<input>` trong `SnapConfig` và bổ sung unit test cho `ORTHO (F8)`, `2D Mode` và phím tắt `F3 / F8 / F11`. |
| `packages/three/test/cameraController.test.ts` | Chỉnh sửa | Bổ sung unit test cho `setTopView2D()` và khóa `rotate()` khi `Config.instance.is2DDraftingMode === true`. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Bổ sung trạng thái `is2DDraftingMode` và `orthoMode` vào `packages/core/src/config.ts`

Mở `packages/core/src/config.ts` và thêm 2 thuộc tính reactive vào lớp `Config` (dòng 140-146):

```ts
// File: packages/core/src/config.ts
export class Config extends Observable {
    // ... các thuộc tính hiện có ...

    @serialize()
    get is2DDraftingMode(): boolean {
        return this.getPrivateValue("is2DDraftingMode", false);
    }
    set is2DDraftingMode(value: boolean) {
        this.setProperty("is2DDraftingMode", value);
    }

    get orthoMode(): boolean {
        return this.getPrivateValue("orthoMode", false);
    }
    set orthoMode(value: boolean) {
        this.setProperty("orthoMode", value);
    }
}
```

### Bước 3.2: Chuyển đổi góc nhìn 2D Top Orthographic và khóa xoay 3D tại `packages/three/src/cameraController.ts`

Trong `packages/three/src/cameraController.ts`:
1. Khi `Config.instance.is2DDraftingMode` bật, chuyển `this.cameraType = "orthographic"`, tắt `Config.instance.dynamicWorkplane = false` (để mặt phẳng làm việc luôn cố định ở `Plane.XY`), và đặt hướng nhìn từ trục `+Z` nhìn thẳng xuống `(0, 0, 0)` với vector hướng lên là trục `+Y` `(0, 1, 0)`.
2. Chặn thao tác `rotate(dx, dy)` khi đang ở chế độ 2D:

```ts
// File: packages/three/src/cameraController.ts
import { CAMERA_FLY_DURATION, Config, XYZ } from "@chili3d/core";

export class CameraController extends Observable implements ICameraController {
    // ...
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
    }

    rotate(dx: number, dy: number): void {
        // Khóa xoay 3D khi đang ở chế độ bản vẽ kỹ thuật 2D
        if (Config.instance.is2DDraftingMode) {
            return;
        }
        // ... giữ nguyên logic xoay 3D hiện có ...
    }
}
```

### Bước 3.3: Bổ sung nút chuyển đổi `2D/3D`, `ORTHO (F8)` và phím tắt `F3 / F8` tại `packages/ui/src/statusbar/snapConfig.ts`

Mở `packages/ui/src/statusbar/snapConfig.ts` để thêm công tắc bật/tắt nhanh chế độ **2D Top View** và **Ortho (F8)** ngay trên thanh trạng thái phía dưới:

```ts
// File: packages/ui/src/statusbar/snapConfig.ts
private readonly orthoToggle = input({
    type: "checkbox",
    id: "snap-ortho",
    checked: Config.instance.orthoMode,
    onclick: () => {
        Config.instance.orthoMode = this.orthoToggle.checked;
    },
});

private readonly mode2DToggle = input({
    type: "checkbox",
    id: "mode-2d-drafting",
    checked: Config.instance.is2DDraftingMode,
    onclick: () => {
        const enabled = this.mode2DToggle.checked;
        Config.instance.is2DDraftingMode = enabled;
        Config.instance.dynamicWorkplane = !enabled;
        if (enabled) {
            getCurrentApplication()?.activeView?.cameraController.setTopView2D?.(true);
        }
    },
});
```

Đồng thời đăng ký phím chức năng chuẩn AutoCAD trong `connectedCallback()` của `SnapConfig`:
- Nhấn `F3`: Đảo trạng thái `Config.instance.enableSnap`.
- Nhấn `F8`: Đảo trạng thái `Config.instance.orthoMode`.
- Nhấn `F11`: Đảo trạng thái `Config.instance.enableSnapTracking`.

### Bước 3.4: Chuẩn hóa Ghi kích thước 2D trong `packages/app/src/commands/annotate/dimension.ts`

Trong `packages/app/src/commands/annotate/dimension.ts` (dòng 91-103), phương thức `annotationPlane` hiện tại suy luận mặt phẳng dựa vào hướng kéo chuột 3D. Khi `Config.instance.is2DDraftingMode === true`, ta cố định mặt phẳng ghi kích thước trên `Plane.XY` đi qua điểm đầu `p1`:

```ts
// File: packages/app/src/commands/annotate/dimension.ts
private readonly annotationPlane = (point?: XYZ): Plane => {
    const p1 = this.stepDatas[0].point!;
    const dir = this.stepDatas[1].point!.sub(p1).normalize();
    if (dir === undefined || Config.instance.is2DDraftingMode) {
        return Plane.XY.translateTo(p1);
    }
    // ... giữ nguyên phần suy luận mặt phẳng 3D khi ở chế độ 3D ...
};
```

### Bước 3.5: Quản lý Layer (Lớp bản vẽ) dựa trên `FolderNode` và `Material`

Trong Chili3D, cây thư mục bên trái (`packages/ui/src/project/projectView.ts`) quản lý các `FolderNode` (`packages/core/src/model/folderNode.ts`) hỗ trợ sẵn thuộc tính `visible` (ẩn/hiện toàn bộ đối tượng con trong Layer).
- Khi tạo Layer mới bằng lệnh `"create.folder"` (`packages/app/src/commands/folder.ts`), có thể gắn thêm thuộc tính màu sắc mặc định của Layer trong `userData` của `FolderNode` để mọi đường nét (`LineNode`, `RectNode`, `CircleNode`, `PolygonNode`) vẽ mới khi đang chọn Layer đó sẽ tự động thừa hưởng màu sắc của Layer.

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] Bật công tắc **2D Mode** trên thanh trạng thái (`Statusbar`):
  - Camera lập tức bay về góc nhìn **Top View** với phép chiếu **Orthographic** (`icon-orthographic` sáng lên).
  - Giữ `Shift + Chuột giữa` kéo trên màn hình: khung nhìn không bị nghiêng sang 3D, chỉ cho phép Pan (`Chuột giữa`) và Zoom (`Cuộn chuột`).
- [x] Nhấn phím `F3` trên bàn phím: checkbox **Bắt điểm (OSNAP)** trên thanh trạng thái bật/tắt tương ứng.
- [x] Nhấn phím `F8` bật **ORTHO**: dùng lệnh `Line` (`L`), chọn điểm đầu tiên và di chuyển chuột — đoạn thẳng được khóa cứng theo phương ngang (`0° / 180°`) hoặc phương đứng (`90° / 270°`).
- [x] Sử dụng lệnh `AnnotateDimension` (`DLI`) đo khoảng cách giữa 2 đỉnh của hình chữ nhật 2D: đường kích thước và chữ số hiển thị phẳng trên mặt phẳng `XY`, bám theo đối tượng khi di chuyển đỉnh.
