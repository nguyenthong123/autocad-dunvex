# 2. Tổng quan giao diện

Giao diện chính của Chili3D bao gồm thanh tiêu đề, thanh công cụ Ribbon, khung nhìn, cây dự án, bảng thuộc tính, thanh trạng thái và bảng điều khiển Trợ lý AI. Khi chưa quen với các khái niệm như nút (node), thân tham số (parametric body), thực thể (instance)... bạn có thể tra cứu trước tại [Phụ lục C Bảng thuật ngữ](appendix-glossary.md).

![Tab cơ bản, hình khối cơ sở và giao diện chính](images/08-basic-tab.png)

## 2.1 Thanh tiêu đề

Từ trái sang phải:

| Khu vực | Nội dung |
| --- | --- |
| Thương hiệu | Biểu tượng quả ớt và dòng chữ `Chili3D - v0.8.0`, nhấp vào để quay về trang chủ |
| Trang chủ | Biểu tượng ngôi nhà, quay lại trang khởi động |
| Lệnh nhanh | `Lưu bản vẽ` (Ctrl+S), `Tải tệp xuống`, `Hoàn tác` (Ctrl+Z), `Làm lại` (Ctrl+Y / Ctrl+Shift+Z) |
| Tab Ribbon | `Cơ bản`, `Tham số`, `Quản lý`; khi vào phác thảo sẽ tạm thời xuất hiện tab `Phác thảo` ở bên phải |
| Tab tài liệu | Mỗi tài liệu đang mở có một tab riêng, nhấp vào tab để chuyển đổi; `×` để đóng, dấu `+` bên phải để tạo tài liệu mới |
| Bên phải | Liên kết đến kho mã nguồn GitHub |

Tab tài liệu đồng thời hiển thị tên tài liệu. Tên tài liệu có thể đổi tại nút gốc trên cây dự án + bảng thuộc tính, sau khi lưu sẽ hiển thị trong mục "Dự án gần đây" ở trang chủ.

## 2.2 Thanh công cụ Ribbon

Ribbon là thanh công cụ đa tab theo phong cách Office. Ba tab thường trực gồm:

### Cơ bản

Các lệnh dựng hình trực tiếp, được sắp xếp theo từng nhóm:

| Nhóm | Nội dung |
| --- | --- |
| Vẽ | Đoạn thẳng, hình chữ nhật, cung tròn (4 loại), khối hộp/khối cầu/khối trụ/khối nón/kim tự tháp (menu thả xuống), đùn khối, loft/mặt Gordon (thả xuống), quét dẫn, xoay tròn |
| Chỉnh sửa | Di chuyển, xoay/đối xứng gương/mảng, cắt tỉa/kéo dài/làm rỗng, phân tách/khâu ghép/đơn giản hóa, bo góc/vát mép/phân rã, xóa nút/xóa phần tử con/xóa tính năng |
| Chuyển đổi | Chuyển thành đường bao dây, chuyển thành khối phức hợp, chuyển thành mặt/vỏ/khối đặc |
| Phép toán Boolean | Giao nhau, trừ khối, hợp nhất |
| Mặt phẳng làm việc | Bật/tắt mặt phẳng làm việc động, đặt mặt phẳng làm việc/căn chỉnh theo mặt phẳng/tạo từ mặt cắt |
| Công cụ | Chiếu đường cong, tạo nhóm, đường cong giao nhau/offset/sao chép hình, trong menu thả xuống còn có sửa chữa hình/kiểm tra hình |
| Đo lường | Chiều dài, góc, chọn đối tượng (tổng hợp diện tích/thể tích) |
| Chú thích | Kích thước, bán kính/đường kính/góc, chữ văn bản |
| Khung cảnh | Tạo từ camera (đánh dấu góc nhìn) |
| Nhập/Xuất | Nhập bản vẽ, xuất bản vẽ |
| Khác | Mã QR nhóm hỗ trợ WeChat, bật/tắt Trợ lý AI |

### Tham số

![Thanh công cụ tham số](images/07-parametric-tab.png)

