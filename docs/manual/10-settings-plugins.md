# 10. Cài đặt, plugin và mở rộng

## 10.1 Cài đặt trang chủ

Các mục cài đặt ở bên trái trang chủ sẽ có hiệu lực ngay lập tức và được lưu trong bộ nhớ cục bộ của trình duyệt:

| Cài đặt | Các tùy chọn |
| --- | --- |
| Ngôn ngữ | English / 简体中文 / Português (Brasil) / Русский / Tiếng Việt |
| Giao diện (Theme) | Hệ thống / Sáng / Tối |
| Điều hướng 3D | Chili3d / Revit / Blender / Creo / Solidworks |
| Kiểu xoay vòng | Mâm xoay (Turntable - Khóa trục Z) / Trackball (Xoay tự do) |

- **Giao diện**: Mặc định đi theo hệ thống; ở chế độ "Hệ thống", khi chuyển đổi chế độ sáng/tối trên hệ điều hành, giao diện ứng dụng và khung cảnh 3D sẽ tự động chuyển đổi theo.
- **Điều hướng 3D**: Quyết định việc phân bổ thao tác rê chuột giữa (MMB) / Shift+chuột giữa cho việc tịnh tiến (Pan) và xoay (Orbit), xem tại [Mục 3.1](03-view-navigation-selection.md#31-相机导航).
- **Kiểu xoay vòng**: Chế độ Mâm xoay giữ cho trục Z luôn hướng lên trên, rất thích hợp cho kiến trúc và cơ khí; chế độ Trackball giống như xoay một quả cầu trong tay, phù hợp để quan sát tự do mọi góc độ.

Đơn vị đo được ấn định cố định là **milimét (mm)**, góc được ấn định là **độ (°)**, không có tùy chọn thay đổi.

## 10.2 Điều chỉnh bố cục giao diện

- Kéo thanh phân cách ngang giữa cây dự án và bảng thuộc tính: Điều chỉnh tỷ lệ chiều cao của hai khu vực.
- Kéo thanh phân cách dọc giữa thanh bên và khung nhìn: Điều chỉnh độ rộng của thanh bên.
- Kéo thanh phân cách bên trái bảng điều khiển AI: Điều chỉnh độ rộng của bảng điều khiển AI.
- Các thẻ tab tài liệu và thẻ Ribbon tự động thích ứng với chiều rộng cửa sổ; khi thanh Ribbon không đủ chỗ hiển thị, bạn có thể cuộn ngang.

## 10.3 Phím tắt

Danh sách đầy đủ xem tại [Phụ lục B](appendix-shortcuts.md). Các phím tắt thông dụng nhất:

| Phím tắt | Lệnh |
| --- | --- |
| Ctrl+S / Ctrl+O | Lưu / Mở |
| Ctrl+Z / Ctrl+Y | Hoàn tác / Làm lại |
| Delete / Backspace | Xóa node được chọn |
| Space / Enter | Lặp lại lệnh trước đó |
| L / R / C | Đoạn thẳng / Hình chữ nhật / Đường tròn |
| B / S / Y / N | Hình hộp / Hình cầu / Hình trụ / Hình nón |
| P / Q | Đùn khối / Đẩy-Kéo |
| M / Shift+R / Shift+A | Di chuyển / Xoay / Mảng |
| Shift+F / Shift+C | Bo góc / Vát mép |
| T / O | Cắt tỉa / Dời song song (Offset) |
| D | Đo chiều dài |
| X / Shift+I | Phân rã / Giao nhau |

Phím `Space`/`Enter` khi ở ngoài vùng nhập văn bản và **không ở trong trạng thái chọn điểm** sẽ lặp lại lệnh gần nhất vừa dùng, không phụ thuộc vào việc có đang chọn đối tượng nào hay không; khi lệnh đang trong trạng thái chọn điểm, hai phím này dùng để xác nhận thao tác chọn điểm hiện tại.

Trên macOS, các phím tắt toàn cục dùng Ctrl cũng chấp nhận phím `Cmd`, ví dụ `Cmd+S`, `Cmd+Z`. Tuy nhiên thao tác chọn nhiều node trong cây dự án vẫn là **Ctrl+Nhấp chuột**, không thể thay thế bằng Cmd; thao tác Shift+Nhấp chuột dùng để chọn một dải liên tục.

<a id="104-插件"></a>
## 10.4 Plugin

### Tải plugin

Có ba cách tải plugin:

1. Qua tham số URL (có thể xuất hiện nhiều lần). Địa chỉ từ xa có hai hình thức hợp lệ:

   ```text
   http://localhost:8080/?plugin=https://example.com/my-plugin/
   http://localhost:8080/?plugin=https://example.com/my-plugin.chiliplugin
   ```

   - Địa chỉ thư mục: Bên trong thư mục bắt buộc phải có tệp `manifest.json`, bản kê khai (manifest) sẽ khai báo tệp JS đầu vào, CSS và các tài nguyên;
   - Địa chỉ `.chiliplugin`: Trỏ trực tiếp tới gói plugin hoàn chỉnh.

   Không thể dùng địa chỉ của một script đơn lẻ bất kỳ như `extension.js` làm URL plugin.

2. Kéo thả tệp `.chiliplugin` trực tiếp vào cửa sổ ứng dụng.
3. Tải thông qua API quản lý plugin trong trang web (`app.pluginManager.loadFromUrl`), cũng sử dụng địa chỉ thư mục hoặc địa chỉ gói ở trên.

### Tin cậy, an toàn và CORS

Tệp đầu vào của plugin là mã JavaScript có thể thực thi, có quyền gọi các API của ứng dụng, đăng ký lệnh và dịch vụ, cũng như đọc hoặc chỉnh sửa tài liệu; nó không phải là một mẫu template bị giới hạn chỉ để thêm nút bấm. **Chỉ tải các plugin mà bạn tin tưởng tác giả và nguồn gốc phát hành**, khi không rõ nguồn gốc thì tuyệt đối không bấm "Tin cậy", tốt nhất nên kiểm tra kỹ mã nguồn và bản kê khai manifest trước.

- Khi plugin từ xa đến từ một tên miền lạ, trước tiên sẽ bật lên hộp thoại xác nhận "Bạn có tin cậy script đến từ tên miền sau đây không?", chỉ sau khi bạn chọn tin cậy thì plugin mới được tải. Hộp thoại này không phải là quét mã độc, mà là xác nhận sự tin cậy đối với tên miền nguồn.
- Kéo thả tệp `.chiliplugin` từ máy cục bộ **sẽ không qua bước xác nhận tên miền lạ**. Việc không có thông báo không đồng nghĩa với an toàn tuyệt đối, gói cục bộ cũng chỉ nên đến từ các nguồn đáng tin cậy.
- Khi tải bản kê khai manifest, gói plugin, script đầu vào và các tài nguyên khác từ xa, máy chủ bắt buộc phải cho phép **CORS** chuẩn xác. Khi tải thất bại, hãy kiểm tra hình thức địa chỉ, manifest, phản hồi mạng và lỗi cross-origin trong Console của trình duyệt.

### Plugin có thể làm được những gì

Plugin có thể đăng ký:

- Lệnh mới (`Command`);
- Thẻ Ribbon mới / Nhóm Ribbon mới / Nút bấm mới;
- Văn bản bản địa hóa i18n mới;
- Bảng điều khiển (panel), công cụ, bộ xử lý sự kiện...

Sau khi tải, plugin thường sẽ thêm một thẻ **Plugin** mới trên thanh Ribbon.

### Các ví dụ có sẵn trong kho lưu trữ

| Ví dụ | Nội dung |
| --- | --- |
| HelloWorld (JavaScript / TypeScript) | Plugin tối giản: Một lệnh + Một nút bấm trên Ribbon + Bản dịch tiếng Trung/Anh |
| Trình quản lý macro (Macro Manager) | Tạo mới/chỉnh sửa/chạy/xóa macro JavaScript. Xuất hiện mục "Macro" trong thẻ Plugin |
| Lập trình trực quan (Visual Programming) | Trình chỉnh sửa dạng node dựa trên Rete.js (phong cách Grasshopper). Xuất hiện mục "Lập trình trực quan" trong thẻ Plugin |

Các ví dụ này nằm trong thư mục workspace plugin của kho mã nguồn. Lấy ví dụ trình quản lý macro, bạn có thể build và đóng gói trong thư mục dự án của nó:

```bash
npm run build      # Build mã nguồn
npm run package    # Sinh tệp .chiliplugin
```

Tệp `.chiliplugin` là một gói chứa `manifest.json`, JS/CSS đầu vào và các tài nguyên; kéo thả nó vào Chili3D là có thể tải ngay. Việc kéo thả tệp không ghi vào danh sách "plugin đã cài đặt" vĩnh viễn, sau khi làm mới (F5) trang web bạn cần kéo thả lại, hoặc dùng tham số khởi động `?plugin=`. Việc tin cậy một tên miền nào đó sẽ lưu lại cài đặt tin cậy đó, nhưng cũng không tự động tải các plugin từ tên miền này.

## 10.5 Kiểm thử hiệu năng (Performance Test)

Nút `Kiểm thử hiệu năng` trong thẻ **Quản lý** sẽ:

1. Tạo một tài liệu mới có tên `OCC Performace Test`;
2. Sinh ra 20×20×20 = 8000 hình hộp với kích thước ngẫu nhiên;
3. Bật thông báo báo cáo tổng thời gian thực hiện.

Công cụ này dùng để so sánh sơ bộ hiệu năng dựng hình và render của phần cứng/trình duyệt, tiêu tốn lượng lớn bộ nhớ RAM, vì vậy khuyến nghị chỉ nên chạy trong một phiên làm việc mới.

![Thẻ Quản lý](images/12-manager-tab.png)

## 10.6 Yêu cầu trình duyệt và dữ liệu

- Cần trình duyệt hiện đại hỗ trợ **WebAssembly** và **WebGL 2** (các phiên bản mới của Chrome/Edge/Firefox/Safari).
- Tài liệu và dự án gần đây được lưu trong **IndexedDB** của trình duyệt; việc dọn dẹp dữ liệu duyệt web sẽ làm mất chúng, các tài liệu quan trọng hãy sao lưu trước theo hướng dẫn tại [Mục 8.2](08-document-files.md#82-保存版本与备份).
- Giao diện, ngôn ngữ, điều hướng, kiểu xoay vòng, cùng cấu hình AI không chứa Key được lưu trong LocalStorage; hội thoại AI được lưu cùng tài liệu tương ứng.
- Tài liệu, dự án gần đây và cài đặt được cách ly theo nguồn trình duyệt (giao thức, tên miền, cổng). Trang chính thức, trang mirror, các cổng khác nhau hoặc các trình duyệt khác nhau sẽ không tự động đồng bộ hóa; muốn chuyển tài liệu phải dùng tệp `.cd`, còn cài đặt thì phải cấu hình riêng ở từng nơi.
- API Key của AI chỉ tồn tại trong bộ nhớ RAM của phiên làm việc hiện tại; có thể chọn để trình quản lý mật khẩu của trình duyệt lưu giữ, giải thích về quyền riêng tư xem tại [Mục 9.6](09-ai-assistant.md#96-隐私).
- Ứng dụng sử dụng thống kê Microsoft Clarity, đây là kênh thống kê độc lập với các yêu cầu AI. Khi tự triển khai (self-hosted), bạn có thể gỡ bỏ script thống kê Clarity khỏi trang web chính, hoặc chặn các yêu cầu thống kê qua trình duyệt hay chính sách mạng.

## 10.7 Tìm trợ giúp ở đâu

- Phần "Video cộng đồng" ở bên phải trang chủ có các video ghi lại cập nhật và trình diễn ca sử dụng mẫu.
- GitHub: <https://github.com/xiangechen/chili3d> (Issues / Discussions).
- Mã QR nhóm WeChat nằm trong nhóm "Khác" trên thanh Ribbon.
- Bilibili có các video hướng dẫn bằng tiếng Trung (xem trong README của dự án).

---

Bước tiếp theo: [Chương 11 Câu hỏi thường gặp](11-faq.md), hoặc quay lại [Mục lục sổ tay](README.md).
