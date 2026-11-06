# TASK-40: Đề xuất Kiến trúc Thiết kế, Quản trị Quyền và Kiểm chứng Agent CAD

> **Tài liệu phương án kiến trúc + quyết định Reviewer đã chốt cho Đợt B.**  
> **Ngày cập nhật:** 06/11/2026  
> **Trạng thái:** `ĐỢT B — IMPLEMENTATION HANDOFF (WAITING_REVIEW SHA)`  
> **SHA bàn giao hiện tại (chờ duyệt):** `3f8849a865ac0e3e7ecba3c7959efee1f4d4c9e5` (`3f8849a8`)  
> **SHA Đợt B ban đầu (chưa duyệt VPS):** `aa136320` / tip docs `492f4e62`  
> **Mốc mã nguồn Đợt A (Git SHA):** `1a527bacdcee5c4a384b92dec5ce575fb7924ccd`  
> **Căn cứ:** [`docs/tasks/TASK-40-agent-design-governance-and-verification.md`](./TASK-40-agent-design-governance-and-verification.md), [`AGENTS.md`](../../AGENTS.md), chỉ đạo Reviewer duyệt Đợt B.

---

## 1. Lưu trữ Quy tắc — Quyết định Đợt B đã chốt

### 1.1. Giữ quy tắc NGOÀI Document (`documentVersion` không đổi)
- `Document.load` so sánh tuyệt đối `payload.version` với `pkg.documentVersion` (`0.7.1`); không migration.
- Quy tắc / hồ sơ bảo vệ **không** ghi vào schema Document → không bump `documentVersion`.

### 1.2. Phương án tối thiểu Đợt B: `ObjectStorage` (localStorage)
Reviewer chốt **một** kênh phù hợp storage hiện có; Filesystem Access API, IndexedDB sidecar `chili_design_rules`, và metadata VPS **để đợt sau**.

| Phạm vi | Khóa | Nội dung |
| --- | --- | --- |
| Tài khoản | `designRules.account` | Guidance Markdown (đã sanitize hiển thị), tùy chọn bảo vệ mặc định |
| Tài liệu | `designRules.doc:<documentId>` | Override theo bản vẽ khi có liên kết chắc chắn |

**Thiếu liên kết / không chắc chắn:** `loadEffectiveDesignRules` trả `DefaultSafeDesignRules` (`scope=default_safe`, `missingLink=true`) → bảo vệ nguồn mặc định, không cấp quyền sửa/xóa/tiêu thụ. UI/status báo rõ chế độ default-safe.

**Sanitization:** `sanitizeGuidanceMarkdown` loại script/HTML cho an toàn hiển thị UI. **Không** coi đây là bảo đảm chống prompt injection — guidance vẫn là văn bản không tin cậy trong prompt.

Mã: `packages/ai/src/governance/rulesStore.ts`.

---

## 2. Ma trận Đường Ghi theo Schema Thật và Điểm Chặn Quyền

