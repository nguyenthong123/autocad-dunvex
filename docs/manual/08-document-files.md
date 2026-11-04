# 8. Tài liệu, tệp tin và hoàn tác

<a id="81-文档与标签"></a>
## 8.1 Tài liệu và thẻ tab

Mỗi tài liệu có khung nhìn, cây dự án, ngăn xếp hoàn tác và trạng thái lựa chọn độc lập. Ở giữa thanh tiêu đề là các thẻ tab tài liệu:

- Nhấp vào thẻ tab để chuyển đổi tài liệu;
- Biểu tượng `×` để đóng tài liệu, **mỗi lần đóng đều sẽ hỏi xem có lưu hay không**;
- Biểu tượng `+` bên phải để tạo tài liệu mới.

Trong cùng một tab trình duyệt có thể mở đồng thời nhiều tài liệu, các tài liệu này chia sẻ chung một instance ứng dụng.

Khi đóng tài liệu, hộp thoại xác nhận gốc của trình duyệt sẽ hiện lên; cả hai nút đều sẽ tiếp tục tiến trình đóng tài liệu:

- **OK (Xác nhận)**: Lưu tài liệu hiện tại vào IndexedDB trước, rồi mới đóng;
- **Cancel (Hủy)**: Không lưu các sửa đổi lần này, nhưng vẫn đóng tài liệu; nút này không phải là "ở lại tài liệu" hay "tiếp tục chỉnh sửa".

Hộp thoại xác nhận này không có lựa chọn thứ ba là "ở lại tài liệu". Khi các thay đổi chưa được sao lưu, hãy nhấn `Ctrl+S` hoặc thực hiện `Lưu thành tệp` trước, rồi mới nhấp vào `×`. Nếu trước đó đã từng lưu, việc chọn "Cancel" khi mở lại chỉ có thể lấy lại nội dung của lần lưu gần nhất.

Biểu tượng `×` trên thẻ "Dự án gần đây" ở trang chủ cũng không đơn thuần là xóa lối tắt: sau khi xác nhận, nó sẽ **xóa đồng thời dữ liệu của tài liệu đó trong IndexedDB và bản ghi trong danh sách dự án gần đây**, không có thùng rác để khôi phục. Trước khi xóa, hãy dùng `Lưu thành tệp` để tạo bản sao lưu `.cd`; các tệp sao lưu đã tải về ngoài ứng dụng sẽ không bị ảnh hưởng bởi thao tác xóa này.

<a id="82-保存版本与备份"></a>
## 8.2 Lưu, phiên bản và sao lưu

| Cách thức | Vị trí | Giải thích |
| --- | --- | --- |
| `Lưu` (Ctrl+S) | IndexedDB của trình duyệt | Lưu vào bộ nhớ cục bộ; tài liệu xuất hiện trong "Dự án gần đây" ở trang chủ |
| `Lưu thành tệp` | Tải về tệp `.cd` | Dùng để sao lưu, di chuyển, chia sẻ; `.cd` có định dạng JSON |
| `Mở tài liệu` (Ctrl+O) | Hộp thoại chọn tệp | Đọc tệp `.cd`; cũng có thể mở từ "Dự án gần đây" ở trang chủ |

Lưu ý:

- **Không có tự động lưu**. Sau khi chỉnh sửa, bạn bắt buộc phải lưu thủ công.
- Ứng dụng tương ứng trong sổ tay này có **phiên bản ứng dụng là 0.8.0**, và **phiên bản định dạng tài liệu `documentVersion` hiện tại là 0.7.1** (đây là hai số hiệu khác nhau). Khi mở tài liệu, hệ thống đối chiếu nghiêm ngặt phiên bản định dạng tài liệu: **khác phiên bản định dạng chắc chắn sẽ bị từ chối tải**, hoàn toàn không có cơ chế tự động chuyển đổi phiên bản (migration).
- Mở tệp `.cd` sẽ giữ nguyên ID tài liệu bên trong tệp. Sau đó nếu nhấn `Ctrl+S`, hệ thống sẽ dùng ID này ghi đè lên tài liệu và bản ghi dự án gần đây có cùng ID trong trình duyệt; việc đổi tên tài liệu trong ứng dụng chỉ đổi tên hiển thị, **không tạo ra bản sao độc lập**. Trước khi thực hiện các chỉnh sửa thử nghiệm, hãy tải về một bản `.cd` dự phòng, không dựa vào việc đổi tên để bảo vệ bản ghi gốc.
- `Lưu thành tệp` không đóng tài liệu, cũng không làm thay đổi bản ghi trong "Dự án gần đây". Các tệp `.cd` tải về với tên khác nhau có thể dùng làm các bản sao lưu độc lập, nhưng khi mở và lưu trong cùng một nguồn trình duyệt (origin), hệ thống vẫn ghi đè theo ID tài liệu gốc bên trong tệp.

Khuyến nghị tại các mốc quan trọng nên lưu trữ song song cả hai loại bản sao lưu, và cất giữ tệp tải về ở vị trí an toàn bên ngoài trình duyệt:

