# TASK-32: Điều tra AI báo hoàn thành Boolean Cut nhưng hình học không đổi

> **Trạng thái:** `[~] IN_PROGRESS` (chờ triển khai VPS và nghiệm thu thực tế)
> **Ưu tiên:** P0 theo phản ánh người dùng
> **Phụ trách:** AI Thực thi (Worker)
> **Phạm vi:** Điều tra và sửa luồng Boolean Cut do `run_program` thực thi; không suy diễn lỗi kernel khi chưa có ca tái hiện.

## 1. Hiện tượng

Người dùng yêu cầu AI đục cửa trên tường có sẵn. AI trả lời thông số cửa và nói node cũ đã được thay bằng node mới, nhưng nhìn viewport thì tường vẫn nguyên, không thấy lỗ cửa.

Ảnh hội thoại cho thấy AI đã gọi `get_document_state` và `get_selection` để kiểm tra sau khi người dùng hỏi lại. Ảnh không cho thấy một lần gọi `run_program` trong lượt kiểm tra đó; chưa đủ bằng chứng để xác nhận lần cắt trước đã chạy thành công hay đã tạo thay đổi hình học.

AI sau đó giải thích có thể do góc nhìn/zoom, nhưng chưa cung cấp phép đo hay ảnh sau khi bỏ chọn. Lời giải thích này chưa được xác minh: nếu nhìn gần vuông góc mặt tường thì lỗ xuyên tấm phải nhìn thấy; cần xác nhận hướng camera thật trước khi kết luận. Selection fill có thể che chi tiết, vì vậy phải chụp thêm ảnh khi đã bỏ chọn.

## 2. Bằng chứng từ mã hiện tại

1. **Kiểm tra Solid của lệnh Boolean trên ribbon không áp dụng cho AI.** `packages/app/src/commands/boolean.ts` kiểm tra `checkShape()` và `shapeType` trong `BooleanOperate.booleanOperate()`. Tuy nhiên `packages/ai/src/tools/capabilityEngine.ts` gọi trực tiếp capability `booleanCut` trên `shapeFactory`, nên không đi qua các pre-flight check trong `BooleanOperate`.
2. **AI có thể báo kết quả tạo node mà không chứng minh vùng bị trừ.** `runShapeOp()` coi `Result.ok(shape)` là thành công, tiêu thụ input và thêm node kết quả. Prompt có gợi ý tự kiểm tra bằng `shape.volume`, nhưng không có cơ chế bắt buộc đo thể tích trước/sau. Một phép cut không có phần giao có thể cho kết quả hợp lệ nhưng hình học nhìn giống hệt target.
3. **Cần xác minh transform ở luồng AI.** `resolveRefEntry()` lấy `node.shape.value`; đường boolean của AI chuyển các shape này cho factory mà không áp `node.worldTransform()`. Các lệnh Boolean của app áp transform cho target và tools qua `transformdFirstShape()` / `shape.transformedMul(s.transform)`. Nếu một node được di chuyển bằng transform thay vì có tọa độ sẵn trong geometry, AI có thể tính Boolean ở sai vị trí.
4. **Prism profile chưa chắc thành solid.** `closeProfileParam()` chỉ đổi wire/edge khép kín thành face; profile hở vẫn được chuyển nguyên trạng. Cần kiểm tra shape type đầu ra của dao cắt AI trước khi Boolean, vì đây là đường riêng và không nhận pre-flight từ TASK-28.

Các điểm trên xác nhận luồng AI thiếu một số bảo vệ/kiểm chứng; **chưa xác định điểm nào là nguyên nhân của bản vẽ cụ thể**.

## 3. Việc cần làm

1. Dùng fixture riêng có tường Solid và dao cắt Solid, kiểm tra cut giao nhau, không giao nhau, giao một phần, profile đùn Shell, cùng trường hợp node có world transform khác identity.
2. So sánh kết quả AI với lệnh Boolean của app: cùng hình học và cùng world placement phải cho kết quả tương đương.
3. Đảm bảo `booleanCut` báo lỗi rõ khi target/tool không phải solid volume hoặc geometry invalid.
4. Sau cut thành công, so sánh thể tích target trước và kết quả sau. Nếu người dùng yêu cầu đục xuyên mà thể tích không giảm đáng kể, không báo hoàn thành; trả chẩn đoán hoặc yêu cầu điều chỉnh vị trí/hướng/độ sâu dao.
5. Kiểm tra danh sách `created`/`removed`, bounding box và scene update để bảo đảm node thay thế được hiển thị đúng.
6. Thêm test hồi quy trong `packages/ai/test/capabilityEngine.test.ts`, và test kernel/app phù hợp cho geometry thật. Không thay đổi hành vi của các Boolean hợp lệ.
7. Cập nhật prompt/kỹ năng để phân biệt rõ “kernel trả shape hợp lệ” với “đã tạo lỗ theo yêu cầu”; chỉ được tuyên bố xong khi phép đo hậu kiểm xác nhận.
8. Không kết luận do camera/zoom nếu chưa: bỏ chọn node, chụp ảnh viewport mới, kiểm tra volume/bounding box của shape kết quả, và xác nhận phép `booleanCut` thực sự đã được gọi trong lịch sử công cụ.

