# TASK-13: Đồng bộ chọn Đối tượng từ Cây bản vẽ (Model Tree) cho lệnh Đùn khối (`Extrude`) & Tối ưu Raycasting Lọc biên dạng 2D trên Viewport 3D

- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** P0 (Critical UX & Modeling Workflow Bug)
- **Phụ thuộc:** `TASK-08`, `TASK-10`, `TASK-12`

---

## 1. Hiện trạng lỗi & Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

### 1.1. Tại sao khi đang chạy lệnh `Đùn khối (Extrude)`, click vào `Rectangle4`, `Line1`, `Face1` trên Cây đối tượng (Model Tree) không hoạt động?
Qua kiểm tra trực tiếp mã nguồn, có **3 điểm nghẽn kỹ thuật** đang chặn luồng chọn từ Cây đối tượng:

1. **Hàm [`Tree.canSelect()`](../../packages/ui/src/project/tree/tree.ts) (dòng 324–334) chặn đứng sự kiện `onClick` khi lệnh `Extrude` đang chạy:**
   ```ts
   private canSelect() {
       if (this.document.visual.eventHandler instanceof NodeSelectionHandler) {
           return true;
       }

       if (this.document.visual.eventHandler instanceof ShapeSelectionHandler) {
           return this.document.visual.eventHandler.shapeType === ShapeTypes.shape;
       }

       return false;
   }
   ```
   - Khi lệnh `Extrude` (`create.extrude` hoặc `feature.extrude`) được kích hoạt và đang ở trạng thái chờ chọn biên dạng (`Waiting for selection`), `Picker.pickShape()` gán `document.visual.eventHandler = new SubshapeSelectionHandler(...)` (kế thừa từ `ShapeSelectionHandler`) với `shapeType = ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire` (hoặc `ShapeTypes.face`).
   - Vì `shapeType` lúc này **không bằng `ShapeTypes.shape`**, hàm `this.canSelect()` trả về **`false`**!
   - Hệ quả: Hàm `Tree.onClick` thoát ngay ở dòng đầu tiên (`if (!this.canSelect()) return;`), **không bao giờ gọi** `this.document.selection.setSelectedNodes([item])`, khiến listener `onNodeSelectionChanged` trong [`Picker.pickShape`](../../packages/app/src/picker.ts) không bao giờ nhận được tín hiệu!

2. **Hàm [`extractVisualShapesFromNodes`](../../packages/core/src/step/selectStep.ts) (dòng 72–125) chưa trích xuất hết các biên dạng `Wire` / `Edge` nằm trong `Compound`:**
   - Khi một đối tượng 2D trên Cây đối tượng (như `Polygon`, `Wire`, `Rect` không tạo mặt hoặc nhóm đường nét) có `rootShape.shapeType === ShapeTypes.compound` (hoặc không có sub-face mà chỉ có `Wire` / `Edge`), nhánh `Case 2` hiện tại chỉ tìm `rootShape.findSubShapes(ShapeTypes.face)` mà chưa fallback sang `findSubShapes(ShapeTypes.wire)` và `findSubShapes(ShapeTypes.edge)` khi `shapeType` cho phép `wire | edge`.

3. **Lệnh `ExtrudeFeatureCommand` (`feature.extrude` trong [`packages/parametric/src/commands/extrudeCommand.ts`](../../packages/parametric/src/commands/extrudeCommand.ts)):**
   - Trong `SelectSketchProfilesStep` (dòng 120–180), `allowNode` hiện chỉ cho phép `SketchNode` hoặc `ParametricBodyNode`, từ chối các node 2D cơ bản như `RectNode` (`Rectangle4`), `FaceNode` (`Face1`), `CircleNode` (`Circle1`), `LineNode` (`Line1`), và `fromSelectedSketch` cũng chỉ đọc `SketchNode` khi Pre-select trên Cây đối tượng.

---

### 1.2. Tại sao khi click trên Viewport 3D trong lúc chạy lệnh `Extrude`, Raycaster thường xuyên bắt nhầm các mảng tường 3D (`Prism`, `Box`) xung quanh hoặc phía sau?
1. **`ExtrudeCommand` ([`packages/app/src/commands/create/extrude.ts`](../../packages/app/src/commands/create/extrude.ts)) chưa có bộ lọc loại bỏ khối `Solid` 3D:**
   - Tại dòng 36–39:
     ```ts
     new GetOrSelectShapeStep(
         (ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire) as ShapeType,
         "prompt.select.shape",
     )
     ```
     Bước chọn này không truyền `nodeFilter` hay `shapeFilter`. Khi trong bản vẽ đã có các bức tường 3D (`Prism1`, `Prism2`, `Box1`), mỗi khối 3D này chứa hàng chục `Face` và `Edge`. Khi người dùng muốn chọn một hình 2D (`Rectangle4`, `Line1`, `Face1`) nằm sát chân tường hoặc bị góc tường che khuất trong góc nhìn phối cảnh, tia Raycast bắn trúng mặt hoặc cạnh của khối `Prism` 3D trước và bắt nhầm ngay khối tường đó!

