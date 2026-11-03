# LỘ TRÌNH PHÁT TRIỂN & TÙY BIẾN HỆ THỐNG CAD CHILI3D (MASTER ROADMAP)

Tài liệu này đóng vai trò là **Bảng điều khiển trung tâm (Master Tracker)** phục vụ công tác nghiên cứu kiến trúc, tùy biến tính năng theo luồng công việc AutoCAD 2D/3D và triển khai hệ thống **Chili3D** lên hạ tầng đám mây.

---

## 1. Tổng quan kiến trúc Chili3D (Architecture Overview)

**Chili3D** là hệ thống Web CAD 3D/2D tham số (Parametric CAD) chạy trực tiếp trên trình duyệt, kết hợp nhân hình học **OpenCascade (OCCT v8.0.0)** biên dịch sang **WebAssembly** và engine đồ họa **Three.js**. Dự án được tổ chức theo mô hình **Monorepo** (npm workspaces) nằm trong thư mục `packages/` và được đóng gói bằng **Rspack + SWC** (`rspack.config.ts`).

### Sơ đồ phân tầng các Package trong Monorepo

```
packages/web ──> packages/builder ──> packages/app ────────> packages/core
                                  ──> packages/i18n ───────> packages/core
                                  ──> packages/three ──────> packages/core
                                  ──> packages/wasm ───────> packages/core
                                  ──> packages/storage ────> packages/core
                                  ──> packages/ui ─────────> packages/core + packages/element
                                  ──> packages/parametric ─> packages/core
                                  ──> packages/ai ─────────> packages/core
```

### Vai trò chi tiết của từng Package

| Package | Đường dẫn thực tế | Vai trò & Thành phần cốt lõi |
| :--- | :--- | :--- |
| **`@chili3d/core`** | `packages/core/` | **Tầng trừu tượng trung tâm (Core Abstractions):** Định nghĩa toàn bộ Interfaces (`IApplication`, `IDocument`, `IShape`, `ICommand`, `IStorage`, `IDataExchange`, `ICameraController`), cấu hình toàn cục (`Config`, `VisualConfig`), hệ thống phản ứng dữ liệu (`Observable`, `Binding`, `PubSub`), quản lý lệnh (`CommandStore`, `ShortcutProfiles`), bắt điểm (`ObjectSnapTypes`, `ISnap`), đa ngôn ngữ (`I18n`, `I18N_KEYS`) và Serialization (`@serializable`, `Serializer`). |
| **`@chili3d/app`** | `packages/app/` | **Tầng thực thi nghiệp vụ (Application & Commands):** Chứa lớp `Application`, `Document`, các đối tượng hình học cơ sở (`bodys/`: `LineNode`, `RectNode`, `CircleNode`, `BoxNode`...), toàn bộ các lệnh vẽ/chỉnh sửa/đo kích thước (`commands/create/*`, `commands/modify/*`, `commands/annotate/*`), cùng hai dịch vụ nền tảng là `CommandService` và `HotkeyService`. |
| **`@chili3d/parametric`** | `packages/parametric/` | **Tầng thiết kế tham số & Sketch 2D:** Quản lý danh sách thuộc tính lịch sử khối (`ParametricBodyNode`, feature-list) và môi trường phác thảo 2D (`src/sketch/`, tích hợp bộ giải ràng buộc hình học `garlic` Wasm). |
| **`@chili3d/wasm`** | `packages/wasm/` | **Tầng lõi hình học C++ OCCT (WebAssembly):** Đóng gói thư viện `lib/chili-wasm.wasm` (biên dịch từ thư mục `cpp/`), cung cấp `OccShapeProvider`, `OccShapeFactory` (tạo khối, boolean, fillet, chamfer, extrude) và `OccShapeConverter` (chuyển đổi STEP, IGES, BREP, STL). |
| **`@chili3d/three`** | `packages/three/` | **Tầng hiển thị đồ họa 3D/2D (Three.js):** Triển khai `ThreeVisulFactory`, `ThreeView`, `CameraController` (chuyển đổi camera Perspective/Orthographic, Pan/Zoom/Rotate, Fit Content), `ViewGizmo` (khối điều hướng góc nhìn), `ThreeHighlighter` và `MeshExporter` (xuất OBJ, PLY). |
| **`@chili3d/ui`** | `packages/ui/` | **Tầng giao diện người dùng (UI Chrome):** Xây dựng cửa sổ chính (`MainWindow`), màn hình khởi động (`Home`), không gian làm việc (`Editor`), thanh công cụ (`Ribbon`, `RibbonUI`), cây thư mục bản vẽ (`ProjectView`, `Tree`), bảng thuộc tính (`PropertyView`), khung nhìn (`Viewport`, `Flyout`), và thanh trạng thái (`Statusbar`, `SnapConfig`). |
| **`@chili3d/element`** | `packages/element/` | **Tầng DOM Reactive:** Cung cấp các hàm khởi tạo Web Components và gắn kết dữ liệu hai chiều (`div`, `button`, `input`, `select`, `svg`, `collection`, `RadioGroup`, `Expander`). |
| **`@chili3d/i18n`** | `packages/i18n/` | **Tầng dữ liệu ngôn ngữ:** Lưu trữ các từ điển dịch thuật (`en.ts`, `zh-cn.ts`, `pt-br.ts`, `ru.ts`) dựa trên tập khóa chuẩn `I18N_KEYS` của `@chili3d/core`. |
| **`@chili3d/storage`** | `packages/storage/` | **Tầng lưu trữ cục bộ:** Triển khai `IndexedDBStorage` thực thi giao diện `IStorage` để lưu trữ bản vẽ (`documents`) và danh sách mở gần đây (`recents`) trên trình duyệt. |
| **`@chili3d/ai`** | `packages/ai/` | **Tầng trợ lý AI & MCP Bridge:** Tích hợp khung chat AI (`ChatPanel`), bộ công cụ dựng hình bằng ngôn ngữ tự nhiên (`capabilityEngine`) và kết nối WebSocket (`?bridge=<port>`). |
| **`@chili3d/builder`** | `packages/builder/` | **Tầng khởi tạo & lắp ghép (Dependency Wiring):** Cung cấp `AppBuilder` theo mẫu thiết kế Fluent API (`.useIndexedDB().useWasmOcc().useParametric().useThree().useUI().build()`), định nghĩa cấu hình thanh công cụ `DefaultRibbon` và bộ chuyển đổi tệp `DefaultDataExchange`. |
| **`@chili3d/web`** | `packages/web/` | **Điểm vào ứng dụng (Entry Point):** File `packages/web/src/index.ts` hiển thị màn hình chờ `Loading`, kích hoạt `AppBuilder` và xử lý các tham số URL (`?url=`, `?plugin=`). |