| Bản sao lưu | Phù hợp cho | Không bao gồm |
| --- | --- | --- |
| `.cd` | Khôi phục toàn bộ tài liệu trong cùng một phiên bản định dạng tài liệu; lưu giữ nhiều mốc theo ngày | Ngăn xếp hoàn tác |
| STEP | Trao đổi hình học cuối cùng giữa các phiên bản ứng dụng, phương án dự phòng trước khi nâng cấp, chuyển giao cho phần mềm CAD khác | Cây tính năng tham số, biến số, cài đặt tài liệu, hội thoại AI và ngăn xếp hoàn tác |

Trước khi nâng cấp ứng dụng, dọn dẹp dữ liệu trang web hoặc xóa dự án gần đây, hãy lưu tệp `.cd`; khi cần lưu giữ hình học qua các phiên bản thì xuất thêm tệp STEP. Tệp `.cd` cũng bao gồm các cuộc hội thoại AI đã lưu, cách xử lý trước khi chia sẻ xem tại [Mục 9.6](09-ai-assistant.md#96-隐私).

<a id="83-导入"></a>
## 8.3 Nhập tệp (Import)

**Cơ bản/Tham số → Nhập/Xuất → Nhập**, chọn một hoặc nhiều tệp:

| Định dạng | Giải thích |
| --- | --- |
| `.step` / `.stp` | Định dạng trung gian khuyến nghị, bảo toàn B-rep |
| `.iges` / `.igs` | Định dạng trung gian cho mặt cong/khối đặc |
| `.brep` | B-rep gốc của OCCT |
| `.stl` | Nhập vào dưới dạng hình dạng OCCT gồm các mặt tam giác |

Mô hình nhập vào sẽ được thêm vào tài liệu dưới dạng các node độc lập, có thể di chuyển, biến đổi, Boolean, hoặc làm đầu vào cho các tính năng tham số (tùy thuộc vào việc định dạng đó có cung cấp hình học chính xác hay không). Khi chưa có tài liệu nào đang mở, hệ thống sẽ tự động tạo một tài liệu mới có tên `Untitled`; khi đã có tài liệu đang mở thì thêm vào tài liệu hiện tại. **Nhập tệp không đồng nghĩa với việc đã lưu**, sau đó bạn vẫn cần nhấn `Ctrl+S` hoặc `Lưu thành tệp`.

STL chỉ lưu trữ lưới tam giác, sau khi nhập sẽ không khôi phục lại các mặt cong CAD trơn mượt ban đầu, cũng không hoàn nguyên lại các mặt giải tích như mặt phẳng, mặt trụ hay lịch sử tham số hóa. Khi cần hình học chính xác loại này, hãy ưu tiên sử dụng STEP, IGES hoặc BREP.

<a id="84-导出"></a>
## 8.4 Xuất tệp (Export)

**Nhập/Xuất → Xuất**:

![Bảng xuất tệp](images/11-export.png)

1. Chọn các mô hình cần xuất (có thể chọn nhiều mô hình). Bảng lệnh hiển thị `Định dạng tệp` và `Hợp nhất`.
2. Chọn định dạng:

| Định dạng | Kiểu |
| --- | --- |
| `.step` | Định dạng trung gian B-rep |
| `.iges` | Định dạng trung gian B-rep |
| `.brep` | OCCT gốc |
| `.stl` / `.stl binary` | Lưới tam giác (ASCII / Nhị phân) |
| `.ply` / `.ply binary` | Lưới tam giác |
| `.obj` | Lưới tam giác |

3. Tùy thuộc vào số lượng đối tượng được chọn để quyết định có `Hợp nhất` hay không:

| Đối tượng chọn | `Hợp nhất` | Kết quả tải về |
| --- | --- | --- |
| Một đối tượng | Tích chọn hoặc không | Một tệp định dạng thông thường, không đóng gói thành ZIP |
| Nhiều đối tượng | Tích chọn | Tất cả các đối tượng được gộp vào một tệp định dạng thông thường |
| Nhiều đối tượng | Không tích chọn | Mỗi đối tượng là một tệp riêng, được đóng gói chung vào một tệp `.zip` để tránh bị trình duyệt chặn tải liên tiếp |

Tệp thông thường và tệp ZIP đều được đặt tên theo **tên của node được chọn đầu tiên**; các tệp bên trong ZIP được đặt tên theo từng node tương ứng, nếu trùng tên sẽ thêm số thứ tự.

Hình học được xuất ra là hình học cuối cùng của các node được chọn trong **hệ tọa độ thế giới**, bao gồm hình dạng sau khi tái dựng của thân tham số và các biến đổi của node.

## 8.5 Kéo thả tệp

Kéo tệp trực tiếp thả vào cửa sổ ứng dụng:

| Tệp | Hành vi |
| --- | --- |
| `.cd` | Mở dưới dạng tài liệu |
| `.chiliplugin` | Tải plugin |
| `.step/.stp/.iges/.igs/.brep/.stl` | Nhập tệp; tự động tạo tài liệu mới nếu chưa có tài liệu mở |

Kéo thả tệp tuân theo cùng một logic xử lý như lệnh thông thường, sau khi nhập bạn vẫn cần lưu thủ công.

<a id="86-url-参数"></a>
## 8.6 Tham số URL

| Tham số | Tác dụng |
| --- | --- |
| `?url=<địa_chỉ_tệp>` | Khi khởi động tự động mở tài liệu hoặc nhập mô hình theo phần mở rộng tệp |
| `?model=<địa_chỉ_tệp>` | Giống như `url` (tương thích liên kết cũ) |
| `?plugin=<địa_chỉ_plugin>` | Khi khởi động tự động tải thư mục plugin hoặc `.chiliplugin`; có thể xuất hiện nhiều lần |

Ví dụ:

```text
https://chili3d.com/?plugin=https://example.com/my-plugin/
https://chili3d.com/?plugin=https://example.com/my-plugin.chiliplugin
https://chili3d.com/?url=https://example.com/part.step
```

Tham số `url` / `model` yêu cầu liên kết tải trực tiếp mà trình duyệt có thể tải về ngay và tên tệp phải kết thúc bằng phần mở rộng được hỗ trợ; địa chỉ khác tên miền (cross-origin) bắt buộc máy chủ phải cho phép **CORS** chuẩn xác. Các URL có chữ ký chứa tham số truy vấn như `?sig=...` có thể làm hỏng việc nhận diện đuôi tệp, bạn nên chuyển sang dùng liên kết trực tiếp không có tham số truy vấn, hoặc tải tệp về máy trước rồi mở thủ công. Khi tải thất bại, hãy mở Console trong Developer Tools của trình duyệt để kiểm tra trạng thái mạng, CORS và lỗi liên quan đến phần mở rộng. Hai hình thức của địa chỉ plugin xem tại [Mục 10.4](10-settings-plugins.md#104-插件).

## 8.7 Hoàn tác và Làm lại

- **Hoàn tác (Undo)**: `Ctrl+Z` / Mũi tên trái trên thanh tiêu đề.
- **Làm lại (Redo)**: `Ctrl+Y` hoặc `Ctrl+Shift+Z` / Mũi tên phải trên thanh tiêu đề.
- Mỗi tài liệu có ngăn xếp hoàn tác độc lập, không dùng chung khi chuyển đổi tài liệu, mặc định lưu tối đa **50 bản ghi** hoàn tác, vượt quá giới hạn sẽ loại bỏ bản ghi cũ nhất.
- Một lần thực thi lệnh = một bước hoàn tác, bao gồm:
  - Tạo một hình dạng;
  - Sửa một tham số tính năng;
  - Đổi một trường trong bảng thuộc tính;
  - Một lần gọi `run_program` / `run_parametric` của AI.
- **Lưu tài liệu không làm trống ngăn xếp hoàn tác hiện tại**, sau khi lưu bạn vẫn có thể hoàn tác, làm lại trong phiên làm việc này. Trạng thái mới có được sau khi hoàn tác cần phải được lưu lại lần nữa thì bản lưu mới được cập nhật.
- Ngăn xếp hoàn tác **không được lưu trữ vĩnh viễn**: khi đóng tài liệu hoặc làm mới (F5) trang web, toàn bộ lịch sử hoàn tác và làm lại sẽ bị mất. Sau khi hoàn tác nếu bạn thực thi một lệnh mới thì nhánh làm lại hiện tại cũng sẽ bị xóa bỏ.

<a id="88-数据存放位置"></a>
## 8.8 Vị trí lưu trữ dữ liệu

- Tài liệu và "Dự án gần đây" được lưu trong **IndexedDB** của trình duyệt; hội thoại AI thuộc dữ liệu của tài liệu tương ứng và được ghi đồng thời khi lưu tài liệu, chứ không có kho lưu trữ hội thoại tự động lưu riêng biệt.
- Các cài đặt như ngôn ngữ, giao diện (theme), cấu hình điều hướng được lưu trong LocalStorage của trình duyệt.
- Tài liệu, dự án gần đây và các cài đặt đều được cách ly theo **Nguồn trình duyệt (Browser Origin)**. Nguồn được quyết định bởi giao thức, tên miền và cổng (port), vì thế trang web chính thức, trang mirror, các cổng khác nhau và các trình duyệt khác nhau sẽ không tự động đồng bộ hóa dữ liệu với nhau.
- API Key của AI chỉ được lưu trong bộ nhớ tạm của phiên làm việc hiện tại, không được ghi vào bộ nhớ lưu trữ trình duyệt của ứng dụng; bạn có thể chọn giao cho trình quản lý mật khẩu của trình duyệt lưu giữ, chi tiết xem tại [Mục 9.2](09-ai-assistant.md#92-配置模型).
- Đổi trình duyệt, đổi nguồn truy cập hoặc dọn dẹp dữ liệu duyệt web đều có thể khiến bạn không thấy tài liệu ở vị trí cũ; đối với các tệp quan trọng, vui lòng sao lưu bằng `.cd` và STEP theo hướng dẫn tại [Mục 8.2](#82-保存版本与备份).

---

Bước tiếp theo: [Chương 9 Trợ lý AI](09-ai-assistant.md)