## 4. Điều kiện nghiệm thu

- Cut giao nhau tạo ra kết quả có thể đo xác nhận thể tích giảm và input được thay đúng.
- Cut không giao nhau không được AI báo là đã đục lỗ thành công.
- Transform của cả target và cutter được xử lý theo world space như lệnh Boolean trên ribbon.
- Shell/profile hở bị chặn trước kernel với thông báo chỉ rõ node và loại shape.
- `npm run check`, `npm run test`, `npm run build` pass; ghi log thực thi, SHA và trạng thái deploy theo quy trình trong `ROADMAP.md`.
- Chỉ chuyển sang `[?] WAITING_REVIEW`; người dùng nghiệm thu mới chuyển `[x] DONE`.

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày giờ thực hiện:** 03/11/2026.
- **Trạng thái:** `[~] IN_PROGRESS` (chờ triển khai VPS và nghiệm thu thực tế, tuân thủ quy tắc không tự chuyển `[?] WAITING_REVIEW` khi chưa deploy VPS).
- **Trạng thái Deploy:** Không deploy VPS trong lượt này (theo yêu cầu người dùng).

### Các nguyên nhân kỹ thuật đã tái hiện và xử lý:
1. **Kernel OCCT trả `Result.ok(target)` khi cutter không giao target:** Trong OpenCASCADE, khi dao cắt không giao với vật thể đích, `booleanCut([target], [tool])` trả về `Result.ok(target)` với thể tích target hoàn toàn không thay đổi. Luồng AI trước đây chỉ kiểm tra `Result.ok`, xóa target cũ và tạo node mới giống hệt, khiến tường trông như không đổi.
2. **Bỏ sót world transform:** Các node trong scene graph có thể mang `worldTransform` khác identity (do di chuyển, xoay). Lệnh ribbon luôn gọi `transformedMul(node.worldTransform())`, trong khi luồng AI trước đây lấy thẳng `node.shape.value` (tọa độ local). Khi AI tạo dao cắt ở tọa độ world (theo mắt nhìn), dao cắt và tường local lệch vị trí hoàn toàn -> không giao nhau.
3. **Profile hở đùn thành Shell:** Khi wire profile không khép kín, `prism` tạo ra `Shell` thay vì `Solid`. Đưa Shell vào boolean solid khiến kernel không thể trừ khối.
4. **Compound chứa hỗn hợp Solid và Shell/Face:** Compound chứa cả Solid và Shell nếu đưa vào boolean sẽ làm sai hỏng hoặc không hợp lệ hình học.
5. **Cắt không xuyên tường / Cắt lệch / Khuyết mép (blind cut, misaligned, edge notch):**
   - Không coi việc chỉ có bounding box hoặc thể tích giảm là đủ để xác nhận cắt xuyên.
   - Khi shape không có phương thức `containsPoint` để kiểm chứng điểm vật liệu, trả về `{ throughVerified: false, status: "unverified", reason: ... }`, tuyệt đối không gắn `throughVerified: true`.
   - Khi dao cắt cắt phạm vào mép ngoài của tường (edge notch) thay vì tạo lỗ kín xuyên tâm, trả về trạng thái `unverified`.
   - Khi dao cắt đục không xuyên qua hoặc bị lệch: lưới dò 15 điểm (3 độ sâu 25%, 50%, 75% $\times$ 5 vị trí ngang) phát hiện vật liệu còn sót lại, ném lỗi và báo `Status: unverified`.

### Danh sách các thay đổi chính:
1. **`packages/core/src/shape/shapeFactory.ts` & `packages/wasm/src/factory.ts` & `packages/ai/src/tools/capabilities.generated.ts`:**
   - Bổ sung tham số tùy chọn `throughCut?: boolean` vào định nghĩa interface `booleanCut(...)`.
   - Chạy codegen đồng bộ `shapeCapabilities` và `capabilitiesSource` trong `capabilities.generated.ts`. Giúp model và skill `modeling-api` nhận diện chính xác cú pháp gọi `throughCut: true`.