| Nhóm | Nội dung |
| --- | --- |
| Phác thảo | Tạo phác thảo mới, chỉnh sửa phác thảo |
| Tạo | Mặt phẳng chuẩn, khối hộp/khối trụ/khối cầu/khối nón (thả xuống), đùn khối, xoay/loft/quét dẫn, làm dày/gân/đường xoắn ốc |
| Tính năng | Đẩy-kéo, bo góc/vát mép/sửa bo góc/sửa vát mép (thả xuống), góc vát thoát khuôn, làm rỗng, offset mặt/phân tách/lỗ, gỡ tính năng/mảng tuyến tính/mảng xoay/mảng theo đường dẫn (thả xuống), đối xứng gương |
| Phép toán Boolean | Hợp nhất, trừ khối, giao nhau |
| Thao tác nút | Di chuyển, xoay/đối xứng/tách độc lập, xóa/sơn màu/mảng |
| Chú thích | Giống tab Cơ bản |
| Nhập/Xuất | Giống tab Cơ bản |
| Khác | Biến số, nhóm WeChat, Trợ lý AI |

### Quản lý

Hiện tại chỉ có lệnh `Kiểm tra hiệu năng` (tạo 20×20×20 khối hộp ngẫu nhiên trong một tài liệu mới và báo cáo thời gian xử lý), dùng để kiểm tra sơ bộ hiệu năng của nhân dựng hình và bộ kết xuất.

### Phác thảo (Tab ngữ cảnh)

Chỉ xuất hiện khi vào phiên làm việc phác thảo, bao gồm 5 nhóm: Thoát phác thảo, Vẽ, Ràng buộc, Kích thước, Chỉnh sửa, Khác: xem chi tiết tại [Chương 7](07-sketch.md).

### Nút gộp thả xuống của nhóm

Nút có mũi tên tam giác nhỏ bên phải tên nhóm là nút phân tách (split button): nhấp trực tiếp vào nút chính để thực thi lệnh "chính", nhấp vào tam giác nhỏ để mở rộng các lệnh còn lại. Ví dụ: nút chính của "Chỉnh sửa → Xoay" là xoay, mở rộng bên dưới còn có đối xứng gương và mảng.

<a id="23-视口"></a>
## 2.3 Khung nhìn

Khung nhìn là khu vực 3D ở trung tâm, góc trên bên trái hiển thị chế độ hiển thị hiện tại, ví dụ `[ Khối đặc và khung dây ]`.

### Chế độ hiển thị

Nhấp vào dòng chữ `[ Khối đặc và khung dây ]` ở góc trên bên trái để mở menu:

- **Khối đặc**: Chỉ hiển thị bề mặt khối được tô bóng.
- **Khung dây**: Chỉ hiển thị các cạnh viền.
- **Khối đặc và khung dây**: Tô bóng + cạnh viền (mặc định).

### Điều khiển Camera (Dải nút dọc bên phải khung nhìn)

| Biểu tượng | Chức năng |
| --- | --- |
| Biểu tượng hình chiếu trực diện | Chuyển sang phép chiếu trực giao (Orthographic) |
| Biểu tượng phối cảnh | Chuyển sang phép chiếu phối cảnh (Perspective, mặc định) |
| Khung bốn góc | Khớp nội dung (ưu tiên đối tượng đang chọn; nếu không chọn gì thì khớp toàn bộ khung cảnh) |
| Kính lúp + | Phóng to lấy tâm khung nhìn làm chuẩn |
| Kính lúp − | Thu nhỏ lấy tâm khung nhìn làm chuẩn |

### Trục tọa độ chỉ hướng

Quả cầu màu X/Y/Z ở góc trên bên phải khung nhìn là bộ chỉ hướng trục tọa độ, không phải khối lập phương điều hướng:

- Nhấp vào quả cầu bất kỳ: Camera xoay nhìn trực diện theo trục đó.
- Nhấn giữ và kéo chuột: Xoay tự do quanh mô hình.

### Đánh dấu góc nhìn (Khung cảnh)

Nhấp **Cơ bản → Khung cảnh → Tạo từ camera**, hệ thống sẽ lưu vị trí camera, điểm ngắm và hướng lên hiện tại thành một thẻ đánh dấu "khung cảnh", xuất hiện ở chính giữa đáy khung nhìn. Sau đó:

- Nhấp vào thẻ: Camera bay mượt về góc nhìn đó.
- Nhấp vào bánh răng bên phải thẻ: Đổi tên.
- Nhấp vào dấu `×`: Xóa thẻ đánh dấu.

## 2.4 Cây dự án

Phía trên bên trái là cây dự án, hiển thị cấu trúc phân cấp các nút của tài liệu hiện tại.

![Cây dự án và bảng thuộc tính](images/06-feature-list.png)