Rà soát toàn diện từng tệp trong [`packages/ai/src/tools/`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/tools/) và [`packages/parametric/src/program/parametricProgram.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/parametric/src/program/parametricProgram.ts). Dưới đây là ma trận chính xác theo **schema thật**:

| Tên công cụ (Tool Name) | Hành động / Action | Trường nhận ID đầu vào theo Schema Thật | Tác động trực tiếp | Tác động gián tiếp & Tiêu thụ | Điểm kiểm quyền TRƯỚC GHI (Pre-write Gate) |
|---|---|---|---|---|---|
| `run_program` | `booleanCut`, `booleanFuse`, `booleanCommon` | `args.shape1` (string \| string[]), `args.shape2` (string \| string[]) | Cắt/gộp/giao khối solid; sinh node mới. | **Tiêu thụ node nguồn:** `consumeEditInputs()` gọi `node.parent.remove(node)` xóa các node trong `shape1`/`shape2`. | Sau khi chuẩn hóa alias (`normalizeOpArgs`) và resolve ref thành `nodeId` thật: Quét toàn bộ target. Chặn ngay nếu target thuộc `protectedNodeIds` mà không có trong `allowedConsumedNodeIds`. |
| `run_program` | `fillet`, `chamfer` | `args.shape` (string), `args.edges` (string[]) | Bo góc / vát mép cạnh solid. | Tiêu thụ node cũ, sinh node mới thay thế. | Resolve `shape` thành `nodeId` thật. Chặn nếu thuộc `protectedNodeIds` chưa được cấp phép. |
| `run_program` | `transformedMul` | `args.shape` (string) | Nhân bản hình học với ma trận mới. | Không thay đổi node nguồn (an toàn). | Cho phép (chỉ đọc hình học nguồn). |
| `run_parametric` | `boolean` | **`op.body`** (string - target), **`op.tools`** (string[] - danh sách công cụ) *(Chính xác theo schema thật `BooleanOp.tools`)* | Gộp/cắt/giao Body tham số. | `syncConsumedTools()` tiêu thụ toàn bộ các body trong mảng `tools` vào `body` đích. | Resolve `op.body` và từng phần tử trong `op.tools` thành ID thật. Chặn nếu bất kỳ ID nào thuộc nguồn được bảo vệ mà không có trong scope cho phép tiêu thụ. |
| `run_parametric` | `editFeature` | `op.body`, `op.featureId`, `op.action` (`setParameter`, `rename`, `suppress`, `moveTo`, `remove`) | Sửa/xóa/ẩn tính năng của `ParametricBodyNode`. | Tính toán lại toàn bộ chuỗi feature phía sau; có thể làm gãy tham chiếu hoặc biến dạng body nguồn. | Resolve `op.body` thành ID thật. Chặn nếu body thuộc `protectedNodeIds` và thao tác làm thay đổi hình học ngoài phạm vi duyệt. |
| `delete_node` | Xóa node | **`id`** (string) *(Schema chuẩn: trường `id`, không phải `nodeId`)* | Gọi `node.parent.remove(node)`. | Xóa node khỏi cây; mất liên kết phụ thuộc nếu node khác tham chiếu tới. | Kiểm tra `id`. Nếu `id` nằm trong `protectedNodeIds` -> **CHẶN TUYỆT ĐỐI** với lỗi `PERMISSION_DENIED`. |
| `transform_node` | Biến đổi vị trí | **`id`** (string), `translate`, `rotate`, `scale`, `matrix` | Ghi đè `node.localTransform`. | Làm lệch vị trí/hướng của đối tượng nguồn so với mốc thiết kế ban đầu. | Kiểm tra `id`. Chặn nếu không có trong `allowedModifiedNodeIds`. |
| `set_node_properties` | Sửa thuộc tính | **`id`** (string), `properties` (object) | Ghi trực tiếp lên thuộc tính node hoặc tham số hình học. | Thay đổi kích thước cốt lõi (chiều dày tường, bán kính trụ). | Kiểm tra `id`. Chặn nếu thuộc tính tác động đến hình học của node nguồn được bảo vệ. |
| `set_node_visible` | Đổi ẩn/hiện | **`id`** (string), `visible` (boolean) | Đổi cờ `visible` của node. | Ẩn đối tượng trên viewport (ảnh hưởng quan sát). | Cho phép hoặc cảnh báo nếu ẩn đối tượng mốc quan trọng. |
| `create_folder` | Tạo thư mục | `name` (string), `parentId` (string tùy chọn) | Thêm node Folder vào cây. | Thay đổi cấu trúc phân cấp cây tài liệu. | Kiểm tra `parentId` có hợp lệ và được phép ghi không. |
| `move_nodes` | Di chuyển node | **`nodeIds`** (string[]), **`targetFolderId`** (string) | Đổi cha (`parent`) của các node. | Thay đổi phân cấp cây; có thể phá vỡ nhóm chi tiết. | Quét từng phần tử trong `nodeIds`. Chặn nếu chứa node nguồn cấm di chuyển. |
| `undo` / `redo` | Hoàn tác / Làm lại | `steps` (integer tùy chọn) | Đẩy con trỏ lịch sử `History.undo()` / `redo()`. | Làm mất cả các thao tác thủ công người dùng vừa thực hiện trước đó. | Chặn không cho agent gọi `undo`/`redo` vượt quá mốc bắt đầu tác vụ (`preTaskSnapshot`). |
| `set_material` | Gán vật liệu node | **`id`** (string), `material`, `color`, `opacity`, `roughness`, `metalness` | Gán hoặc ghi đè vật liệu trên node. | Đổi nhận diện vật liệu của đối tượng (ảnh hưởng xuất khối lượng BOM). | Kiểm tra `id`. Chặn nếu đối tượng nguồn cấm đổi vật liệu. |
| `set_material_properties` | Sửa thư viện vật liệu | `name` (string), `properties` (object) | Sửa định nghĩa vật liệu toàn cục trong tài liệu. | Mọi node đang mang vật liệu này đều bị đổi theo. | Yêu cầu quyền `modify_document_materials` được duyệt rõ ràng trong kế hoạch. |
| `document_variables` | `set` hoặc `remove` | `action`, `name`, `value`, `type` | Ghi thêm hoặc xóa biến tham số toàn cục. | Mọi kích thước ràng buộc theo biến này bị biến dạng. | Chặn hành động `set`/`remove` đối với các biến đã tồn tại từ trước tác vụ. |
| `apply_array` | Nhân bản mảng | **`sourceNodeId`** (string), `count`, `step`, `direction` | Tạo ra $N$ node bản sao mới. | Tăng số lượng đối tượng trong tài liệu; tiêu tốn bộ nhớ. | Node `sourceNodeId` chỉ được đọc hình học; cấm biến đổi node gốc. |
| `run_command` | Chạy lệnh CAD | `command`, `commandKey` | Kích hoạt lệnh ứng dụng (`CommandService`). | Có thể kích hoạt lệnh gián tiếp (`modify.autoOrganizeTree`, `create.folder`) hoặc mở dialog. | Kiểm tra danh mục lệnh an toàn (`SAFE_DIRECT_COMMANDS`). Chặn toàn bộ lệnh có khả năng ghi nếu không có trong whitelist được duyệt. |
| `new_document` | Tạo tài liệu mới | `name` (string) | Tạo mới Document. | Xóa ngữ cảnh làm việc hiện tại nếu không cẩn thận. | Đã có guard kiểm tra: nếu tài liệu đang mở thì từ chối ngay. |

### 2.3. Quy tắc Chuẩn hóa và Xử lý Tham chiếu (Normalization & Ref Resolution)
Đối với `run_program`, model có thể dùng bí danh hoặc các tham chiếu tạm:
1. **Chuẩn hóa đối số (Arg Normalization):** Gọi `normalizeOpArgs(rawOp)` để chuyển các alias (ví dụ `target` -> `shape1`, `tool` -> `shape2`, `r` -> `radius`) về dạng chuẩn.
2. **Phân giải tham chiếu (Ref Resolution):** Dùng `sessionRefs(doc)` để phân giải xem chuỗi tham chiếu là:
   - Một op id mới tạo trong phiên hiện tại (an toàn nếu thuộc quyền tạo của task).
   - Hay là một `nodeId` đã tồn tại trong cây mô hình của Document.
3. **Hành vi khi chưa xác định được toàn bộ tác động (Fail-Closed / Halt-and-Explain):**
   - Nếu một thao tác chứa tham chiếu không thể phân giải chắc chắn, chứa biểu thức phụ thuộc vòng, hoặc tác động gián tiếp lên tập đối tượng chưa xác định được ranh giới:
   - **CHÍNH SÁCH BẮT BUỘC: CHẶN GHI VÀ DỪNG LẠI (Fail-Closed).**
   - Trả về mã lỗi: `INDETERMINATE_IMPACT_BLOCKED: Không thể xác định toàn bộ phạm vi đối tượng bị tác động bởi lệnh. Yêu cầu chỉ định rõ ID đối tượng cụ thể trước khi thực hiện.`

---

## 3. Phân biệt: Kiểm Quyền Trước Ghi vs Chờ Settle Sau Ghi & Xử lý Bất Đồng Bộ

Cần phân định rạch ròi 2 thời điểm kiểm soát để tránh nhầm lẫn giữa kiểm tra điều kiện tiên quyết và kiểm tra trạng thái ổn định:

```
[Tool Call từ ChatPanel hoặc Bridge]
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│  1. KIỂM QUYỀN TRƯỚC GHI (PRE-WRITE PERMISSION GATE)   │  ◄── Điểm chặn đồng bộ (Fail-Fast)
│  - Kiểm tra documentRevision không bị trôi (Drift)     │      Không tốn chi phí kernel
│  - Resolve ID & So khớp TaskScope                      │      Không sinh transaction rác
│  - Chặn ngay nếu vi phạm quyền (PERMISSION_DENIED)     │
└─────────────────┬──────────────────────────────────────┘
                  │ (Được phép)
                  ▼
┌────────────────────────────────────────────────────────┐
│  2. THỰC THI GHI VÀO DOCUMENT / KERNEL                 │
│  - Transaction.execute / TaskTransactionScope          │
│  - Thực hiện mutation (CSG, Parametric, Properties)    │
└─────────────────┬──────────────────────────────────────┘
                  │ (Handler trả về)
                  ▼
┌────────────────────────────────────────────────────────┐
│  3. CHỜ SETTLE SAU GHI (POST-WRITE SETTLEMENT)         │  ◄── Điểm đồng bộ hóa bất đồng bộ
│  - await pendingWork.whenIdle()                        │      Bảo đảm Three.js & Worker xong
│  - Bắt lỗi phát sinh muộn (Late runtime exceptions)    │      Không bị race condition
└─────────────────┬──────────────────────────────────────┘
                  │ (Hệ thống đã tĩnh)
                  ▼
┌────────────────────────────────────────────────────────┐
│  4. HẬU KIỂM TIÊU CHÍ VÀ CẬP NHẬT TRẠNG THÁI           │
│  - Vô hiệu hóa bằng chứng cũ (Invalidate Stale)        │
│  - Đo kiểm hình học độc lập (Pass / Fail / Unknown)   │
└────────────────────────────────────────────────────────┘
```

### 3.1. Điểm Kiểm tra Ngay Trước Mutation đối với Lệnh Bất Đồng Bộ
Các thao tác bất đồng bộ (tải font chữ cho 3D text, khởi tạo garlic solver cho sketch, hoặc lệnh command chạy async) có độ trễ giữa lúc nhận lệnh và lúc thực sự ghi vào Document:
- **Nguyên tắc:** Việc kiểm tra quyền và kiểm tra revision của tài liệu phải được chốt lại lần cuối **ngay trước dòng lệnh thực hiện mutation đầu tiên**, không chỉ kiểm tra lúc bắt đầu hàm async.
- **Xử lý Hủy bỏ (Cancel):** Lắng nghe tín hiệu `signal: AbortSignal`. Nếu người dùng nhấn Stop/Cancel trong lúc đang tải tài nguyên hoặc đang tính toán, hàm lập tức thoát và không mở transaction ghi.
- **Xử lý Quá hạn (Timeout):** Mọi lệnh bất đồng bộ đều có timeout trần (15 giây). Quá thời gian này, hệ thống tự động ngắt và báo lỗi timeout, ngăn chặn treo luồng.
- **Xử lý Trôi tài liệu (Drift during async):** Nếu người dùng click sửa bản vẽ trong lúc agent đang chờ tải tài nguyên, `documentRevision` sẽ tăng. Khi bước vào điểm ghi, router phát hiện revision lệch -> **HỦY BỎ GHI NGAY LẬP TỨC** và trả về lỗi `DOCUMENT_DRIFT_DURING_ASYNC_OPERATION`.
- **Chặn các đường chưa kiểm soát được:** Toàn bộ các lệnh CAD tương tác chuột, mở dialog không xác định hoặc không phân tích được side-effect đều bị chặn cứng qua whitelist `SAFE_DIRECT_COMMANDS`.

---

## 4. Cơ chế Quản lý Quyền theo Kế hoạch và Giới hạn Hoàn tác Đợt đầu

### 4.1. Quản lý Quyền theo Kế hoạch Người dùng Duyệt (Plan-Based Approval)
1. **Không tự cấp quyền (No Self-Approval):** Router hoàn toàn bỏ qua mọi trường `approved: true`, `force: true` do model tự sinh trong tham số gọi tool.
2. **Quy trình duyệt một lần:**
   - Agent đọc tài liệu ở chế độ chỉ đọc, xuất thẻ Kế hoạch nêu rõ: ID các node nguồn cần tác động, thao tác cho phép (ví dụ `booleanCut`), thao tác cấm (ví dụ cấm đổi gốc tọa độ, cấm xóa).
   - Người dùng bấm nút **[Phê duyệt Kế hoạch]** trên giao diện UI.
   - `TaskProfile` chính thức kích hoạt. Agent thực hiện toàn bộ các bước trong kế hoạch mà không cần hỏi lại từng thao tác.
3. **Điều kiện tái xác nhận:** Chỉ hỏi lại người dùng khi:
   - Thao tác phát sinh cần sửa thêm node ngoài danh sách đã duyệt ban đầu.
   - Trôi trạng thái tài liệu (`revision drift`) khiến kế hoạch không còn phù hợp.
   - Vượt quá ngân sách phục hồi hoặc kẹt lặp lỗi.

### 4.2. Thu hẹp Phạm vi "Undo Task" Đợt đầu vào Chuỗi Liên tiếp Không Xung đột
Để đảm bảo an toàn tuyệt đối cho dữ liệu của người dùng, phạm vi triển khai của Undo Task trong Đợt B và Đợt C được **thu hẹp có chủ đích**:

1. **Phạm vi hỗ trợ hoàn tác tự động (Contiguous Non-Conflicting Sequences):**
   - Hoàn tác tự động chỉ thực hiện khi toàn bộ các transaction của task nằm liên tục ở đỉnh ngăn xếp lịch sử (`history.undoTop()`), không có thao tác thủ công nào của người dùng bị chèn vào giữa, và không có đối tượng mới nào phụ thuộc vào đối tượng của task.
   - Khi thỏa mãn: Hệ thống hoàn tác tuần tự thông qua `Transaction/History` chuẩn của `@chili3d/core`, đưa tài liệu về mốc `preTaskSnapshot` một cách hoàn hảo và an toàn.
2. **Hành vi khi có thao tác người dùng xen kẽ hoặc phụ thuộc mới (Interleaved / Dependent Actions):**
   - **DỪNG HOÀN TÁC TỰ ĐỘNG NGAY LẬP TỨC (Halt Automatic Undo).**
   - Hệ thống không thực hiện hoàn tác mù quáng theo ngăn xếp (vì sẽ xóa nhầm công việc của người dùng).
   - Hiển thị thông báo minh bạch cho người dùng trên UI: *"Phát hiện bạn đã thực hiện chỉnh sửa trên bản vẽ xen kẽ trong quá trình agent làm việc. Hệ thống đã dừng hoàn tác tự động để bảo vệ các chỉnh sửa độc lập của bạn. Bạn có thể sử dụng nút Undo từng bước trên thanh công cụ hoặc tự xóa đối tượng cụ thể."*
3. **Tách riêng Selective Inversion (Hoàn tác chọn lọc):**
   - Cơ chế hoàn tác chọn lọc (đảo ngược riêng rẽ các thay đổi của agent mà vẫn giữ nguyên thay đổi xen kẽ của người dùng) được **chuyển thành một đề tài thiết kế chuyên sâu riêng biệt**. Cơ chế này đòi hỏi thuật toán phân tích đồ thị phụ thuộc (Dependency Graph) và kiểm chứng toán học nghiêm ngặt để chứng minh không làm rách cấu trúc cây mô hình trước khi đưa vào áp dụng.

---

## 5. Giới hạn Phạm vi Chứng minh của Phép Hậu kiểm và Khung Dung sai Đề xuất

### 5.1. Giới hạn Vật lý và Hình học của Phép Kiểm tra Ô Mở / Lỗ Xuyên (Aperture Verification)
Việc kiểm tra lỗ mở trên tường (hoặc lỗ xuyên trên bất kỳ solid nào) có các giới hạn hình học cụ thể cần được thừa nhận minh bạch:

```
                    MÔ HÌNH CÁC CA LỖ MỞ VÀ GIỚI HẠN PHÉP KIỂM
  
  Ca A: Ô cửa chạm đáy (Z=0)        Ca B: Hốc mù (Blind Pocket)      Ca C: Màng mỏng (Sliver Membrane)
  ┌────────────────────────┐        ┌────────────────────────┐       ┌────────────────────────┐
  │         TƯỜNG          │        │         TƯỜNG          │       │         TƯỜNG          │
  │   ┌────────────────┐   │        │   ┌────────────────┐   │       │   ┌────────────────┐   │
  │   │  Ô MỞ THÔNG    │   │        │   │   HỐC MÙ 150mm │   │       │   │                │   │
  │   │                │   │        │   │ (Đáy sau kín)  │███│       │   │  KHOẢNG RỖNG   │█  │◄─ Màng 0.01mm
  └───┴────────────────┴───┘        └───┴────────────────┴───┘       └───┴────────────────┴───┘
     ▲ Mặt sàn (Z=0)                   ▲ Lỗ không thông ra sau          ▲ Mắt lưới điểm mẫu có thể
       Không có bậu cửa dưới             Điểm trước rỗng, sau đặc         bị lọt qua khe màng mỏng
```

1. **Ca Ô cửa chạm đáy (Bottom-Sill / Flush Floor Doors):**
   - Khi ô cửa mở sát mặt sàn ($Z = 0$), khối cắt tiếp xúc đồng phẳng với mặt đáy của tường.
   - *Giới hạn:* Vòng dây biên đáy (bottom wire) của ô cửa trùng với đường biên đáy của bức tường. Thuật toán tìm vòng chu trình kín 4 cạnh độc lập trên mặt đứng sẽ thất bại nếu kỳ vọng một lỗ lọt lòng (closed inner loop).
   - *Xử lý:* Phép kiểm tra hình học phải hỗ trợ trường hợp "vòng biên hở đáy" (U-shaped loop), trong đó 3 cạnh gồm 2 má cửa (jambs) và 1 lanh-tô (lintel) tiếp giáp với mặt đáy của tường.
2. **Ca Hốc mù (Blind Pockets / Cavities):**
   - Khối cutter không đủ chiều sâu (ví dụ sâu 150mm trên tường dày 200mm), hoặc cutter bị lệch trục khiến mặt sau của tường vẫn là một tấm liền kín.
   - *Giới hạn:* Nếu chỉ kiểm tra độ giảm thể tích ($\Delta V > 0$) hoặc chỉ lấy mẫu điểm ở mặt trước, hệ thống sẽ bị đánh lừa.
   - *Xử lý bắt buộc:* Các điểm kiểm tra bắn tia (ray-probing) phải được bố trí xuyên suốt qua cả bề dày tường (xuyên qua cả mặt trước và mặt sau). Đồng thời, **bắt buộc phải có kiểm tra vòng biên mặt sau (back face wire loop)**. Nếu mặt sau không xuất hiện vòng mở, hệ thống kết luận: `FAIL: Blind pocket detected, not a through-opening`.
3. **Ca Màng mỏng (Thin Membranes / Slivers):**
   - Sai số thuật toán tiếp xúc mặt của kernel (tolerance $1\times 10^{-3}\text{ mm}$) có thể để lại một màng solid cực mỏng ($0.01\text{ mm}$) che kín một đầu lỗ.
   - *Giới hạn nghiêm ngặt:* **Lấy mẫu 15 điểm rời rạc hoàn toàn không thể loại trừ sự tồn tại của màng mỏng** nếu các điểm mẫu không may rơi lệch khỏi màng.
   - *Phạm vi chứng minh công bố rõ ràng:*
     - Lấy mẫu điểm chỉ chứng minh: *"15 điểm tọa độ được khảo sát là rỗng"*.
     - Không tự động suy diễn rằng toàn bộ lỗ là thông suốt tuyệt đối.
     - Khi chưa có kiểm tra phân tách mặt tô pô (Face Topology Analysis), tiêu chí "Tính thông suốt hoàn toàn của ô mở" phải giữ ở trạng thái **`unknown`**.

### 5.2. Khung Dung sai Kỹ thuật (Đề xuất Cần Reviewer Phê duyệt)
*(Lưu ý: Đây là bảng dung sai do nhóm thiết kế đề xuất dựa trên quy chuẩn kỹ thuật CAD, chờ Reviewer chính thức phê duyệt trước khi cài đặt vào mã nguồn)*:

| Nhóm quy mô công trình / chi tiết | Phạm vi kích thước ($L$) | Dung sai chiều dài đề xuất | Dung sai góc đề xuất | Dung sai thể tích đề xuất |
|---|---|---|---|---|
| **1. Kiến trúc / Xây dựng** (Tường, Sàn, Cột, Dầm) | $L > 1000\text{ mm}$<br>$L \le 1000\text{ mm}$ | **$\pm 1.0\text{ mm}$** *(cần duyệt)*<br>**$\pm 0.5\text{ mm}$** *(cần duyệt)* | **$\pm 0.1^\circ$** *(cần duyệt)* | **$\pm 0.1\%$** thể tích tính toán |
| **2. Nội thất / Đồ gỗ** (Bàn, Tủ, Đố cửa, Cánh) | $50\text{ mm} \le L \le 1000\text{ mm}$<br>Mộng ghép, khớp nối | **$\pm 0.2\text{ mm}$** *(cần duyệt)*<br>**$\pm 0.1\text{ mm}$** *(cần duyệt)* | **$\pm 0.2^\circ$** *(cần duyệt)* | **$\pm 0.5\%$** |
| **3. Cơ khí / Chế tạo** (Lỗ bu-lông, Rãnh then) | $L < 100\text{ mm}$<br>Bo góc (fillet), Vát (chamfer) | **$\pm 0.05\text{ mm}$** *(cần duyệt)*<br>**$\pm 0.01\text{ mm}$** *(cần duyệt)* | **$\pm 0.05^\circ$** *(cần duyệt)* | Phụ thuộc BRep tolerance |
| **4. Ngưỡng số học Kernel OCCT** (Coincidence) | Điểm trùng, cạnh đồng phẳng | **$1\times 10^{-5}\text{ mm}$**<br>Dot product $> 0.9999$ | Không áp dụng | $1\times 10^{-6}$ |

---

## 6. Phân định Bằng chứng: Giả lập, Thực nghiệm và Khảo sát Baseline

Để đảm bảo tính chính xác và trung thực tuyệt đối của báo cáo kỹ thuật, toàn bộ các kết quả thử nghiệm được phân loại thành 3 nhóm rõ ràng:

### 6.1. Nhóm Bằng chứng Giả lập (Synthetic / Scripted Harness Evidence)
Các kết quả này thu được từ bộ giả lập `ScriptedLLMProvider` trong tệp [`packages/ai/test/agentLoopOfflineHarness.test.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/test/agentLoopOfflineHarness.test.ts) (chạy offline không có model thật):
- *Bản chất:* Là bằng chứng chứng minh **luồng điều khiển xác định (deterministic control flow)** của harness.
- *Kết quả:* 10/10 kịch bản giả lập đạt PASS (Thời gian chạy: 1.90s, mã thoát `0`).
- *Ý nghĩa:* Chứng minh harness có khả năng chặn lượt gọi khi thiếu công cụ đo và phát hiện việc đo nhầm ID cũ của lượt trước trong điều kiện kịch bản được lập trình sẵn. Không đại diện cho trí thông minh hay tỷ lệ thành công của LLM thật ngoài đời.