2. **`packages/ai/src/tools/capabilityEngine.ts`:**
   - Điều hướng riêng các phép toán Boolean (`booleanCut`, `booleanFuse`, `booleanCommon`).
   - Hàm `isSolidVolume()`: Kiểm tra nghiêm ngặt `ShapeTypes.solid`, `ShapeTypes.compoundSolid`, và `ShapeTypes.compound` phải có mọi direct sub-shape là solid volume (`directSubShapes().every(isSolidVolume)`). Loại bỏ hoàn toàn fallback `ShapeTypes.shape`.
   - Áp dụng world transform: Nếu `node instanceof VisualNode` và `worldTransform` khác identity, chuyển shape về world space bằng `shape.transformedMul(worldTransform)`.
   - Quản lý vòng đời bộ nhớ (Memory Lifecycle): Toàn bộ shape tạm thời sinh ra bởi `transformedMul()` và uncommitted result shape được theo dõi trong `tempShapesToDispose` và giải phóng triệt để qua `try ... finally`. Document input shapes (`entry.value`) không bao giờ bị giải phóng, bảo đảm an toàn khi rollback.
   - Sai số thể tích thích ứng (Adaptive Volume Tolerance): `volTol = totalTargetVolume > 0 ? Math.min(1e-5, Math.max(1e-12, totalTargetVolume * 1e-6)) : 1e-5;`. Xử lý chính xác từ chi tiết siêu nhỏ ($< 10^{-5}$ mm³) tới mô hình lớn.
   - Hậu kiểm đục xuyên tường nghiêm ngặt (`verifyThroughCut`):
     + Kiểm tra ranh giới dao cắt bao trùm 2 mặt đối diện theo chiều dày tường.
     + Nhận diện cắt khuyết mép (edge notch): từ chối xác minh xuyên tường nếu dao cắt cắt vào biên cạnh bên của tường.
     + Kiểm tra `resultShape.containsPoint`: nếu shape không hỗ trợ truy vấn điểm, trả về `throughVerified: false, status: "unverified"`.
     + Lưới dò đa điểm (15 điểm thăm dò: 3 lát cắt độ sâu 25%, 50%, 75% kết hợp 5 vị trí ngang: tâm và 4 góc phần tư). Nếu phát hiện điểm đặc vật chất còn tồn tại, ném lỗi kèm tọa độ cụ thể và trạng thái `unverified`.
     + Chỉ trả về `{ throughVerified: true, status: "verified", penetrationAxis, probedPointsCount: 15 }` khi toàn bộ 15 điểm rỗng hoàn toàn.
3. **`packages/app/src/commands/boolean.ts`:**
   - Đồng bộ logic `isSolidVolume()`: loại bỏ fallback `ShapeTypes.shape` và kiểm tra chặt chẽ `directSubShapes()`.
4. **`packages/ai/src/skills/modelingRecipes.ts`, `errorRecovery.ts`, `prompt.ts`:**
   - Hướng dẫn rõ ràng về quy chuẩn đục cửa/xuyên tường: cutter phải vượt quá cả 2 mặt đối diện theo chiều dày tường và dùng `throughCut: true`.
   - Cấm đổ lỗi cho camera/zoom khi chưa có bằng chứng hình học (phải bỏ chọn node, đo bounding box và kiểm tra volume).
5. **Kiểm thử hồi quy:**
   - `packages/ai/test/capabilityEngine.test.ts`: Thêm 5 ca kiểm thử phân biệt rõ ràng:
     + Ca 1: Cắt xuyên đúng vùng (thành công xác minh qua 15 điểm rỗng, `throughVerified: true`, `status: "verified"`).
     + Ca 2: Blind cut (dao cắt không bao trùm chiều dày, báo lỗi `Status: unverified`).
     + Ca 3: Cutter lệch còn sót vật liệu bên trong (phép dò điểm phát hiện vật liệu còn tồn tại, báo lỗi `Status: unverified`).
     + Ca 4: Cắt khuyết mép (trả về `{ throughVerified: false, status: "unverified", reason: ... }`).
     + Ca 5: Shape không có `containsPoint` (trả về `{ throughVerified: false, status: "unverified", reason: ... }`).
   - `packages/wasm/test/factory.test.ts`: 8 kernel tests cho geometry thật (giao nhau, không giao nhau, partial, world transform, open profile Shell, micro-target volume, through cut vs blind pocket, mixed compound).

### Lưu ý nghiệm thu & Giới hạn hiện tại:
- Do người dùng không đính kèm file vẽ CAD cụ thể (`.chili3d` hoặc file JSON lịch sử thao tác) lúc phát sinh lỗi ban đầu, việc xác minh trên bản vẽ cụ thể của khách hàng vẫn cần người dùng tự kiểm tra lại trong môi trường thực tế với mô hình cụ thể của mình.
- Mọi trường hợp Boolean Cut thông thường không yêu cầu `throughCut` vẫn hoạt động nguyên vẹn, không bị ảnh hưởng.

### Kết quả kiểm tra chất lượng cuối cùng:
- `npm run check`: **Mã thoát 0** (Biome lint & format 0 lỗi).
- `npm run test`: **Mã thoát 0** (593 test files passed, 1 skipped; 10,059 tests passed, 1 skipped; 27 node server tests passed).
- `npm run build`: **Mã thoát 0** (Rspack compile thành công toàn bộ bundle và plugins; 2 warnings khuyến cáo dung lượng Three.js/WASM).
