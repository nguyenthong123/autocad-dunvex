# Sổ tay hướng dẫn Chili3D / Chili3D Pro

Áp dụng cho **Chili3D v0.8.0** (phiên bản định dạng tài liệu **0.7.1**), bao gồm các hướng dẫn chỉnh sửa trực tiếp (direct editing) cho **Chili3D Pro v0.8**. Hướng dẫn vận hành chủ yếu dựa trên giao diện tiếng Trung giản thể, một số ví dụ chức năng giữ nguyên giao diện tiếng Anh.

Chili3D là phần mềm 3D CAD hoạt động hoàn toàn trên trình duyệt web: nhân dựng hình OpenCascade (OCCT) được biên dịch sang WebAssembly, khung nhìn được kết xuất bởi Three.js. Phần mềm tích hợp **dựng hình trực tiếp (direct modeling)**, **dựng hình tham số (parametric modeling)** và **dựng hình bằng AI (AI modeling)** trong cùng một tài liệu, cùng một khung nhìn và cùng một ngăn xếp hoàn tác (undo stack), cho phép chuyển đổi linh hoạt giữa ba phương pháp bất kỳ lúc nào.

Chili3D Pro phát triển thêm khả năng **chỉnh sửa trực tiếp (direct editing)**: nhấp đúp vào mô hình để vào chế độ chỉnh sửa, trực tiếp sửa đổi các cạnh, mặt và hình học cục bộ của nút có thể chỉnh sửa (editable node). Cách thức truy cập, ảnh hưởng của việc chuyển đổi và quy trình lệnh đầy đủ xem tại [Chương 13](13-pro-direct-editing.md).

![Chi tiết cơ khí tham số và danh sách tính năng (giao diện tiếng Anh)](images/00-overview.png)

*Chi tiết cơ khí tham số: hình học, cây dự án và danh sách tính năng (feature list) nằm trong cùng một tài liệu (giao diện tiếng Anh).*

## Cách đọc cuốn sổ tay này