### 6.2. Nhóm Bằng chứng Hình học Kernel Thật (Real OCCT Kernel Evidence)
Các kết quả thu được từ tệp [`packages/ai/test/devAppDoorFlow.kernel.test.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/test/devAppDoorFlow.kernel.test.ts) chạy trực tiếp trên thư viện WebAssembly OCCT thật:
- *Bản chất:* Chứng minh năng lực tính toán hình học thực tế của C++ kernel trong môi trường Node/Browser.
- *Số liệu đính chính chính xác 100% theo log chạy thực tế:*
  - Tường nguồn ban đầu ($1000 \times 200 \times 2500\text{ mm}$): $V_{\text{before}} = \mathbf{500,000,000.00\text{ mm}^3}$.
  - Khối cắt ô cửa ($800 \times 300 \times 2000\text{ mm}$): $V_{\text{cutter}} = \mathbf{480,000,000.00\text{ mm}^3}$.
  - Thể tích phần giao bị cắt bỏ: $\Delta V = 800 \times 200 \times 2000 = \mathbf{320,000,000.00\text{ mm}^3}$.
  - Thể tích tường còn lại sau khi cắt: $V_{\text{after}} = 500\text{M} - 320\text{M} = \mathbf{180,000,000.00\text{ mm}^3}$.
  - Bắn tia 15 điểm mẫu: 15/15 điểm sạch không chứa vật liệu solid.

### 6.3. Tuyên bố về Trạng thái Quản trị Hiện tại (Baseline Clarification)
> **Tuyên bố quan trọng:** Các bài kiểm tra hiện có (`agentLoopOfflineHarness.test.ts` và `devAppDoorFlow.kernel.test.ts`) **chỉ đóng vai trò là mốc cơ sở (baseline)** để kiểm tra môi trường tính toán. **Hệ thống Quản trị Quyền và Hậu kiểm theo Tiêu chí (Design Governance & Verification Gate) theo yêu cầu của TASK-40 CHƯA TỒN TẠI trong mã nguồn** và sẽ được xây dựng mới hoàn toàn trong Đợt B và Đợt C.

---

## 7. Báo cáo Môi trường & Đo đạc Công cụ Thực tế

Dữ liệu thực nghiệm thực tế tại thời điểm hoàn thiện Đợt A trên hệ thống:

| Lệnh kiểm tra | SHA mốc thực hiện | Thời điểm (Local GMT+7) | Mã thoát (Exit Code) | Kết quả chi tiết |
|---|---|---|---|---|
| `npx rstest packages/ai/test/agentLoopOfflineHarness.test.ts` | `1a527bacdcee` | 2026-11-06 12:57:40 | `0` | 10 passed (1.90s) — Bằng chứng giả lập |
| `npx rstest packages/ai/test/devAppDoorFlow.kernel.test.ts` | `1a527bacdcee` | 2026-11-06 12:57:47 | `0` | 6 passed (1.46s) — Bằng chứng kernel thật |
| `npm run check` (Biome lint & style) | `1a527bacdcee` | 2026-11-06 12:57:33 | `0` | 1603 files checked, 0 errors |
| `npm run build` (Rspack Core + All Plugins) | `1a527bacdcee` | 2026-11-06 12:59:32 | `0` | Production build hoàn tất thành công |

---

## 8. Quyết định Reviewer đã chốt (Đợt B) — 06/11/2026

| # | Quyết định | Trạng thái Đợt B |
| --- | --- | --- |
| 1 | **Một đường kiểm soát chung** ChatPanel + bridge (`governTools` trên `buildTools()` → `createToolHost`). Kiểm quyền từng op sau chuẩn hóa/resolve ID thật, ngay trước mutation. Hỗ trợ batch tạo rồi tham chiếu. Tác động không phân tích được → `INDETERMINATE_IMPACT_BLOCKED`. | Đã triển khai |
| 2 | **Node nguồn mặc định được bảo vệ.** Chỉ sửa/xóa/tiêu thụ khi app ghi nhận quyền từ kế hoạch người dùng duyệt (`approveTaskPlan`). Model/Markdown không tự cấp quyền. Áp dụng con cháu, phụ thuộc, cấu trúc cây. | Đã triển khai |
| 3 | **Undo Task** chỉ chuỗi liên tiếp không xung đột; xen kẽ / phụ thuộc mới / trạng thái không chắc → dừng và thu hồi quyền kế hoạch (`PLAN_INVALIDATED`). Selective inversion tách đề tài riêng. | Đã triển khai |
| 4 | **Lưu quy tắc tối thiểu:** `ObjectStorage` account/document; thiếu liên kết → default-safe. Kênh khác để đợt sau. Sanitization ≠ chống prompt injection. | Đã triển khai |
| 5 | **Lệnh bất đồng bộ:** chỉ khi kiểm soát quyền tại thời điểm ghi + vòng đời hoàn tất/hủy. Timeout **không** chứng minh mutation đã dừng. Chặn đường chưa hỗ trợ (`SAFE_DIRECT_COMMANDS`). | Đã triển khai |
| 6 | **Không áp bảng dung sai Mục 5.2** như tiêu chuẩn đã duyệt. Hậu kiểm nâng cao = Đợt C. UI ghi đúng cơ chế có hiệu lực (bảo vệ nguồn + cổng quyền + Undo chuỗi; chưa có criteria/tolerances). | Đã tuân thủ |

---

## 9. Bàn giao Đợt B (Waiting Reviewer SHA)

### 9.1. Mã có hiệu lực
- `packages/ai/src/governance/*` — router, gate, source protection, task profile, plan approval (bind/confirm/invalidate), rules store, undo task, tool matrix, status
- `packages/ai/src/tools/index.ts` — `buildTools()` = `governTools(buildUngovernedTools())`
- `packages/ai/src/tools/capabilityEngine.ts` — export `normalizeOpArgs`, `lookupSessionRefNodeId`
- `packages/ai/src/tools/commandTools.ts` — timeout async trung thực; drift check trước ghi
- `packages/ai/src/llm/prompt.ts` + `chatPanel.ts` — nạp quy tắc / status Đợt B; thẻ duyệt gắn document; invalidate khi đổi tài liệu / hủy lượt

### 9.2. Ma trận công cụ
Xem `BATCH_B_TOOL_MATRIX` trong `packages/ai/src/governance/toolMatrix.ts` (gated / supported / read).

### 9.3. Kiểm thử
`packages/ai/test/governance/batchBGovernance.test.ts` (+ `host.test.ts`): vượt quyền ChatPanel + bridge, mutation query metadata, ownership theo document, thẻ stale (đổi tài liệu / sửa nguồn / hủy / thay thẻ), ghi sau xen kẽ → `PLAN_INVALIDATED`, fingerprint quy tắc (cùng độ dài Markdown / cùng `Date.now` / thêm `protectedNodeIds`), đổi quy tắc khi thẻ chờ và sau duyệt.

### 9.4. Triển khai kiểm tra Đợt B (06/11/2026)
- GitHub `origin/dev` = tip `c5caebd6` (code `b7db4591`)
- VPS `http://136.66.95.155` phục vụ cùng tip; `/version.json` ↔ `/deploy-version.json` ↔ disk đồng bộ
- **Đợt B đã bảo vệ phạm vi.** Hậu kiểm tiêu chí / bảng dung sai = Đợt C (**chưa hiệu lực**).
- Phương án Đợt C: [`TASK-40-batch-C-implementation-plan.md`](./TASK-40-batch-C-implementation-plan.md) — chờ Reviewer duyệt trước khi code

---
*Đợt B đã triển khai kiểm tra trên VPS. Không tuyên bố hậu kiểm Đợt C.*