---

## 2. Bảng theo dõi công việc (Master Task Table)

| ID | Tiêu đề | Trạng thái | File hướng dẫn chi tiết |
| :--- | :--- | :---: | :--- |
| **TASK-01** | Thiết lập môi trường Local, cấu hình Build & tối ưu Deploy cho VPS 1GB RAM | `[x] DONE` | [docs/tasks/TASK-01-setup-and-deploy.md](./docs/tasks/TASK-01-setup-and-deploy.md) |
| **TASK-02** | Việt hóa toàn diện giao diện (i18n) và Tùy biến thương hiệu / Giao diện | `[x] DONE` | [docs/tasks/TASK-02-i18n-and-branding.md](./docs/tasks/TASK-02-i18n-and-branding.md) |
| **TASK-03** | Tùy biến hệ thống Phím tắt (Hotkeys) và Thanh nhập lệnh (Command Bar) chuẩn AutoCAD | `[x] DONE` | [docs/tasks/TASK-03-autocad-command-hotkey.md](./docs/tasks/TASK-03-autocad-command-hotkey.md) |
| **TASK-04** | Tối ưu chế độ vẽ kỹ thuật 2D (Orthographic Top View, Bắt điểm OsSnap, quản lý Layer & Dim kích thước) | `[x] DONE` | [docs/tasks/TASK-04-2d-drafting-workflow.md](./docs/tasks/TASK-04-2d-drafting-workflow.md) |
| **TASK-05** | Tích hợp tính năng Đọc / Xuất bản vẽ định dạng `.DXF` (AutoCAD) | `[x] DONE` | [docs/tasks/TASK-05-dxf-import-export.md](./docs/tasks/TASK-05-dxf-import-export.md) |
| **TASK-06** | Chuyển đổi cơ chế lưu trữ từ IndexedDB (Trình duyệt) sang Backend API / Cloud Storage trên VPS | `[x] DONE` | [docs/tasks/TASK-06-cloud-storage-api.md](./docs/tasks/TASK-06-cloud-storage-api.md) |
| **TASK-07** | Bổ sung lệnh `P` (`PAN`) kéo màn hình bằng chuột trái & Khắc phục lỗi khựng khi nhập số kích thước lúc vẽ | `[x] DONE` | [docs/tasks/TASK-07-pan-and-smooth-numeric-input.md](./docs/tasks/TASK-07-pan-and-smooth-numeric-input.md) |
| **TASK-08** | Đồng bộ chọn đối tượng trên Cây bản vẽ (`Face1`), Chống Z-Fighting mặt đồng phẳng (`Prism1` vs `Face1`) & Hoàn thiện xác nhận lệnh `Extrude` / `Shell` | `[x] DONE` | [docs/tasks/TASK-08-tree-selection-and-coplanar-extrude.md](./docs/tasks/TASK-08-tree-selection-and-coplanar-extrude.md) |
| **TASK-09** | Khắc phục lỗi công cụ Hình chữ nhật (`Rect` / `Box`) khi bật chế độ 2D + `ORTHO (F8)` và Hỗ trợ phím `Tab` nhập kích thước 2 chiều $[dx, dy]$ | `[x] DONE` | [docs/tasks/TASK-09-fix-rect-ortho-and-tab-input.md](./docs/tasks/TASK-09-fix-rect-ortho-and-tab-input.md) |
| **TASK-10** | Rà soát & Khắc phục tổng thể các lỗi Hệ thống (Phím tắt đơn AutoCAD, Bắt điểm ORTHO trên bề mặt, Chống suy biến Extrude/Offset = 0, Đồng bộ Pre-selection & Reset Workplane 2D/3D) | `[x] DONE` | [docs/tasks/TASK-10-system-wide-stability-and-workflow-audit.md](./docs/tasks/TASK-10-system-wide-stability-and-workflow-audit.md) |
| **TASK-11** | Tách biệt Vật liệu theo từng Đối tượng (Per-Object Material Isolation) & Đồng bộ Hiển thị Đa vật liệu trên 2D/3D | `[x] DONE` | [docs/tasks/TASK-11-per-object-material-isolation.md](./docs/tasks/TASK-11-per-object-material-isolation.md) |
| **TASK-12** | Khắc phục Đổi tên Dự án (Inline Rename), Ổn định Sao chép mảng (`Array`), Chống mất dữ liệu Hình học (`*_copy`) & Tích hợp Lưu trữ SQLite + Xác thực Tài khoản (Auth) | `[x] DONE` | [docs/tasks/TASK-12-inline-rename-array-fix-and-sqlite-auth.md](./docs/tasks/TASK-12-inline-rename-array-fix-and-sqlite-auth.md) |
| **TASK-13** | Đồng bộ chọn Đối tượng từ Cây bản vẽ (Model Tree) cho lệnh Đùn khối (`Extrude`) & Tối ưu Raycasting Lọc biên dạng 2D trên Viewport 3D | `[x] DONE` | [docs/tasks/TASK-13-extrude-tree-selection-and-raycast-2d-filter.md](./docs/tasks/TASK-13-extrude-tree-selection-and-raycast-2d-filter.md) |
| **TASK-14** | Hỗ trợ Đổi màu Đường kẻ (`Line`, `Wire`, `Arc`, `Circle` khung dây) & Đổi màu Hàng loạt khi Quét chọn Nhiều Vật thể (Multi-Selection Material Sync) | `[x] DONE` | [docs/tasks/TASK-14-line-wire-color-and-material-sync.md](./docs/tasks/TASK-14-line-wire-color-and-material-sync.md) |
| **TASK-15** | Khắc phục Triệt để Lỗi Mất Hiển thị Khối (`Prism` / `Mesh`), Đồng bộ Mở Mắt (`Visibility`) & Tự động Căn chỉnh Camera 2D/3D khi Tải lại Dự án | `[x] DONE` | [docs/tasks/TASK-15-fix-project-load-camera-fit-and-3d-visibility.md](./docs/tasks/TASK-15-fix-project-load-camera-fit-and-3d-visibility.md) |
| **TASK-16** | Khắc phục Lỗi Văng Camera 6.000.000mm do Đường đo kích thước lạc tọa độ (`AnnotationBatch` Outlier) khiến Toàn bộ 90 Khối `Prism` bị Thu Nhỏ thành 1 Chấm Li Ti dưới đáy màn hình | `[x] DONE` | [docs/tasks/TASK-16-fix-outlier-annotation-camera-fit.md](./docs/tasks/TASK-16-fix-outlier-annotation-camera-fit.md) |
| **TASK-17** | **[Ưu tiên 1]** Sửa lỗi Home nhảy nhầm Dự án + **[Ưu tiên 2]** Cây đối tượng Phân cấp Thông minh (`Cha -> Con -> Cháu`), Ẩn/Hiện Hàng loạt 1 Click & Tự gom nhóm `Array` + **[Ưu tiên 3]** Bảng Thống kê Vật tư (`BOM` / `TK` / `LI`) | `[?] WAITING_REVIEW` | [docs/tasks/TASK-17-material-bom-takeoff-and-terminal-command.md](./docs/tasks/TASK-17-material-bom-takeoff-and-terminal-command.md) |
| **TASK-18** | Khắc phục Lỗi Không Chọn Được Chi Tiết Nhỏ Nằm Trên Mặt Tường (`Prism12` Đỏ trên `Prism3` Xám), Xử lý Sọc Caro Đỏ-Xám (Z-Fighting), Chống Nhảy Loạn Xạ Cây Thư Mục & Tối Ưu Chống Lag Khi Rê Chuột | `[?] WAITING_REVIEW` | [docs/tasks/TASK-18-fix-coplanar-selection-zfighting-and-tree-jump-lag.md](./docs/tasks/TASK-18-fix-coplanar-selection-zfighting-and-tree-jump-lag.md) |
| **TASK-20** | Cổng Agent bên ngoài (Agent Gateway): nghiên cứu & thiết kế để agent đọc bản vẽ, chạy lệnh, tính BOM, vẽ/đổi màu, nhận sự kiện chọn. Chia 3 giai đoạn; giai đoạn 2 (VPS) cần phê duyệt bảo mật | `[ ] TODO` | [docs/tasks/TASK-20-agent-gateway-research-and-design.md](./docs/tasks/TASK-20-agent-gateway-research-and-design.md) · [docs/AGENT-GATEWAY-GUIDE.md](./docs/AGENT-GATEWAY-GUIDE.md) |
| **TASK-21** | Đường đọc nhanh cho agent: đo dài/rộng/cao, phân loại vật liệu, tính Array (số bản sao, pitch, leftover), BOM. Lưu sẵn số liệu khi lưu bản vẽ để đọc không cần kernel | `[ ] TODO` | [docs/tasks/TASK-21-agent-measure-and-array-fast-path.md](./docs/tasks/TASK-21-agent-measure-and-array-fast-path.md) |
| **TASK-22** | Củng cố đa mô hình cho agent trong app: bảng năng lực mô hình, phân loại lỗi trung lập, lịch sử gắn nhà cung cấp, kiểm thử hợp đồng với API thật | `[ ] TODO` | [docs/tasks/TASK-22-multi-provider-hardening.md](./docs/tasks/TASK-22-multi-provider-hardening.md) |
| **TASK-23** | Nâng cấp agent trong app: bộ đánh giá bằng số liệu, công cụ kế hoạch, bước kiểm chứng bắt buộc sau khi ghi | `[ ] TODO` | [docs/tasks/TASK-23-agent-maturity-eval-plan-verify.md](./docs/tasks/TASK-23-agent-maturity-eval-plan-verify.md) · [docs/AGENT-DEVELOPMENT-GUIDE.md](./docs/AGENT-DEVELOPMENT-GUIDE.md) |
| **TASK-19** | Khắc phục Triệt để Hiện tượng Sọc Caro Đỏ-Xám (Z-Fighting) giữa Bức Tường (`Prism3`) và Các Thanh Lam / Tấm Ốp (`Prism10`, `Prism11`, `Prism12`) | `[?] WAITING_REVIEW` | [docs/tasks/TASK-19-fix-wall-slat-zfighting.md](./docs/tasks/TASK-19-fix-wall-slat-zfighting.md) |
| **TASK-24** | Kết nối API tự động (dán khóa là nhận danh sách mô hình) qua VPS LLM Proxy, chống chặn CORS trình duyệt, tự động lọc mô hình Chat & bảo mật khóa | `[?] WAITING_REVIEW` | [docs/tasks/TASK-24-auto-discover-api-models.md](./docs/tasks/TASK-24-auto-discover-api-models.md) |
| **TASK-25** | Gia cố Năng lực Phục vụ & Chống Sập VPS (Server Capacity Hardening): Chuyển Pipe Streaming không đệm cho LLM Proxy, Giới hạn Đồng thời Proxy (503), Giới hạn Kích thước Body Storage (413), Tự động Khởi động lại `storage-api` khi Deploy & Cập nhật Thông số VPS trong `MAINTENANCE.md` | `[~] IN_PROGRESS` | [docs/tasks/TASK-25-server-capacity-hardening.md](./docs/tasks/TASK-25-server-capacity-hardening.md) |