2. **Hàm [`ThreeView.findIntersectedShapes`](../../packages/three/src/threeView.ts) (dòng 1263–1284) chưa lọc đối tượng trước khi bắn tia `raycaster.intersectObjects`:**
   - Hiện tại `findIntersectedShapes(shapeType, mx, my, includeHiddenVisuals)` đưa **toàn bộ** các `ThreeVisualObject` vào `raycaster.intersectObjects(shapes, false)` mà không kiểm tra `nodeFilter` trước.

3. **Lỗi logic trong [`ThreeView.detectShapes`](../../packages/three/src/threeView.ts) (dòng 1080–1089) tự ý đẩy `Edge` đơn lẻ lên đè mất `Face` của hình 2D:**
   ```ts
   if (subs.length > 1 && subs[0].shape.shapeType === ShapeTypes.face) {
       const i = subs.findIndex((x) => x.shape.shapeType === ShapeTypes.edge);
       if (i < 0) return subs;

       const nearest = (subs[0].shape as IFace).surface().nearestPoint(subs[i].point!) ?? [];
       if (nearest.length > 0 && nearest[0]!.distanceTo(subs[i].point!) < Precision.OnSurface) {
           const v = subs.splice(i, 1);
           subs.splice(0, 0, ...v);
       }
   }
   ```
   - Khi `ExtrudeCommand` truyền `shapeType = ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire`, nếu người dùng click vào mặt phẳng của `Rectangle4` (`Face`) nhưng gần mép hoặc gần chân tường `Prism1`, `raycaster` bắt trúng cả `Face` của `Rectangle4` lẫn 1 `Edge` (của `Prism1` hoặc của mép `Rectangle4`). Đoạn code trên lập tức **đẩy `Edge` đơn lẻ lên đầu mảng (`subs[0]`) thay thế cho `Face`**! Kết quả là thay vì đùn cả mặt phẳng `Rectangle4` thành khối đặc, hệ thống lại bắt nhầm 1 cạnh lẻ của bức tường kế bên!

---

## 2. Danh sách File cần can thiệp

| Package | File Path | Vai trò thay đổi |
| :--- | :--- | :--- |
| `@chili3d/ui` | `packages/ui/src/project/tree/tree.ts` | Sửa `canSelect()` trả về `true` cho mọi `ShapeSelectionHandler` (không giới hạn ở `ShapeTypes.shape`) để khi lệnh `Extrude` (và mọi lệnh chọn hình học khác) đang chạy, click vào node trên Cây đối tượng luôn được đẩy thẳng vào `selection.setSelectedNodes` $\rightarrow$ `ActiveCommand`. |
| `@chili3d/core` | `packages/core/src/step/selectStep.ts` | Nâng cấp `extractVisualShapesFromNodes` để trích xuất đầy đủ `Face`, `Wire`, `Edge` từ mọi loại node 2D (`RectNode`, `FaceNode`, `LineNode`, `WireNode`, `PolygonNode`, `CircleNode`, `SketchNode`, `Compound`) cho cả **Pre-selection** lẫn **Active Command Tree Click**. |
| `@chili3d/three` | `packages/three/src/threeView.ts` | 1) Truyền `nodeFilter` vào `findIntersectedShapes` & `initIntersectableShapes` để loại bỏ ngay từ gốc các đối tượng không hợp lệ trước khi `raycaster.intersectObjects` chạy.<br>2) Đảm bảo sắp xếp kết quả va chạm theo `distance: ascending` và ưu tiên tuyệt đối thực thể 2D (`!hasSolid`) trước mọi mặt/cạnh của khối 3D.<br>3) Sửa lỗi `Edge` cướp quyền ưu tiên của `Face` 2D khi `shapeType` chứa cả `face` và `edge`. |
| `@chili3d/app` | `packages/app/src/commands/create/extrude.ts` | Thiết lập bộ lọc Raycast cho `ExtrudeCommand`: chỉ bắt các thực thể biên dạng 2D (`Face`, `Closed Wire`, `Rectangle`, `Circle`, `Line`...) và tự động bỏ qua (ignore) các cạnh lẻ của khối Solid 3D; ưu tiên tuyệt đối các node 2D độc lập so với các khối `Prism`/`Box` 3D đã có. |
| `@chili3d/core` | `packages/core/src/eventHandlers/shapeSelectionEventHandler.ts` | Khi di chuột (hover) qua đối tượng biên dạng 2D hợp lệ, bật đồng thời cả highlight bề mặt (`faceHighlight`) và đường viền sáng (`edgeHighlight` / Outline) để người dùng nhìn thấy rõ ràng biên dạng sắp được đùn trước khi click. |
| `@chili3d/parametric` | `packages/parametric/src/commands/extrudeCommand.ts` | Mở rộng `SelectSketchProfilesStep` để hỗ trợ chọn cả các node 2D cơ bản (`ShapeNode` không phải Solid) từ Cây đối tượng và Pre-selection. |