- **Chọn đối tượng**: Nhấp chuột trái để chọn; `Ctrl+nhấp chuột` để bật/tắt chọn nhiều đối tượng (trên macOS cũng dùng `Ctrl`, không dùng `Cmd`); `Shift+nhấp chuột` để chọn một dải liên tục.
- **Hiển thị**: Biểu tượng con mắt ở cuối hàng để bật/tắt hiển thị hoặc ẩn. Khi nút cha bị ẩn, biểu tượng mắt của các nút con sẽ bị xám mờ.
- **Đổi tên**: Không thể đổi tên trực tiếp trên cây. Chọn nút rồi sửa mục "Tên đối tượng" trong bảng thuộc tính.
- **Phân cấp**: Cây hỗ trợ thư mục (biểu tượng đầu tiên trên thanh công cụ) và kéo thả. Kéo một hàng vào **thư mục** sẽ biến nó thành nút con của thư mục đó; kéo vào hàng thông thường sẽ chèn vào ngay trước hàng đó (cùng cấp cha). Các đầu vào ẩn bên dưới thân tham số (các công cụ đã bị tiêu thụ) không thể kéo tách riêng ra ngoài.
- **Dấu hiệu cảnh báo**: Khi bên phải nút xuất hiện dấu `!`, rê chuột vào để xem nguyên nhân (ví dụ: tham chiếu ngoài của phác thảo bị mất).
- **Thanh công cụ**: Tạo thư mục mới, thu gọn tất cả, mở rộng tất cả.
- **Phác thảo**: Nhấp đúp vào nút phác thảo để vào phiên chỉnh sửa phác thảo.

## 2.5 Bảng thuộc tính

Phía dưới bên trái hiển thị các thuộc tính của đối tượng đang được chọn. Trước tiên hãy xác nhận trên cây dự án rằng bạn đã chọn đúng nút đích; các khối thường gặp:

