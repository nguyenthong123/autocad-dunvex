# Phụ lục B Phím tắt và thao tác chuột

## B.1 Phím tắt mặc định (Cấu hình điều hướng Chili3d)

| Lệnh | Phím tắt |
| --- | --- |
| Lưu tài liệu | Ctrl+S |
| Mở tài liệu | Ctrl+O |
| Hoàn tác | Ctrl+Z |
| Làm lại | Ctrl+Y hoặc Ctrl+Shift+Z |
| Xóa nút | Delete hoặc Backspace |
| Lặp lại lệnh trước | Space hoặc Enter |
| Đoạn thẳng | L |
| Hình chữ nhật | R |
| Đường tròn | C |
| Đo chiều dài | D |
| Khối hộp | B |
| Khối cầu | S |
| Khối trụ | Y |
| Khối nón | N |
| Ống dẫn | Shift+P |
| Cắt tỉa | T |
| Song song (Offset) | O |
| Xoay | Shift+R |
| Đùn khối | P |
| Di chuyển | M |
| Mảng | Shift+A |
| Giao nhau | Shift+I |
| Phân rã | X |
| Vát mép | Shift+C |
| Bo góc | Shift+F |
| Đẩy-kéo | Q |

> Phím tắt được hiển thị và khớp theo cấu hình "Điều hướng 3D" hiện tại. Phím tắt không phân biệt chữ hoa, chữ thường; khi đang nhập liệu trong ô văn bản sẽ không kích hoạt phím tắt.
>
> Trên macOS, các phím tắt `Ctrl` toàn cục cũng có thể dùng `Cmd`, ví dụ `Cmd+S`, `Cmd+Z`. Đây chỉ là sự tương thích của phím bổ trợ trên bàn phím: thao tác chọn nhiều mục trên cây dự án vẫn yêu cầu rõ ràng là `Ctrl+nhấp chuột`, không phải `Cmd+nhấp chuột`.
>
> Khi không có thao tác chọn điểm/đối tượng đang diễn ra và tiêu điểm không nằm trong ô nhập liệu, phím `Space`/`Enter` sẽ lặp lại lệnh gần nhất mà không yêu cầu phải xóa vùng chọn trước; trong quá trình chọn đối tượng của lệnh thì dùng để xác nhận.

## B.2 Khác biệt giữa các cấu hình điều hướng khác

Revit và Blender chỉ ghi đè các lệnh trong bảng dưới đây, các phím tắt còn lại được kế thừa từ cấu hình mặc định. Bảng này liệt kê trực tiếp các phím có hiệu lực sau khi kế thừa, tránh nhầm lẫn giữa "không bị ghi đè" với "không có phím tắt":

| Lệnh | Revit | Blender |
| --- | --- | --- |
| Di chuyển | `M` rồi `V` | G |
| Xoay | `R` rồi `O` | R |
| Cắt tỉa | `T` rồi `R` | T (như mặc định) |
| Đoạn thẳng | `L` rồi `I` | L (như mặc định) |
| Đùn khối | P (như mặc định) | E |

Cấu hình Creo và Solidworks chỉ thay đổi phương thức điều hướng chuột, các phím lệnh vẫn giữ nguyên như mặc định.

## B.3 Thao tác chuột và góc nhìn

| Thao tác | Hiệu quả |
| --- | --- |
| Con lăn cuộn | Thu phóng (ngược chiều với Solidworks/Creo) |
| Kéo chuột giữa | Kéo lia (Pan) hoặc xoay góc nhìn theo cấu hình điều hướng |
| Shift + Kéo chuột giữa | Xoay góc nhìn hoặc kéo lia theo cấu hình điều hướng |
| Nhấp đúp chuột giữa | Khớp toàn bộ nội dung vào khung nhìn (Fit content) |
| Kéo chuột trái | Chọn theo khung (Window selection) |
| Nhấp chuột trái | Chọn nút / Chọn đối tượng |
| Shift + Nhấp chuột trái | Thêm vào / Bớt khỏi vùng chọn trong khung nhìn |
| Nhấp chuột phải | Hủy thao tác chọn hiện tại (không có menu ngữ cảnh chuột phải) |
| Nhấp vào quả cầu trục X/Y/Z | Nhìn trực diện vuông góc theo trục |
| Kéo quả cầu trục | Xoay góc nhìn tự do quanh mô hình |