---

## 3. Chi tiết Kỹ thuật cần triển khai

### Bước 3.1: Cho phép chọn đối tượng đùn khối trực tiếp từ Cây đối tượng (Model Tree Selection & Pre-selection)

#### A. Sửa hàm `canSelect()` trong [`packages/ui/src/project/tree/tree.ts`](../../packages/ui/src/project/tree/tree.ts)
Tại dòng 324–334 của `packages/ui/src/project/tree/tree.ts`:
```ts
    private canSelect() {
        if (this.document.visual.eventHandler instanceof NodeSelectionHandler) {
            return true;
        }

        if (this.document.visual.eventHandler instanceof ShapeSelectionHandler) {
            return true;
        }

        return false;
    }
```
- **Tác dụng:** Khi bất kỳ lệnh nào sử dụng `ShapeSelectionHandler` / `SubshapeSelectionHandler` (như `Extrude`, `Revolve`, `Sweep`, `Offset`, `Shell`, `Fillet`, `Chamfer`...) đang ở trạng thái chờ chọn đối tượng (`Waiting for selection`), cú click vào tên đối tượng trên Cây đối tượng (`Rectangle4`, `Line1`, `Face1`...) sẽ đi qua `Tree.onClick` $\rightarrow$ gọi `this.document.selection.setSelectedNodes([item], event.ctrlKey)` $\rightarrow$ kích hoạt ngay `onNodeSelectionChanged` trong `Picker.pickShape()` $\rightarrow$ nạp shape vào lệnh `Extrude` và chuyển thẳng sang bước nhập chiều cao đùn!

#### B. Hoàn thiện `extractVisualShapesFromNodes` trong [`packages/core/src/step/selectStep.ts`](../../packages/core/src/step/selectStep.ts)
Cập nhật hàm `extractVisualShapesFromNodes` (dòng 72–125) để xử lý trọn vẹn mọi trường hợp node 2D:
```ts
export function extractVisualShapesFromNodes(
    document: IDocument,
    nodes: readonly INode[],
    shapeType: ShapeType,
    shapeFilter?: IShapeFilter,
    nodeFilter?: INodeFilter,
): VisualShapeData[] {
    const result: VisualShapeData[] = [];
    for (const node of nodes) {
        if (nodeFilter && !nodeFilter.allow(node)) continue;
        if (!(node instanceof ShapeNode) || !node.shape.isOk) continue;
        const owner = document.visual.context.getVisual(node) as INodeVisual | undefined;
        if (!owner) continue;
        const rootShape = node.shape.value;
        const worldTransform = owner.worldTransform();

        // Case 1: The node's root shape directly matches shapeType (e.g. FaceNode -> Face, WireNode -> Wire, LineNode -> Edge)
        if (ShapeTypeUtils.contains(shapeType, rootShape.shapeType)) {
            if (!shapeFilter || shapeFilter.allow(rootShape, worldTransform)) {
                const box = rootShape.boundingBox();
                const localCenter = BoundingBox.isValid(box) ? BoundingBox.center(box) : { x: 0, y: 0, z: 0 };
                result.push({
                    owner,
                    shape: rootShape,
                    transform: worldTransform,
                    point: worldTransform.ofPoint(localCenter),
                    indexes: [0],
                });
                continue;
            }
        }

        // Case 2: Non-solid node (2D profile, SketchNode, Compound of faces/wires/edges)
        if (!ShapeTypeUtils.hasSolid(rootShape.shapeType)) {
            const pushSubShapes = (subType: ShapeType) => {
                const subs = rootShape.findSubShapes(subType);
                let added = false;
                subs.forEach((sub, idx) => {
                    if (!shapeFilter || shapeFilter.allow(sub, worldTransform)) {
                        const box = sub.boundingBox();
                        const localCenter = BoundingBox.isValid(box)
                            ? BoundingBox.center(box)
                            : { x: 0, y: 0, z: 0 };
                        result.push({
                            owner,
                            shape: sub,
                            transform: worldTransform,
                            point: worldTransform.ofPoint(localCenter),
                            indexes: [idx],
                        });
                        added = true;
                    }
                });
                return added;
            };

            if (ShapeTypeUtils.hasFace(shapeType) && pushSubShapes(ShapeTypes.face)) {
                continue;
            }
            if (ShapeTypeUtils.hasWire(shapeType) && pushSubShapes(ShapeTypes.wire)) {
                continue;
            }
            if (ShapeTypeUtils.hasEdge(shapeType) && pushSubShapes(ShapeTypes.edge)) {
                continue;
            }
        }
    }
    return result;
}
```