---

## 3. Hồ sơ Vận hành, Cấu hình `.env` & Bảo trì Hạ tầng

- **Địa chỉ máy chủ Live trên VPS (Google Cloud):** [http://136.66.95.155](http://136.66.95.155)
- **Sổ tay vận hành & bảo trì VPS / GitHub / `.env`:** [docs/MAINTENANCE.md](./docs/MAINTENANCE.md)

---

## 4. Quy ước Trạng thái & Quy tắc Bắt buộc dành cho AI Thực thi (Worker AI Workflow Rules)

### 4.1. Vòng đời Trạng thái Công việc (Task Lifecycle)
- `[ ] TODO`: Đã phân tích nguyên nhân gốc rễ và lập hồ sơ kỹ thuật chi tiết trong `docs/tasks/TASK-XX-*.md`, chờ giao việc.
- `[~] IN_PROGRESS`: AI thực thi đang tiến hành sửa code và viết kiểm thử.
- `[?] WAITING_REVIEW` (**Chờ Review / Nghiệm thu**): AI thực thi đã hoàn thành code, pass 100% test & build, đã deploy lên VPS và **đã ghi đầy đủ Nhật ký Thực thi (Execution Log)** vào cuối file `docs/tasks/TASK-XX-*.md`.
- `[x] DONE`: Đã được Người dùng và AI Kiến trúc sư kiểm tra nghiệm thu và xác nhận đóng task.

### 4.2. Quy tắc Bắt buộc để Lưu vết (Traceability Rules — Tuyệt đối tuân thủ)
1. **Không tự ý nhảy cóc sang `[x] DONE`:**
   - Khi AI thực thi làm xong một `TASK-XX`, chỉ được chuyển trạng thái trong `ROADMAP.md` và trong file `docs/tasks/TASK-XX-*.md` từ `[ ] TODO` / `[~] IN_PROGRESS` sang **`[?] WAITING_REVIEW`**.
   - Chỉ khi Người dùng xác nhận nghiệm thu đạt yêu cầu thì mới chuyển sang `[x] DONE`.
2. **Bắt buộc ghi "Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)" vào cuối file `docs/tasks/TASK-XX-*.md`:**
   - Trước khi commit kết thúc nhiệm vụ, AI thực thi **BẮT BUỘC** phải cập nhật mục **`## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)`** ở cuối file `docs/tasks/TASK-XX-*.md` với đầy đủ các thông tin:
     - **Ngày giờ thực hiện & Mã Commit (`git rev-parse --short HEAD`)**.
     - **Danh sách chi tiết từng file đã sửa / thêm mới** (kèm tên hàm/class và mô tả rõ đã sửa logic gì để sau này truy vết lỗi nhanh chóng).
     - **Danh sách các bài Unit Test đã thêm/cập nhật** và kết quả chạy `npm run test` + `npm run build`.
     - **Trạng thái Deploy lên VPS** (`http://136.66.95.155`).