1. **Tên đối tượng**: Nhập văn bản, nhấn Enter để xác nhận.
2. **Ma trận** (có thể mở rộng): Tịnh tiến, xoay, tỷ lệ thu phóng, chỉ xuất hiện trên các nút hỗ trợ biến đổi trực tiếp. Di chuyển thân tham số sẽ được ghi lại thành tính năng, phác thảo cũng không hỗ trợ sửa ma trận trực tiếp.
3. **Tham số hình học**: Chỉ hiển thị các trường có thể chỉnh sửa thực tế của nút đó, ví dụ dài/rộng/cao của khối hộp, rộng/cao của hình chữ nhật, bán kính của đường tròn, bán kính và chiều cao của khối trụ, chiều dài đùn khối. Thay đổi sẽ tái tạo lại nút đó ngay lập tức và được tính là một bước hoàn tác.
4. **Vật liệu**: Hiển thị tên vật liệu hiện tại; nhấp vào ô màu để mở trình chỉnh sửa vật liệu (xem [Mục 5.6](05-modify-convert-measure.md#56-材质与外观)).
5. **Tính năng** (chỉ có ở thân tham số): Danh sách tính năng có thứ tự, mỗi hàng có thể mở rộng tham số, sắp xếp lại thứ tự, ẩn/nén, đổi tên, chọn lại tham chiếu và xóa. Chi tiết xem tại [Chương 6](06-parametric-modeling.md).

Các chỉnh sửa trong bảng thuộc tính có hiệu lực ngay lập tức, và cùng sửa đổi các thuộc tính tầng dưới giống như lệnh `set_node_properties` của AI. Tuy nhiên đây không phải là bản sao chép đầy đủ của bảng lệnh ban đầu: **chỉ có những trường thực sự được liệt kê mới có thể chỉnh sửa**. Những đầu vào không xuất hiện như biên dạng cắt, trục xoay, đường dẫn quét... không thể bổ sung sửa đổi ở đây; những kết quả dựng hình trực tiếp dạng này thường chỉ có thể hoàn tác rồi làm lại, hoặc tái tạo bằng thân tham số, xem chi tiết tại [Mục 4.6](04-direct-modeling.md#46-直接建模的编辑方式).

Sau khi sửa đổi, trước tiên hãy kiểm tra kết quả trong khung nhìn và trên cây dự án. Nếu hình dạng bất thường hoặc sửa nhầm đối tượng, hãy lập tức nhấn `Ctrl+Z` để hoàn tác lần chỉnh sửa này; không nên tiếp tục xếp chồng các lệnh khác lên kết quả đã sai.

## 2.6 Thanh trạng thái

Thanh trạng thái ở đáy màn hình chia làm hai nửa:

- **Bên trái**: Dòng nhắc hiện tại. Mặc định hiển thị thao tác điều hướng (`Chuột giữa kéo lia khung nhìn, Shift+Chuột giữa xoay khung nhìn, Con lăn cuộn thu phóng khung nhìn`); khi thực thi lệnh sẽ hiển thị việc cần làm tiếp theo, ví dụ "Vui lòng chọn mặt", "Vui lòng chọn cạnh", "Nhấn Enter để kết thúc". **Khi thấy băn khoăn chưa rõ bước tiếp theo, hãy nhìn vào dòng này trước tiên.**
- **Bên phải**: Hộp kiểm `Bắt điểm` điều khiển công tắc chính, mũi tên nhỏ bên cạnh mở rộng 8 kiểu bắt điểm; công tắc `Dò gióng` riêng biệt, ý nghĩa xem tại [Mục 3.5](03-view-navigation-selection.md#35-捕捉与追踪). Mục `Lỗi: n` mở "Nhật ký lỗi", có thể xem chi tiết các lỗi gần đây hoặc xóa sạch nhật ký.

<a id="27-命令面板"></a>
## 2.7 Bảng điều khiển lệnh

Khi thực thi các lệnh cần nhập tham số, phía trên khung nhìn sẽ xuất hiện một bảng điều khiển nổi, hiển thị biểu tượng lệnh, tên lệnh, các tùy chọn có thể điều chỉnh cùng các nút xác nhận/hủy bỏ.

![Bảng lệnh đùn khối](images/05-extrude-panel.png)

- Tùy chọn bao gồm hộp thả xuống (thao tác, điều kiện kết thúc), ô nhập văn bản (độ sâu, khoảng lệch, góc), hộp kiểm (đối xứng, đảo hướng, hợp nhất).
- Nhập văn bản **sẽ xác nhận áp dụng khi mất tiêu điểm (blur) hoặc khi nhấn Enter**, sau đó bản xem trước trong khung nhìn sẽ cập nhật.
- Khi cần chọn đối tượng, phía bên phải bảng hiển thị số lượng đã chọn, dấu tích xanh (xác nhận) và dấu chéo đỏ (hủy bỏ).
- `Esc` hủy toàn bộ lệnh; `Enter` / `Space` xác nhận thao tác chọn hiện tại hoặc áp dụng giá trị kéo rê.

## 2.8 Bảng điều khiển Trợ lý AI

Bảng điều khiển Trợ lý AI neo ở cạnh phải: có thể đóng lại, kéo ra thành cửa sổ nổi, rồi kéo thả neo trở lại. Chi tiết xem tại [Chương 9](09-ai-assistant.md).

![Trợ lý AI](images/13-ai-panel.png)

## 2.9 Tab ngữ cảnh "Chỉnh sửa" của bản Pro

Chỉ có trên phiên bản **Chili3D Pro**. Khi nhấp đúp vào mô hình trong khung nhìn để vào chế độ chỉnh sửa trực tiếp, thanh công cụ Ribbon sẽ tự động hiển thị tab **Chỉnh sửa**; khi thoát ra sẽ tự động đóng lại.

| Nhóm | Nội dung |
| --- | --- |
| Phân tách | Đoạn thẳng, cung tròn (4 loại), đường tròn/elip, hình chữ nhật/đa giác, offset; các công cụ vẽ ngoại trừ offset đều có thể chuyển thành đường hỗ trợ |
| Chỉnh sửa | Di chuyển, sao chép, xoay, đối xứng gương, mảng; thao tác trên hình con hoặc đường phân tách của nút hiện tại |
| Công cụ | Đẩy-kéo, offset mặt, đơn giản hóa, sửa chữa, bo góc/vát mép, xóa tính năng |
| Quản lý | Cài đặt chỉnh sửa (chế độ cô lập, kéo rê sửa bo góc), Thoát |

Khi chỉnh sửa chỉ thao tác trên nút có thể chỉnh sửa hiện tại, các đối tượng khác sẽ bị khóa hoặc ẩn tùy theo cài đặt. Nút tham số khi nhấp đúp cần được chuyển đổi trước, việc chuyển đổi sẽ làm mất danh sách tính năng ban đầu; hướng dẫn thao tác đầy đủ và các lưu ý xem tại [Chương 13 Pro chỉnh sửa trực tiếp](13-pro-direct-editing.md).

---

Bước tiếp theo: [Chương 3 Góc nhìn, chọn đối tượng và bắt điểm](03-view-navigation-selection.md)