#### C. Cập nhật `SelectSketchProfilesStep` trong [`packages/parametric/src/commands/extrudeCommand.ts`](../../packages/parametric/src/commands/extrudeCommand.ts)
1. Mở rộng `allowNode` mặc định trong `SelectSketchProfilesStep`:
   ```ts
   private readonly allowNode: (node: INode) => boolean = (node) =>
       node instanceof SketchNode ||
       node instanceof ParametricBodyNode ||
       (node instanceof ShapeNode &&
           node.shape.isOk &&
           !ShapeTypeUtils.hasSolid(node.shape.value.shapeType)),
   ```
2. Trong `fromSelectedSketch(document, view, controller)`:
   - Ngoài việc kiểm tra `SketchNode`, nếu người dùng đã chọn trước (Pre-select) một node 2D (`ShapeNode` không phải Solid như `RectNode`, `FaceNode`, `CircleNode`) trên Cây đối tượng, sử dụng `extractVisualShapesFromNodes(document, document.selection.getSelectedNodes(), ShapeTypes.face, { allow: (s) => (s as IFace).surface().isPlanar() }, { allow: this.allowNode })` để lấy ngay `faces` và hoàn tất bước chọn (`controller.success()`) mà không bắt click lại trên màn hình 3D!

---

### Bước 3.2: Tối ưu thuật toán Raycasting, Lọc loại đối tượng 2D & Hover Highlight trên Viewport 3D

#### A. Lọc `nodeFilter` ngay từ tầng Raycaster trong [`packages/three/src/threeView.ts`](../../packages/three/src/threeView.ts)
1. Trong `ThreeView.detectShapes` (dòng 1027–1091):
   - Truyền `nodeFilter` vào `this.findIntersectedShapes(shapeType, mx, my, includeHiddenVisuals, nodeFilter)`:
     ```ts
     private findIntersectedShapes(
         shapeType: ShapeType,
         mx: number,
         my: number,
         includeHiddenVisuals: boolean,
         nodeFilter?: INodeFilter,
     ) {
         const raycaster = this.initRaycaster(mx, my);
         const shapes = this.initIntersectableShapes(shapeType, includeHiddenVisuals, nodeFilter);
         const hits = raycaster.intersectObjects(shapes, false);
         hits.sort((a, b) => a.distance - b.distance);
         return hits;
     }

     private initIntersectableShapes(
         shapeType: ShapeType,
         includeHiddenVisuals: boolean,
         nodeFilter?: INodeFilter,
     ) {
         let shapes: Object3D[] = [];
         this.document.visual.context.visuals().forEach((x) => {
             const pickable = includeHiddenVisuals || x.visible;
             if (
                 x instanceof ThreeVisualObject &&
                 pickable &&
                 x.node.visible &&
                 x.node.parentVisible &&
                 (!nodeFilter || nodeFilter.allow(x.node))
             ) {
                 shapes.push(...x.subShapeVisual(shapeType));
             }
         });
         shapes = shapes.filter((x) => x !== undefined && x !== null);
         return shapes;
     }
     ```
   - **Lợi ích:** Khi lệnh `Extrude` truyền `nodeFilter` chỉ lấy các đối tượng 2D, các khối tường 3D (`Prism`, `Box`) bị loại hoàn toàn khỏi mảng `shapes` đưa vào `raycaster.intersectObjects`. Tia Raycast sẽ **xuyên thẳng qua mọi bức tường 3D** mà không bao giờ bị che khuất hay bắt nhầm!

