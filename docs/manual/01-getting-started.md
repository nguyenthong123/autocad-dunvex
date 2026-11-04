# 1. Bắt đầu nhanh

Chương này sẽ hướng dẫn bạn từng bước tạo một chi tiết dạng tấm có lỗ rỗng từ con số 0, sau đó lưu thành một tài liệu ngay trong trình duyệt. Toàn bộ quá trình chỉ cần chuột và bàn phím, hoàn toàn không cần cài đặt bất kỳ phần mềm nào.

## 1.1 Mở ứng dụng

Truy cập [chili3d.com](https://chili3d.com) (hoặc trang dự phòng [chili3d.pages.dev](https://chili3d.pages.dev)) trên trình duyệt web. Khi phát triển cục bộ, chạy lệnh `npm run dev` rồi truy cập `http://localhost:8080`.

Trình duyệt cần hỗ trợ **WebAssembly** và **WebGL 2**. Lần mở đầu tiên, màn hình tải sẽ tải về và khởi tạo nhân dựng hình OCCT, thường mất từ vài giây đến mười mấy giây; sau khi nhân khởi tạo hoàn tất thì trang chủ mới xuất hiện.

## 1.2 Trang chủ

![Trang chủ](images/01-home.png)

Trang chủ chia làm ba khu vực:

- **Bên trái**: Nút `Tạo tài liệu mới`, `Mở bản vẽ`; phía dưới là 4 mục cài đặt: ngôn ngữ, giao diện (theme), kiểu điều hướng 3D và chế độ xoay vùng nhìn.
- **Ở giữa**: `Dự án gần đây`. Các tài liệu đã từng lưu sẽ xuất hiện ở đây, nhấp vào thẻ để mở. Dấu `×` trên thẻ không phải là "chỉ xóa lối tắt": sau khi xác nhận, hệ thống sẽ xóa vĩnh viễn cả tài liệu trong trình duyệt lẫn bản ghi gần đây, vì vậy hãy xuất bản sao lưu `.cd` trước khi xóa.
- **Bên phải**: Video cộng đồng (nhật ký cập nhật và các bài mẫu thực hành), nhấp vào hình thu nhỏ để mở video trong tab mới.

Các mục cài đặt được lưu cục bộ trên trình duyệt và vẫn có hiệu lực ở lần mở tiếp theo. Ý nghĩa của từng mục xem tại [Chương 10](10-settings-plugins.md). Tài liệu và cài đặt được cách ly theo nguồn trình duyệt (browser origin), nên trang chính thức, trang dự phòng và các cổng cục bộ khác nhau sẽ không tự động đồng bộ hóa với nhau.

> Nếu chỉ muốn dùng thử nhanh: Nhấp vào `Tạo tài liệu mới` và chuyển thẳng đến mục 1.4.

## 1.3 Tạo tài liệu mới

Nhấp vào `Tạo tài liệu mới`. Ứng dụng sẽ tạo một tài liệu mới, mở khung nhìn của nó và hiển thị bảng điều khiển Trợ lý AI ở bên phải.

Lần đầu sử dụng Trợ lý AI, cửa sổ "Cài đặt Trợ lý AI" sẽ tự động bật lên. Nếu tạm thời chưa dùng AI, bạn có thể nhấp vào `Hủy bỏ` ở góc dưới bên phải để đóng; khi cần thì nhấp lại vào biểu tượng bánh răng ở góc trên bên phải của bảng điều khiển để mở. Cách cấu hình xem tại [Chương 9](09-ai-assistant.md).

Tài liệu mới mặc định có tên là `undefined 1`. Trước khi lưu, hãy đổi thành một cái tên có ý nghĩa:

1. Trên cây dự án ở bên trái, nhấp vào nút gốc (tên tài liệu).
2. Ở bảng "Thuộc tính" phía dưới, đổi mục "Tên đối tượng" thành tên mong muốn, ví dụ `Giá đỡ mặt bích`, rồi nhấn Enter.

Tab tài liệu và cây dự án sẽ đồng thời được cập nhật.

## 1.4 Tạo chi tiết đầu tiên

Chúng ta sẽ tạo một tấm có kích thước khoảng 240 × 160 × 40: trong phác thảo vẽ một đường bao lỗ bên trong (khi đùn khối sẽ trực tiếp trở thành lỗ xuyên suốt), sau đó thêm một tính năng lỗ tiêu chuẩn.

### Bước 1: Vẽ phác thảo

1. Chuyển sang thanh công cụ **Tham số**, nhấp vào `Tạo phác thảo mới`.
   Bạn cũng có thể vào nhóm `Vẽ` trong thanh công cụ **Cơ bản** rồi nhấp vào `Hình chữ nhật` để vẽ trực tiếp, nhưng cách đó sẽ tạo ra hình học dựng hình trực tiếp; ở đây chúng ta đi theo hướng dựng hình tham số.

   ![Chọn mặt phẳng chuẩn phác thảo](images/02-sketch-plane-pick.png)

2. Giữa khung nhìn sẽ xuất hiện 3 khối vuông mặt phẳng chuẩn bán trong suốt: màu đỏ là mặt YZ, màu xanh lá là mặt ZX, màu xanh dương là mặt XY. Nhấp vào bất kỳ vị trí nào trên khối vuông màu xanh dương (mặt XY).
   Mặc định "Mặt phẳng làm việc động" sẽ lấy đúng mặt phẳng mà bạn nhấp vào, do đó chỉ cần nhấp vào chính khối vuông đó.

3. Trình biên tập phác thảo ngay lập tức mở ra: khung nhìn xoay vuông góc trực diện với mặt phẳng phác thảo, thanh công cụ chuyển sang tab ngữ cảnh **Phác thảo** (tab này chỉ hiển thị trong phiên phác thảo).

   ![Phiên phác thảo](images/03-sketch-session.png)

4. Nhấp vào `Hình chữ nhật`, nhấp một điểm trong khung nhìn làm góc thứ nhất, rồi nhấp điểm thứ hai làm góc đối diện. Trong lúc kéo chuột, thanh trạng thái sẽ hiển thị thời gian thực `Rộng, Cao`.
   Bạn cũng có thể gõ trực tiếp `240,160` sau điểm thứ nhất rồi nhấn Enter để có kích thước chính xác; việc nhấp chọn trên ảnh minh họa chỉ mang tính xấp xỉ kích thước này.

5. Nhấp vào `Đường tròn`, nhấp một điểm gần tâm hình chữ nhật làm tâm đường tròn, nhấp tiếp điểm thứ hai để xác định bán kính (hoặc gõ trực tiếp giá trị bán kính).

6. Nhấn `Esc` để thoát công cụ vẽ hiện tại. Nếu công cụ đang vẽ theo chuỗi, phím `Esc` lần đầu sẽ kết thúc chuỗi hiện tại, lần thứ hai mới thoát hẳn công cụ.

   Ví dụ nhanh này tạm dùng tọa độ nhấp chuột để xác định hình học, do đó phác thảo có thể chưa được ràng buộc đầy đủ. Khi thiết kế thực tế, bạn nên dùng các ràng buộc như `Kích thước`, `Trùng khớp` để cố định chiều rộng, chiều cao, tâm và bán kính; các vị trí lỗ cần cập nhật theo biến số có thể dùng điểm độc lập và biểu thức kích thước. Quy trình hoàn chỉnh xem tại [Mục 12.1](12-workflows.md#121-参数化安装板从变量到交付).

7. Nhấp vào `Thoát phác thảo` trên thanh công cụ, hoặc nhấn `Esc` liên tục cho đến khi quay về tài liệu.

### Bước 2: Đùn khối (Extrude)

1. Trên cây dự án, nhấp vào `Phác thảo 1` vừa tạo (nếu phác thảo đang được chọn sẵn thì bỏ qua).
2. Chuyển sang thanh công cụ **Tham số**, nhấp vào `Đùn khối`.
3. Trong khung nhìn sẽ xuất hiện bản xem trước đùn khối cùng một mũi tên màu xanh dương. Bảng điều khiển lệnh đồng thời xuất hiện:

   ![Bảng lệnh đùn khối](images/05-extrude-panel.png)

   - `Thao tác`: Tạo mới / Thêm vào / Cắt bỏ / Giao nhau
   - `Điều kiện kết thúc`: Theo độ sâu / Xuyên suốt / Đến mặt / Đến điểm
   - `Đối xứng`, `Đảo hướng`, `Khoảng lệch bắt đầu`, `Góc vát thoát khuôn`, `Độ sâu`
4. Trong ô nhập liệu `Độ sâu`, gõ `40` rồi nhấn Enter. Bạn cũng có thể kéo mũi tên xanh để điều chỉnh độ sâu.
5. Nhấn Enter thêm một lần nữa, hoặc nhấp vào dấu tích màu xanh lá bên phải bảng lệnh để áp dụng tính năng.

   Kết quả tạo ra một khối rắn tham số, trên cây dự án xuất hiện `Khối tham số 1`, và phía dưới bảng thuộc tính xuất hiện danh sách "Tính năng".

### Bước 3: Thêm một lỗ

1. Chọn `Khối tham số 1`, nhấp vào `Tạo lỗ` trên thanh công cụ **Tham số**.
2. Trong bảng lệnh, đổi `Đường kính` thành `24`, để trống `Độ sâu` để tạo lỗ xuyên suốt.
3. Nhấp một điểm lên mặt trên của tấm để xác định mặt khoan lỗ.
4. Nhấp chọn tâm lỗ trên mặt đó (có thể nhấp nhiều điểm), nhấn Enter để kết thúc.

### Bước 4: Kiểm tra thành quả

1. Chọn `Khối tham số 1`, bảng thuộc tính sẽ hiển thị danh sách tính năng của nó:

   ![Danh sách tính năng](images/06-feature-list.png)

2. Nhấp vào hàng tính năng bất kỳ (dấu `›` ở cuối hàng chuyển thành `⌄`) để mở rộng và sửa đổi trực tiếp các tham số; nhấn Enter hoặc nhấp ra ngoài để xác nhận. Sau khi sửa đổi, toàn bộ chuỗi tính năng sẽ được tái tạo lại từ đầu. Ký hiệu `⋯` ở cuối hàng là menu để đổi tên, chọn lại tham chiếu, ẩn/nén hoặc xóa tính năng.
3. Sử dụng nút `Khớp nội dung` (biểu tượng hình vuông) ở góc trên bên phải khung nhìn để đưa toàn bộ mô hình vừa vặn vào màn hình.

## 1.5 Lưu tài liệu

Có hai phương thức lưu, sự khác biệt giữa chúng là rất quan trọng:

| Phương thức | Vị trí lưu | Mục đích sử dụng |
| --- | --- | --- |
| `Lưu bản vẽ` (Ctrl+S; trên macOS có thể dùng Cmd+S) | IndexedDB của trình duyệt | Lưu hàng ngày; tài liệu sẽ xuất hiện trong "Dự án gần đây" ở trang chủ |
| `Tải tệp xuống (.chili3d)` | Tải về tệp `.cd` | Sao lưu, đổi trình duyệt/máy tính khác, gửi cho người khác |

- Các biểu tượng góc trên bên trái thanh tiêu đề lần lượt là `Trang chủ`, `Lưu bản vẽ`, `Tải tệp xuống`, `Hoàn tác`, `Làm lại`; để `Mở bản vẽ`, dùng Ctrl+O, nút "Mở bản vẽ" trên trang chủ hoặc kéo thả trực tiếp tệp `.cd` vào cửa sổ.
- **Ứng dụng không tự động lưu.** Hãy chủ động lưu thủ công trước khi đóng tab hoặc đóng tài liệu; các công việc quan trọng nên giữ đồng thời cả tệp `.cd` lẫn bản xuất STEP dự phòng.
- Khi nhấp vào dấu `×` trên tab tài liệu, nút `Đồng ý` trên hộp thoại xác nhận có nghĩa là lưu vào IndexedDB rồi mới đóng, còn nút `Hủy bỏ` có nghĩa là **không lưu và tiếp tục đóng**, chứ không phải quay lại tài liệu. Hộp thoại gốc này không có tùy chọn thứ ba "Hủy thao tác đóng"; nếu muốn giữ lại các chỉnh sửa, hãy chọn `Đồng ý`, và hãy tạo thói quen lưu thủ công trước khi đóng.
- Tệp `.cd` có thể nạp lại bằng `Mở bản vẽ` hoặc kéo thả vào cửa sổ. Nó giữ nguyên ID tài liệu gốc, không tương đương với một bản sao tạo mới ID theo kiểu "Save As".
- Dấu `×` trên thẻ dự án gần đây ở trang chủ sẽ xóa hẳn bản thể tài liệu, không chỉ đơn thuần là gỡ thẻ khỏi danh sách. Tuyệt đối không dùng nó như một phím tắt dọn dẹp danh sách.

Chi tiết về phiên bản, ID tài liệu và sao lưu liên trình duyệt xem tại [Chương 8](08-document-files.md).

<a id="16-三种建模方式怎么选"></a>
## 1.6 Chọn lựa giữa ba phương pháp dựng hình

| Phương pháp | Lối vào | Đặc điểm | Phù hợp với |
| --- | --- | --- | --- |
| Dựng hình trực tiếp | Thanh công cụ **Cơ bản** | Mỗi lệnh trực tiếp tạo/thay thế một nút hình dạng, không lưu lịch sử | Hình khối dùng một lần, sửa chữa mô hình nhập vào |
| Dựng hình tham số | Thanh công cụ **Tham số** + Phác thảo | Khối đặc chỉ lưu danh sách tính năng, sửa đổi phía trên sẽ tự động tái tạo phía dưới | Cần chỉnh sửa kích thước nhiều lần, cần giữ nguyên ý đồ thiết kế |
| Dựng hình bằng AI | Trợ lý AI ở cạnh phải | Mô tả bằng ngôn ngữ tự nhiên, gọi trực tiếp API mô hình của bạn ngay trong ứng dụng | Phác thảo nhanh ý tưởng, chỉnh sửa hàng loạt, truy vấn/đo lường |

Cả ba phương pháp có thể kết hợp cùng nhau: trong cùng một tài liệu vừa có thể đặt khối hộp dựng hình trực tiếp, vừa có thể đặt khối rắn tham số; các thao tác của AI cũng được ghi nhận trong cùng một ngăn xếp hoàn tác. Trước khi kết hợp, cần lưu ý xem lệnh có tiêu thụ nút nguồn hay không, và AI có đang tiếp tục thao tác trên chính khối tham số ban đầu hay không.

**Chỉnh sửa trực tiếp trên bản Pro** là một phương thức khác để sửa đổi hình học hiện có: nhấp đúp vào mô hình để vào chế độ chỉnh sửa, trực tiếp kéo rê hoặc sửa đổi cạnh, mặt; cách truy cập và câu lệnh xem tại [Chương 13](13-pro-direct-editing.md). Đây không phải là trình biên tập lịch sử tham số; nút tham số sau khi chuyển thành nút có thể chỉnh sửa sẽ mất danh sách tính năng, còn thực thể (instance) sẽ được chuyển về nút nguồn để chỉnh sửa.

Nếu muốn tiếp tục làm bài thực hành đầy đủ, bạn có thể xem tiếp tại [Chương 12 Quy trình làm việc điển hình](12-workflows.md).

---

Bước tiếp theo: [Chương 2 Tổng quan giao diện](02-interface.md)