## B.4 Cây mô hình và thao tác lệnh

| Thao tác | Hiệu quả |
| --- | --- |
| Ctrl + Nhấp chuột (trên cây) | Bật/tắt chọn nhiều đối tượng |
| Shift + Nhấp chuột (trên cây) | Chọn theo dải liên tiếp |
| Nhấp đúp vào nút phác thảo | Chỉnh sửa phác thảo |
| Kéo thả vào thư mục | Thay đổi quan hệ cha - con |
| Kéo thả hàng tính năng | Sắp xếp lại thứ tự chuỗi tính năng |
| Enter / Space | Xác nhận thao tác chọn hiện tại / Áp dụng giá trị kéo rê |
| Esc | Hủy thao tác chọn / Thoát lệnh / Bỏ chọn đối tượng |
| Tab | Chuyển đổi luân phiên giữa các hình học chồng lấn dưới con trỏ |
| Delete | Xóa các nút đang chọn |

## B.5 Dành riêng cho phác thảo (Sketch)

| Thao tác | Hiệu quả |
| --- | --- |
| Esc | Thoát từng cấp: chuỗi đối tượng → công cụ → ràng buộc/thực thể → phiên phác thảo |
| Enter | Kết thúc chuỗi vẽ hiện tại / Xác nhận |
| Chọn theo khung | Chọn nhiều thực thể phác thảo |
| Nhấp đúp vào chữ số kích thước | Sửa đổi giá trị kích thước |
| Nhấp đúp vào ký hiệu mảng/offset | Sửa đổi số lượng / khoảng cách / góc |
| Delete / Backspace | Xóa ràng buộc / thực thể dưới con trỏ hoặc đang được chọn |

## B.6 Tùy chỉnh phím tắt

Hiện tại chưa có trình biên tập phím tắt dạng đồ họa. Ánh xạ phím mặc định được định nghĩa tại:

```text
packages/core/src/command/shortcutProfiles.ts
```

`Chili3dShortcuts` là bảng mặc định, `RevitShortcuts`, `BlenderShortcuts`... được xây dựng dựa trên việc ghi đè lên bảng này. Sau khi chỉnh sửa, chỉ cần biên dịch (build) lại ứng dụng là có hiệu lực.

## B.7 Pro Chỉnh sửa trực tiếp

Các thao tác sau đây chỉ áp dụng cho chế độ chỉnh sửa trực tiếp của **Chili3D Pro**, chi tiết xem tại [Chương 13](13-pro-direct-editing.md).

| Thao tác | Hiệu quả |
| --- | --- |
| Nhấp đúp chuột trái vào mô hình | Vào chế độ chỉnh sửa trực tiếp; nút không thể chỉnh sửa trực tiếp sẽ hỏi trước xem có chuyển đổi không |
| Nhấp chuột vào đỉnh / cạnh / mặt | Chọn hình con (sub-shape) của nút hiện tại |
| Shift + Nhấp chuột | Thêm vào / Bớt khỏi vùng chọn hình con |
| Kéo tay cầm tròn màu vàng | Đẩy-kéo/offset mặt phẳng, hoặc kéo rê để tạo bo góc/vát mép, chỉnh sửa bo góc có sẵn |
| Alt (khi lệnh đẩy-kéo đang chọn điểm đích) | Chuyển đổi chế độ `Tạo mặt mới` |
| Delete / Backspace | Xóa cạnh, mặt hoặc đường hỗ trợ đang chọn (không phải xóa toàn bộ nút) |
| Enter / Space | Xác nhận thao tác chọn hiện tại trong lệnh |
| Esc | Hủy lệnh đang chạy trước; khi không có lệnh nào đang chạy thì thoát chế độ chỉnh sửa trực tiếp |
| Ctrl+Z / Ctrl+Y | Hoàn tác / Làm lại thao tác chỉnh sửa đã áp dụng |

Bạn cũng có thể nhấp **Chỉnh sửa → Quản lý → Thoát**, hoặc nhấp vào vùng bên ngoài khung bao chỉnh sửa để rời khỏi chế độ chỉnh sửa. Thoát sẽ không hoàn tác các thay đổi và cũng không tự động lưu.

---

Quay lại [Mục lục sổ tay](README.md) · Tra cứu [Phụ lục C Bảng thuật ngữ](appendix-glossary.md)