2. **Sửa lỗi `Edge` đè lên `Face` và ưu tiên thực thể 2D trong [`ThreeView.detectShapes`](../../packages/three/src/threeView.ts) (dòng 1047–1090):**
   - Viết helper kiểm tra xem một `VisualShapeData` có thuộc về đối tượng 2D (`!hasSolid`) hay không:
     ```ts
     const is2DNode = (item: VisualShapeData) =>
         item.owner.node instanceof ShapeNode &&
         item.owner.node.shape.isOk &&
         !ShapeTypeUtils.hasSolid(item.owner.node.shape.value.shapeType);
     ```
   - **Quy tắc 1 (Ưu tiên đối tượng 2D trước đối tượng 3D Solid):**
     - Nếu trong danh sách `subs` vừa có kết quả thuộc đối tượng 2D (`is2DNode(x) === true`) vừa có kết quả thuộc khối 3D Solid (`is2DNode(x) === false`), luôn đưa toàn bộ các kết quả thuộc đối tượng 2D lên đầu danh sách `subs` (giữ nguyên thứ tự khoảng cách `distance` tăng dần từ camera trong nhóm 2D)!
   - **Quy tắc 2 (Không để `Edge` cướp quyền của `Face` khi chọn biên dạng):**
     - Ở đoạn dòng 1080–1089 (`When an edge is on a face...`):
       - **CHỈ** đẩy `Edge` lên trước `Face` khi:
         1. `subs[0]` là một mặt của khối 3D Solid (`!is2DNode(subs[0])`) VÀ `subs[i]` là một cạnh 2D độc lập (`is2DNode(subs[i])`), HOẶC
         2. Khi người dùng không yêu cầu chọn `Face` của hình 2D.
       - Nếu `subs[0]` đã là một `Face` của đối tượng 2D (`is2DNode(subs[0]) === true`, ví dụ mặt của `Rectangle4` / `Face1`), **GIỮ NGUYÊN `subs[0]` là `Face` đó**, tuyệt đối không đẩy `Edge` viền của nó hay `Edge` của khối tường bên cạnh lên đè mất `Face`!

#### B. Lọc nghiêm ngặt biên dạng 2D trong [`ExtrudeCommand` (`packages/app/src/commands/create/extrude.ts`)](../../packages/app/src/commands/create/extrude.ts)
Trong `ExtrudeCommand`:
1. Bổ sung kiểm tra đối tượng hợp lệ cho bước chọn biên dạng đùn (`GetOrSelectShapeStep`):
   - Viết hàm kiểm tra một node có phải là thực thể 2D (`is2DProfileNode(node: INode)`):
     ```ts
     private static is2DProfileNode(node: INode): boolean {
         if (!(node instanceof ShapeNode) || !node.shape.isOk) return false;
         return !ShapeTypeUtils.hasSolid(node.shape.value.shapeType);
     }
     ```
   - Kiểm tra xem trong bản vẽ hiện tại có bất kỳ đối tượng 2D nào đang hiển thị không (`has2DProfilesInScene()`).
   - Cấu hình `GetOrSelectShapeStep` trong `ExtrudeCommand.getSteps()`:
     ```ts
     protected override getSteps(): IStep[] {
         return [
             new GetOrSelectShapeStep(
                 (ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire) as ShapeType,
                 "prompt.select.shape",
                 {
                     nodeFilter: {
                         allow: (node) => {
                             // Nếu trong bản vẽ có các biên dạng 2D (Rectangle, Line, Circle, Face, Wire, Sketch...),
                             // chỉ cho phép Raycaster bắt vào các đối tượng 2D này, bỏ qua hoàn toàn các khối Solid/Prism 3D!
                             if (this.has2DProfilesInScene()) {
                                 return ExtrudeCommand.is2DProfileNode(node);
                             }
                             return !isReferenceGeometryNode(node);
                         },
                     },
                     shapeFilter: {
                         allow: (shape) => {
                             // Nếu chọn Face thì phải là mặt hợp lệ; không bao giờ cho phép chọn cạnh lẻ của khối 3D
                             return (
                                 shape.shapeType === ShapeTypes.face ||
                                 shape.shapeType === ShapeTypes.wire ||
                                 shape.shapeType === ShapeTypes.edge
                             );
                         },
                     },
                     selectedState: VisualStates.faceSelected,
                     highlightState: VisualStates.faceHighlight,
                 },
             ),
             new LengthAtAxisStep("prompt.pickNextPoint", this.getLengthStepData, true),
         ];
     }
     ```
   - *(Lưu ý: Thêm một thuộc tính checkbox `@property("option.command.allowSolidFace")` mặc định `false` trên `ExtrudeCommand` nếu người dùng muốn chủ động bật chế độ đùn từ một mặt của khối 3D có sẵn khi trong bản vẽ vẫn còn hình 2D; còn mặc định `allowSolidFace = false` sẽ chỉ bắt vào các hình 2D `Wire`/`Face`/`Rectangle`/`Line` để không bao giờ bắt nhầm vào tường `Prism`/`Solid` 3D!).*

