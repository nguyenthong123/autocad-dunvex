# Kế hoạch plugin Thư viện chi tiết Dunvex CAD

Trạng thái **Đặc tả giao việc**. Mục tiêu là chọn một mẫu lam hoặc tấm ốp có quy cách, đặt lên mặt vách, chỉnh chiều dài và nhân bằng Array hiện có. Dùng một mẫu thực tế có tiết diện và bước lắp được xác nhận để nghiệm thu. Mẫu giả lập phải ghi rõ.

## Quy trình tham khảo

- [AutoCAD Tool Palettes](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-6D1EE849-DF42-472D-BE3F-53B1F8B19C86.htm) cho kéo block từ bảng công cụ, bắt điểm khi đặt và xử lý đơn vị.
- [SketchUp Inserting Components](https://help.sketchup.com/en/sketchup/inserting-components) cho chọn mẫu rồi bấm đặt. [SketchUp Components](https://help.sketchup.com/en/sketchup/components) phân biệt định nghĩa dùng chung với bản chèn và cho tách bản riêng để sửa.
- [Onshape Insert Parts and Assemblies](https://cad.onshape.com/help/Content/Assembly/insert_parts_and_assemblies.htm) dùng hệ trục lắp ghép khi đặt. [Onshape Assembly Linear Pattern](https://cad.onshape.com/help/Content/Assembly/assembly_linear_pattern.htm) xác định hướng, khoảng cách và số lượng khi nhân.

## Tích hợp Dunvex

Đọc hướng dẫn plugin trong docs/manual/10-settings-plugins.md. Tái dùng mẫu manifest, lệnh và Ribbon từ plugins/helloworld-js hoặc plugins/helloworld-ts. Kiểm PluginManager và đường nạp URL ở web. Bàn giao gói .chiliplugin để kéo vào app thử và hướng dẫn nạp qua URL khi được triển khai. Kéo file plugin là bước nạp tiện ích. Kéo thẻ mẫu trong bảng là bước chèn chi tiết do plugin cung cấp.

Đối chiếu packages/app/src/commands/modify/array.ts và cơ chế copy/instance trước khi chọn loại node. Dùng bản thử đầu tiên để chứng minh node chèn có thể chỉnh kích thước, serialize, mở lại và dùng Array. Ưu tiên các kiểu node được app hỗ trợ sẵn. Nếu cần kiểu dữ liệu lưu mới, đánh giá tác động tương thích bản vẽ và quy tắc documentVersion trước khi triển khai.

## Luồng sử dụng

1. Thẻ Tiện ích mở rộng mở bảng Thư viện chi tiết. Thẻ mẫu hiển thị ảnh, tên, mã quy cách, tiết diện, chiều dài mặc định, vật liệu và bước lắp theo mm. Dữ liệu danh mục có mã mẫu ổn định và phiên bản.
2. Kéo thẻ vào vùng vẽ hoặc bấm Chèn rồi chọn mặt. Dùng chung lệnh đặt với preview, bắt điểm và xác nhận. Lấy mặt phẳng vách từ điểm chọn, pháp tuyến và trục đứng tài liệu. Chiếu trục đứng lên mặt để xác định ốp đứng, lấy trục vuông góc trong mặt để xác định ốp ngang. Cho đảo đầu thanh và kiểm phía tiếp xúc. Với mặt cong hoặc hướng không xác định, báo rõ và yêu cầu chọn mặt phẳng hay hướng hợp lệ. Hủy preview phải dọn tài nguyên.
3. Đặt tại điểm neo đầu thanh. Chỉnh chiều dài bằng tham số dựng hình từ tiết diện. Đổi chiều dài phải giữ bề rộng, độ dày, biên dạng sóng và điểm neo. Phân biệt vật liệu hiển thị với hình học và quy cách. Bản chèn sửa độc lập với mẫu thư viện và bản chèn khác.
4. Dùng Array hiện có theo trục vuông góc với chiều dài trong mặt vách. Hiển thị bước lắp từ quy cách, phân biệt bước với bề rộng hữu dụng, khe hoặc hèm. Ghi rõ số lượng tính cả mẫu gốc hay chỉ bản sao theo hành vi lệnh thật. V1 chỉnh chiều dài trước khi nhân. Chỉ cam kết cập nhật đồng loạt nếu đã kiểm được liên kết qua sửa, Undo và mở lại.
5. Ghi chèn và sửa bằng transaction chuẩn. Chi tiết đã chèn phải mở được từ bản vẽ sau khi tải lại mà không phụ thuộc vào việc lấy lại catalog. Lưu chi tiết tùy ý từ dự án vào thư viện và đồng bộ danh mục giữa máy là đợt sau.

## Nghiệm thu

- Trên Chrome mở dự án thử, nạp plugin, đặt cùng một mẫu trên vách đứng theo hai hướng. Kiểm vị trí và chiều mặt tiếp xúc, thử thêm vách xoay so với trục thế giới. Kiểm kéo thả và chọn rồi bấm đặt.
- Đổi chiều dài, đo lại chiều dài và tiết diện, kiểm điểm neo giữ nguyên. Nhân mảng, đo bước và số lượng, xác nhận hình học vách cùng mẫu gốc giữ nguyên. Kiểm Undo/Redo, hủy đặt và mở lại bản vẽ sau tải trang.
- Bàn giao SHA, file plugin, cách nạp và video thao tác từ thư viện đến Array. Ghi rõ giới hạn đã kiểm và chi phí hiển thị khi nhân theo số lượng đại diện cho vách thực tế. Giữ WAITING_REVIEW trước khi đưa lên VPS.