- **Lần đầu sử dụng**: Bắt đầu từ [Chương 1 Bắt đầu nhanh](01-getting-started.md), từng bước thực hành tạo chi tiết đầu tiên.
- **Muốn hoàn thành một tác vụ trọn vẹn**: Xem trực tiếp [Chương 12 Quy trình làm việc điển hình](12-workflows.md), bao gồm tấm gá lắp tham số, kiểm tra/sửa chữa mô hình nhập vào, cộng tác cùng AI và kiểm tra bàn giao.
- **Muốn dùng tính năng Pro chỉnh sửa trực tiếp**: Đọc [Chương 13 Pro chỉnh sửa trực tiếp](13-pro-direct-editing.md), trước tiên hãy xác nhận tác động khi chuyển đổi sang nút có thể chỉnh sửa và sửa đổi nguồn thực thể (instance source).
- **Muốn dùng mô hình tham số / phác thảo**: Đọc [Chương 6 Dựng hình tham số](06-parametric-modeling.md) và [Chương 7 Phác thảo](07-sketch.md).
- **Muốn xử lý mô hình nhập vào (import)**: Đọc [Chương 4](04-direct-modeling.md), [Chương 5](05-modify-convert-measure.md) và [Mục 12.2](12-workflows.md#122-导入模型检查修补与重新导出); người dùng Pro cũng có thể tham khảo [Mục 13.9](13-pro-direct-editing.md#139-一个完整的-pro-修形流程).
- **Muốn dùng trợ lý AI**: Đọc [Chương 9 Trợ lý AI](09-ai-assistant.md), đặc biệt lưu ý các quy tắc lưu trữ và chia sẻ lịch sử hội thoại cùng ảnh tham chiếu.
- **Cần tra cứu lệnh hoặc thuật ngữ**: Sử dụng [Phụ lục A Bảng tra nhanh lệnh](appendix-commands.md), [Phụ lục B Phím tắt](appendix-shortcuts.md) và [Phụ lục C Bảng thuật ngữ](appendix-glossary.md).
- **Gặp sự cố**: Tra cứu và khắc phục sự cố theo danh mục tại [Chương 11 Các câu hỏi thường gặp](11-faq.md).

Các hình minh họa đều là ảnh tĩnh chụp từ ứng dụng thực tế; tài liệu mẫu thực hành nhanh có tên là “Giá đỡ mặt bích / Tấm đáy mặt bích”.

## Năm điều cần nhớ trước khi sử dụng

1. **Đơn vị cố định**: Chiều dài tính bằng milimét (mm), góc tính bằng độ (°); trong biểu thức không cần viết thêm hậu tố đơn vị như `mm`.
2. **Không có tính năng tự động lưu**: Hàng ngày dùng `Ctrl+S`, tại các mốc quan trọng dùng `Lưu thành tệp` để tạo bản sao lưu `.cd`.
3. **Lưu trước khi đóng tài liệu**: Nút "Hủy" (Cancel) trong hộp thoại xác nhận đóng có nghĩa là không lưu và tiếp tục đóng, chứ không phải quay lại tài liệu.
4. **Dựng hình tham số khác với dựng hình trực tiếp**: Cách trước cho phép chỉnh sửa chuỗi tính năng (feature chain), cách sau chủ yếu sửa đổi hình học hiện tại; cách chọn phương pháp xem tại [Mục 1.6](01-getting-started.md#16-三种建模方式怎么选).
5. **Cần xác nhận trước ảnh hưởng khi chuyển đổi Pro và chỉnh sửa thực thể (instance)**: Chuyển nút tham số thành nút có thể chỉnh sửa sẽ làm mất danh sách tính năng; nhấp đúp vào một thực thể (instance) sẽ sửa đổi nút nguồn của nó và ảnh hưởng đến tất cả các thực thể dùng chung. Xem tại [Mục 13.2](13-pro-direct-editing.md#132-进入转换与退出).

## Mục lục

1. [Bắt đầu nhanh](01-getting-started.md) — Mở ứng dụng, tạo tài liệu mới, tạo chi tiết đầu tiên, lưu
2. [Tổng quan giao diện](02-interface.md) — Thanh tiêu đề, thanh công cụ Ribbon, khung nhìn, cây dự án, bảng thuộc tính, thanh trạng thái, bảng lệnh
3. [Góc nhìn, chọn đối tượng và bắt điểm](03-view-navigation-selection.md) — Thao tác camera, chế độ hiển thị, chọn đối tượng, bắt điểm (snap), mặt phẳng làm việc
4. [Dựng hình trực tiếp](04-direct-modeling.md) — Vẽ hình, hình khối cơ bản, đùn/xoay/loft/quét dẫn (sweep), Boolean, chuyển đổi
5. [Chỉnh sửa, đo lường và chú thích](05-modify-convert-measure.md) — Bo góc/vát mép, di chuyển/mảng, cắt tỉa/kéo dài, đo lường, đo kích thước, khung cảnh
6. [Dựng hình tham số](06-parametric-modeling.md) — Danh sách tính năng, đùn khối và tạo lỗ, tái tạo khôi phục (rebuild), biến số và biểu thức
7. [Phác thảo (Sketch)](07-sketch.md) — Phiên phác thảo, ràng buộc đầy đủ, kích thước, khôi phục xung đột, đường dựng, tham chiếu ngoài
8. [Tài liệu, tệp và hoàn tác](08-document-files.md) — Lưu và sao lưu, nhập/xuất, phiên bản tài liệu, hoàn tác/làm lại
9. [Trợ lý AI](09-ai-assistant.md) — Cấu hình mô hình, prompt, hai luồng dựng hình, ngữ cảnh và quyền riêng tư
10. [Cài đặt, plugin và phím tắt](10-settings-plugins.md) — Ngôn ngữ, giao diện (theme), điều hướng, an toàn plugin, kiểm thử hiệu năng
11. [Các câu hỏi thường gặp (FAQ)](11-faq.md) — Khắc phục sự cố góc nhìn, phác thảo, tính năng, tệp tin, AI và plugin
12. [Quy trình làm việc điển hình](12-workflows.md) — Tấm gá lắp tham số, sửa chữa mô hình nhập vào, cộng tác AI, danh mục kiểm tra bàn giao
13. [Pro chỉnh sửa trực tiếp](13-pro-direct-editing.md) — Nhấp đúp chỉnh sửa, chuyển đổi nút có thể chỉnh sửa, kéo rê, đẩy-kéo/offset, phân tách, đường hỗ trợ, sửa đổi và sửa chữa hình con (sub-shape)

Phụ lục:

- [Phụ lục A Bảng tra nhanh lệnh](appendix-commands.md)
- [Phụ lục B Phím tắt và thao tác chuột](appendix-shortcuts.md)
- [Phụ lục C Bảng thuật ngữ](appendix-glossary.md)

## Phạm vi tính năng

| Phân hệ chức năng | Các chương bao phủ |
| --- | --- |
| Khởi động ứng dụng, trang chủ, tài liệu gần đây, cài đặt ngôn ngữ/giao diện/điều hướng | 1, 2, 10 |
| Tab tài liệu, cây dự án, bảng thuộc tính, bảng lệnh, thanh trạng thái, bảng AI | 2 |
| Điều hướng camera (5 bộ cấu hình), trực diện/phối cảnh, chế độ hiển thị, đánh dấu góc nhìn (bookmark) | 3 |
| Chọn đối tượng, chọn theo khung, bắt điểm, dò gióng (tracking), mặt phẳng làm việc động | 3 |
| Dựng hình trực tiếp: vẽ đường và hình khối cơ sở, Boolean, biến đổi, chiếu đường cong, sao chép hình con | 4 |
| Chỉnh sửa, mảng và thực thể (instance), cắt tỉa, bo góc/vát mép, làm rỗng (shell), sửa chữa, vật liệu | 5 |
| Đo lường, đo kích thước, ghi chú văn bản, khung cảnh | 5 |
| Thân tham số (parametric body), chuỗi tính năng, thanh cuộn lui (rollback), ẩn/nén (suppress), đổi tên, chọn lại tham chiếu, sửa tham số | 6 |
| Tính năng tham số (đùn, xoay, loft, quét dẫn, xoắn ốc, lỗ, gân tăng cứng, góc vát thoát khuôn, làm rỗng, làm dày, bo góc/vát mép và sửa đổi, offset mặt, phân tách, mảng, đối xứng gương, Boolean, đẩy-kéo) | 6 |
| Biến số tài liệu, biểu thức thứ nguyên/đơn vị, nén tính năng theo biến số | 6 |
| Vẽ phác thảo, 13 loại ràng buộc, 7 loại kích thước, kích thước chủ động/bị động, bậc tự do và khôi phục xung đột | 7 |
| Chỉnh sửa phác thảo, đường dựng (construction line), chiếu cạnh, tham chiếu ngoài | 7 |
| Lưu tài liệu, phiên bản định dạng, nhập/xuất, kéo thả tệp, tham số URL, hoàn tác/làm lại | 8 |
| Cấu hình AI, câu lệnh prompt, hai luồng thực thi, hình ảnh tham chiếu, lịch sử hội thoại, quyền riêng tư | 9, 12 |
| Tải plugin và bảo mật, trình quản lý macro, lập trình trực quan (visual programming), kiểm thử hiệu năng | 10 |
| Tấm gá lắp tham số, sửa chữa mô hình nhập vào, cộng tác AI, danh mục kiểm tra bàn giao | 12 |
| Pro nhấp đúp chỉnh sửa, chuyển đổi nút có thể chỉnh sửa, sửa đổi nguồn thực thể, thẻ chỉnh sửa và cô lập | 2, 13 |
| Pro kéo rê, đẩy-kéo/offset mặt, bo góc/vát mép, phân tách, đường hỗ trợ, di chuyển và sửa chữa | 13 |
| Toàn bộ command key, phím tắt và thuật ngữ thường dùng | Phụ lục A, B, C |

## Giới hạn đã biết

- **Ứng dụng không tự động lưu**: Nếu đóng tab mà chưa lưu, mọi thay đổi sẽ bị mất. Xem [Chương 8](08-document-files.md).
- Thao tác xóa trong mục "Dự án gần đây" sẽ xóa hẳn tệp tài liệu; giữa các nguồn trình duyệt (browser origin) khác nhau cũng không tự động đồng bộ tài liệu.
- Định dạng `.cd` đối sánh nghiêm ngặt với phiên bản định dạng tài liệu độc lập, không phải số phiên bản phát hành của ứng dụng; khi bàn giao khác phiên bản, nên ưu tiên xuất thêm tệp STEP/BREP dự phòng.
- Tên mặc định của tài liệu mới hiện hiển thị là `undefined 1`, `undefined 2`... Trước khi lưu, bạn nên chọn nút gốc trên cây dự án và đổi thành tên có ý nghĩa trong bảng thuộc tính.
- Tên biến số tài liệu phải là định danh ASCII hợp lệ (`[A-Za-z_][A-Za-z0-9_]*`), không được dùng tiếng Việt có dấu, chữ Hán hoặc dấu cách.
- Trong khung nhìn không có menu chuột phải (trong phác thảo, nhấp chuột phải có thể hủy thao tác chọn hiện tại). Cây mô hình cũng không có menu chuột phải; để đổi tên, vui lòng thực hiện trong bảng thuộc tính.
- Biểu tượng **mắt hiển thị**, thư mục, kéo thả là những thao tác trực tiếp duy nhất trên cây mô hình; các thao tác như đổi tên, xóa... được thực hiện qua bảng thuộc tính hoặc lệnh trên thanh Ribbon.
- **Pro chỉnh sửa trực tiếp không khôi phục lịch sử tham số**: Sau khi chuyển đổi, các thao tác chỉnh sửa chỉ thay đổi hình học hiện tại; việc xóa mặt có thể để lại vỏ hở (open shell), và chức năng sửa chữa không đảm bảo bù đắp lại các mặt bị thiếu. Xem [Chương 13](13-pro-direct-editing.md).