#### C. Tăng cường Hover Highlight & Outline Đường viền sáng trong [`SubshapeSelectionHandler`](../../packages/core/src/eventHandlers/shapeSelectionEventHandler.ts)
Trong `ShapeSelectionHandler.highlightDetecteds` và `cleanHighlights` ([`packages/core/src/eventHandlers/shapeSelectionEventHandler.ts`](../../packages/core/src/eventHandlers/shapeSelectionEventHandler.ts) dòng 82–109):
- Khi highlight một `Face` của đối tượng 2D (`this.highlightState === VisualStates.faceHighlight`), ngoài việc tô sáng bề mặt (`VisualStates.faceHighlight`), hãy kích hoạt thêm `VisualStates.edgeHighlight` cho các cạnh viền của đối tượng 2D đó (và gỡ bỏ tương ứng trong `cleanHighlights()`), giúp hiển thị đường viền sáng (Outline/Glow) sắc nét quanh biên dạng khi người dùng rê chuột qua trước khi click!

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria) & Kiểm thử

1. **Chọn từ Cây đối tượng khi lệnh `Extrude` đang mở (Active Command Tree Click):**
   - Vẽ `Rectangle4` (hoặc `Face1`, `Circle1`, `Line1`), sau đó bấm nút `Đùn khối (Extrude)`.
   - Click trực tiếp vào tên `Rectangle4` (hoặc `Face1`, `Line1`) trên Cây đối tượng bên trái:
     - Đối tượng lập tức được chọn, sáng lên trên màn hình 3D và **chuyển thẳng sang bước kéo/nhập chiều cao đùn** (hiển thị ô input nhập số chiều cao).
2. **Chọn trước trên Cây đối tượng rồi bấm `Extrude` (Pre-selection):**
   - Click chọn `Rectangle4` trên Cây đối tượng trước, sau đó bấm nút `Đùn khối (Extrude)`:
     - Hệ thống nhận diện ngay `Rectangle4` và mở luôn bước nhập chiều cao đùn mà không bắt click lại.
3. **Raycasting chuẩn xác trên Viewport 3D (Không bắt nhầm tường `Prism` / `Solid`):**
   - Trong bản vẽ có nhiều bức tường 3D (`Prism1`, `Prism2`, `Box1`) che chắn xung quanh và một hình chữ nhật 2D (`Rectangle4`) nằm sát chân tường hoặc phía sau tường.
   - Bật lệnh `Đùn khối (Extrude)` và rê chuột / click vào `Rectangle4` trên màn hình 3D:
     - Raycaster **bỏ qua hoàn toàn các khối tường `Prism`/`Box` 3D**, hiển thị viền sáng (Hover Highlight) và bắt trúng chính xác `Rectangle4` (`Face`/`Wire`).
4. **Unit Tests & Triển khai Production:**
   - Viết unit test kiểm tra:
     - `Tree.canSelect()` trả về `true` khi `eventHandler` là `SubshapeSelectionHandler` với `shapeType = ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire`.
     - Click vào node trên `Tree` khi `Picker.pickShape` đang chạy tự động hoàn tất bước chọn và trả về đúng `Face` / `Wire` / `Edge` của node đó.
     - `ExtrudeCommand` lọc bỏ các khối `Solid` 3D khi trong cảnh có biên dạng 2D.
   - Chạy `npm run test` và `npm run build` pass 100%.
   - Cập nhật trạng thái `TASK-13` thành `[x] DONE` trong `ROADMAP.md` và `docs/tasks/TASK-13-extrude-tree-selection-and-raycast-2d-filter.md`, commit code, push lên GitHub (`dev` & `main`) và chạy `./scripts/deploy-vps.sh` để deploy lên VPS `http://136.66.95.155`.
