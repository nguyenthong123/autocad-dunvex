# 12. Quy trình làm việc điển hình

Các chương trước được tổ chức theo giao diện và lệnh. Chương này được tổ chức theo nhiệm vụ thực tế, xâu chuỗi các lệnh thường dùng thành quy trình hoàn chỉnh. Kích thước trong ví dụ đều tính bằng milimét (mm), góc tính bằng độ (°); khi thực hành lần đầu, bạn nên tạo một tài liệu mới và lưu trước một lần.

<a id="121-参数化安装板从变量到交付"></a>
## 12.1 Tấm gá lắp tham số: Từ biến số đến bàn giao

Mục tiêu: Tạo một tấm gá lắp kích thước **120 × 80 × 8**, ở bốn góc có bốn lỗ thông tiêu chuẩn M8 dung sai thường, tâm lỗ cách hai cạnh liền kề một khoảng 15, bốn cạnh đứng phía ngoài bo góc bán kính 3. Cuối cùng đổi chiều rộng tấm thành 140, kiểm tra xem vị trí lỗ và góc bo có tự động cập nhật theo chuỗi tính năng hay không.

### Bước 1: Thiết lập biến số

1. Tạo tài liệu mới; nếu tự động hiện hộp thoại "Cài đặt Trợ lý AI", trước tiên hãy nhấp `Hủy`. Chọn node gốc trong cây dự án, trên bảng thuộc tính đổi tên tài liệu thành `Tấm gá lắp tham số`, rồi nhấn `Ctrl+S` để lưu.
2. Mở **Tham số → Khác → Biến số**.
3. Nhập tên biến vào dòng "Tên" còn trống ở dưới đáy bảng, nhấn `Enter` để tạo biến, sau đó thiết lập kiểu và giá trị:

| Tên | Kiểu | Giá trị | Công dụng |
| --- | --- | --- | --- |
| `plateWidth` | Chiều dài | `120` | Tổng chiều rộng của tấm theo phương X |
| `plateDepth` | Chiều dài | `80` | Tổng chiều sâu của tấm theo phương Y |
| `plateThickness` | Chiều dài | `8` | Chiều dày đùn khối |
| `holeInset` | Chiều dài | `15` | Khoảng cách từ tâm lỗ đến hai cạnh liền kề |

Biến số chỉ có thể tham chiếu các biến nằm ở phía trên nó. Mỗi lần sửa đổi sẽ được ấn định khi rời tiêu điểm hoặc nhấn `Enter`; việc đóng bảng biến số không hoàn tác các thay đổi.

### Bước 2: Vẽ và ràng buộc đầy đủ phác thảo

1. Nhấp **Tham số → Tạo phác thảo mới**, chọn mặt phẳng chuẩn XY màu xanh dương.
2. Dùng công cụ `Hình chữ nhật` vẽ một hình chữ nhật tùy ý. Công cụ hình chữ nhật đã tự động tạo các ràng buộc khép kín, nằm ngang và thẳng đứng, không cần thêm lặp lại.
3. Dùng lệnh `Trùng khớp` để ràng buộc góc dưới bên trái trùng với gốc tọa độ phác thảo; cũng có thể dùng lệnh `Cố định` để cố định góc dưới bên trái, rồi nhấp đúp vào huy hiệu ràng buộc cố định để đặt tọa độ thành `0, 0`.
4. Dùng lệnh `Kích thước` đo một cạnh ngang, nhập `plateWidth`; đo một cạnh đứng, nhập `plateDepth`.
5. Dùng công cụ `Điểm` đặt bốn điểm độc lập bên trong hình chữ nhật. Các điểm này không phải là điểm mút đoạn thẳng, cũng không phải tâm hình tròn, sau này có thể được tính năng tạo lỗ tham chiếu trực tiếp.
6. Lần lượt thêm `Khoảng cách ngang` và `Khoảng cách dọc` từ mỗi điểm đến góc dưới bên trái của hình chữ nhật, sử dụng các biểu thức trong bảng sau:

| Điểm | Khoảng cách ngang | Khoảng cách dọc |
| --- | --- | --- |
| Lỗ dưới trái | `holeInset` | `holeInset` |
| Lỗ dưới phải | `plateWidth - holeInset` | `holeInset` |
| Lỗ trên trái | `holeInset` | `plateDepth - holeInset` |
| Lỗ trên phải | `plateWidth - holeInset` | `plateDepth - holeInset` |

7. Quan sát thanh trạng thái: Mục tiêu không phải là "trông có vẻ gần đúng", mà phải hiển thị rõ **Ràng buộc đầy đủ**. Nếu vẫn còn bậc tự do dư thừa, hãy tìm các đối tượng màu xanh dương và kiểm tra kích thước bị sót; nếu xung đột, hãy xử lý ràng buộc trước, không tiếp tục đùn khối.

Ở đây biên dạng chữ nhật khép kín dùng để đùn khối, còn bốn điểm độc lập chỉ dùng để định vị lỗ, sẽ không biến thành các biên dạng đùn thừa. Thao tác chi tiết xem tại [Chương 7](07-sketch.md).

### Bước 3: Đùn thân tấm

1. Thoát phác thảo, chọn phác thảo trong cây dự án, nhấp **Tham số → Đùn**.
2. Mục `Thao tác` chọn `Tạo mới`, `Điều kiện kết thúc` chọn `Độ sâu cho trước`, `Độ sâu` nhập `plateThickness`.
3. Xác nhận hình ảnh xem trước chỉ có một tấm đặc duy nhất, không có hình học thừa sinh ra từ bốn điểm, rồi mới xác nhận tính năng.
4. Chọn thân tham số vừa tạo, mở rộng danh sách tính năng trên bảng thuộc tính, xác nhận mục đầu tiên là Đùn.

Nếu cần đùn về cả hai phía của mặt phẳng biên dạng, lưu ý rằng tùy chọn `Đối xứng` là mỗi bên dùng trọn vẹn "Độ sâu" đã cho, chứ không phải chia đôi độ sâu.

### Bước 4: Tạo lỗ tiêu chuẩn từ các điểm phác thảo

1. Trong cây dự án, bật hiển thị lại phác thảo vừa rồi, khởi động **Tham số → Tạo lỗ**. Khi cần thiết có thể xoay góc nhìn để tránh bị thân đặc che khuất.
2. Làm theo hướng dẫn trên thanh trạng thái, lần lượt nhấp vào dấu chữ thập của bốn điểm độc lập; nhấp chuột trong lệnh sẽ bật/tắt trạng thái chọn của điểm, không cần giữ phím `Shift`. Bốn điểm bắt buộc phải đến từ cùng một phác thảo.
3. Trên bảng lệnh, chuyển `Kiểu` thành `Đơn giản`, để trống ô `Độ sâu` khi tạo để biểu thị lỗ xuyên thủng hoàn toàn.
4. Nhấn `Enter`/`Space` hoặc nút xác nhận để kết thúc việc chọn điểm. Ứng dụng sẽ cố gắng tìm mặt khoan đồng phẳng dựa trên phác thảo; nếu báo không tìm thấy, bạn chỉ cần nhấp thêm một lần vào mặt đáy hoặc mặt trên của tấm, các điểm đã chọn vẫn được giữ nguyên. Kiểm tra bản xem trước và xác nhận lại theo thông báo để hoàn thành lệnh tạo lỗ.
5. Mở rộng tính năng lỗ vừa tạo, trong danh sách `Preset` chọn `M8 · normal · ⌀9`. Preset sẽ ghi đường kính lỗ dung sai thường 9 vào tham số; sau đó bạn vẫn có thể sửa giá trị độc lập.
6. Kiểm tra cả bốn lỗ đều xuyên suốt tấm và định vị chuẩn theo bốn điểm phác thảo.

Preset dùng để bắt bu-lông thông qua và chìm đầu, không tạo ren thực tế và không phải bảng lỗ mồi taro ren. Khi cần bậc trụ hoặc vát côn, chuyển sang dùng `Lỗ bậc` hoặc `Lỗ côn`, rồi chọn preset tương ứng. Tham số đầy đủ xem tại [Chương 6](06-parametric-modeling.md).

### Bước 5: Thêm bo góc và sửa kích thước thượng nguồn

1. Nhấp **Tham số → Bo góc**, chọn bốn cạnh đứng phía ngoài, đặt `Bán kính = 3` và xác nhận. Không chọn các cạnh miệng lỗ.
2. Mở bảng biến số, đổi `plateWidth` từ `120` thành `140`.
3. Chờ quá trình tái dựng hoàn tất rồi kiểm tra:
   - Tổng chiều rộng của tấm chuyển thành 140, chiều sâu và độ dày không đổi;
   - Các lỗ bên trái vẫn cách cạnh trái 15, các lỗ bên phải vẫn cách cạnh phải 15;
   - Cả bốn lỗ và bốn góc bo vẫn tồn tại nguyên vẹn, hàng tính năng không có lỗi hoặc thiếu đầu vào.
4. Dùng **Cơ bản → Đo lường → Chiều dài** đo khoảng cách tâm giữa hai lỗ cùng hàng bên trái và bên phải, giá trị phải là `plateWidth - 2 * holeInset = 110`. Dùng tiếp `Đo lường → Chọn` ghi lại thể tích để đối chiếu khi bàn giao.

Nếu sau khi sửa mà báo lỗi, hình ảnh trong khung nhìn có thể vẫn là hình dạng của lần thành công trước đó, điều này không có nghĩa là tham số mới đã có hiệu lực. Hãy hoàn tác ngay việc sửa biến số vừa rồi, rồi kiểm tra lần lượt từ tính năng bị lỗi đầu tiên; đừng vừa thấy mô hình cũ là vội vàng xuất tệp.

### Bước 6: Lưu và xuất tệp

1. Nhấn `Ctrl+S` để lưu tài liệu có thể tiếp tục chỉnh sửa.
2. Dùng tiếp `Lưu thành tệp` tải về tệp `.cd` làm bản sao lưu độc lập.
3. Chọn thân tham số, thực hiện **Nhập/Xuất → Xuất**, chọn định dạng STEP; khi cần trao đổi với các phần mềm CAD khác, hãy ưu tiên dùng STEP thay vì STL.
4. Mở lại tệp đã xuất hoặc nhập vào một tài liệu mới khác để kiểm tra kích thước, lỗ và góc bo. Việc xuất thành công không đảm bảo phía người nhận chắc chắn đọc đúng 100%, trước khi bàn giao hãy kiểm tra lại một lần trong phần mềm đích.

<a id="122-导入模型检查修补与重新导出"></a>
## 12.2 Nhập mô hình: Kiểm tra, sửa chữa và xuất lại

Dựng hình trực tiếp rất thích hợp để xử lý hình học nhập vào không có lịch sử tính năng. Trước khi bắt đầu hãy giữ lại tệp gốc, không chỉ dựa vào thao tác hoàn tác.

![Cây dự án và mô hình sau khi nhập BREP](images/20-imported-model.png)

*Sau khi nhập BREP, tên tệp xuất hiện trong cây dự án; tiếp theo bạn có thể kiểm tra, đo đạc hoặc sửa chữa hình học.*

### Lựa chọn định dạng phù hợp

| Đầu vào | Lộ trình khuyến nghị | Lưu ý |
| --- | --- | --- |
| STEP / IGES / BREP | Sau khi nhập kiểm tra trực tiếp hình học chính xác | Thích hợp đo đạc, Boolean và chỉnh sửa cục bộ; IGES vẫn cần kiểm tra độ khâu kín của mặt cong |
| STL | Sau khi nhập xử lý như mô hình lưới tam giác | Không khôi phục lại mặt cong CAD trơn ban đầu, không đáp ứng được khả năng chỉnh sửa chính xác như STEP |
| `.cd` | Mở toàn bộ tài liệu Chili3D | Khớp nghiêm ngặt phiên bản định dạng tài liệu, không phải định dạng trung gian |

### Quy trình thao tác

1. **Nhập tệp**: Thực hiện **Cơ bản → Nhập/Xuất → Nhập**. Khi đang có tài liệu mở, mô hình được thêm vào tài liệu hiện tại và chưa tự động lưu; khi chưa có tài liệu nào mở thì tạo mới tài liệu `Untitled`.
2. **Định vị**: Bỏ chọn các đối tượng rồi bấm `Khớp nội dung (Fit content)`, chuyển sang chế độ hiển thị `Thực thể và khung dây` để kiểm tra các cạnh và lỗ hở.
3. **Kiểm tra**: Chọn node nhập vào, thực hiện `Kiểm tra hình dạng`, ghi lại các mặt không hợp lệ hoặc sự cố cấu trúc liên kết.
4. **Sửa chữa**: Thực hiện `Sửa chữa hình dạng` trên bản sao hoặc tài liệu đã sao lưu trước, sau đó kiểm tra lại. Không lấy việc "hiển thị được" thay thế cho "hình học hợp lệ".
5. **Chỉnh sửa theo nhu cầu**:
   - Các vấu lồi nhỏ, góc bo thừa... có thể thử dùng `Xóa tính năng` hoặc `Xóa phần tử con`;
   - Khi nhiều mặt tách rời cần ghép thành vỏ kín, dùng `Khâu` và kiểm tra dung sai;
   - Khi cần Boolean, xác định rõ mục tiêu và công cụ, và quyết định có tích chọn `Giữ lại đối tượng thao tác` hay không;
   - Khi chỉ cần loại bỏ các đường phân tách trùng lặp, hãy thử dùng `Đơn giản hóa`, rồi so sánh hình học trước và sau khi sửa.
6. **Đo đạc**: Kiểm tra ngẫu nhiên các chiều dài, diện tích và thể tích quan trọng. Mô hình dạng lưới hoặc mô hình sau khi sửa chữa đặc biệt cần xác nhận kích thước không bị lệch do hiểu sai đơn vị hoặc tỷ lệ co giãn.
7. **Lưu kết quả trung gian**: Trước và sau các sửa đổi lớn hãy thực hiện `Lưu thành tệp` để giữ lại tệp `.cd` có thể quay lui.
8. **Xuất tệp**: Bàn giao CAD chính xác ưu tiên dùng STEP/BREP; in 3D hoặc quy trình làm việc với lưới mới chọn STL/OBJ/PLY, và xác nhận đơn vị, định dạng mà bên tiếp nhận yêu cầu.

Mỗi bước chỉnh sửa đều có thể thay thế node gốc. Khi phát hiện kết quả không đúng, nhấn `Ctrl+Z` ngay, đừng tiếp tục chắp vá trên một chuỗi kết quả sai. Chi tiết xem tại [Chương 4](04-direct-modeling.md) và [Chương 5](05-modify-convert-measure.md).

## 12.3 Cộng tác cùng AI: Viết rõ yêu cầu, kiểm tra kỹ kết quả

AI có thể giảm bớt các thao tác lặp lại, nhưng không thể thay thế việc kiểm tra hình học của con người. Yêu cầu bạn đưa cho AI càng giống một bản thuyết minh thiết kế thu nhỏ thì kết quả càng dễ kiểm chứng.

### Cấu trúc câu lệnh nhắc (Prompt)

Cố gắng bao gồm các thông tin sau:

- **Đối tượng**: Chi tiết tạo mới, hoặc node nào đang được chọn;
- **Kích thước và đơn vị**: Dài, rộng, cao, đường kính, bán kính, góc, ghi rõ milimét/độ;
- **Vị trí và chuẩn**: So với gốc tọa độ, mặt nào, cạnh nào hoặc tâm lỗ đã có;
- **Cách dựng hình**: Yêu cầu giữ lại tính năng tham số, hay cho phép dựng hình trực tiếp;
- **Điều kiện bảo toàn**: Những mặt, lỗ, góc bo, node hoặc vật liệu nào không được thay đổi;
- **Tiêu chuẩn hoàn thành**: Mong muốn kiểm tra những kích thước, tính năng hoặc giá trị đo đạc nào.

Ví dụ:

```text
Hãy dùng tính năng tham số tạo một tấm gá lắp kích thước 120 × 80 × 8 mm.
Phác thảo đặt trên mặt phẳng XY, chiều rộng tấm theo X, chiều sâu theo Y, chiều dày theo +Z.
Tạo ba biến số chiều dài plateWidth, plateDepth, plateThickness để điều khiển kích thước.
Trước mắt chỉ làm phác thảo và đùn khối, chưa thêm lỗ hay bo góc; làm xong hãy cho tôi biết danh sách tính năng và kích thước thực tế.
```

Sau khi xác nhận bước 1 đã đúng, gửi tiếp:

```text
Tiếp tục sử dụng cùng thân tham số này, không thay thế bằng node dựng hình trực tiếp.
Tại vị trí cách đều bốn cạnh 15 mm, thêm bốn lỗ thông đường kính 9 mm, sau đó đo chiều dài, chiều rộng, chiều cao của tấm.
Nếu không thể duy trì tham chiếu tham số, vui lòng giải thích trước, không tự ý xóa dựng lại toàn bộ chi tiết.
```

### Kiểm tra sau mỗi lượt

1. Xem cây dự án: Là thêm tính năng trên thân tham số gốc, hay vô tình sinh ra hình dạng độc lập.
2. Xem danh sách tính năng: Thao tác, kích thước và tham chiếu có đúng yêu cầu không, có cảnh báo hay thiếu đầu vào không.
3. Xem khung nhìn: Hướng, vòng trong/ngoài, vị trí lỗ, đối tượng bo góc có chính xác không.
4. Thực hiện đo đạc: Tối thiểu kiểm tra ngẫu nhiên một kích thước tổng thể và một kích thước cục bộ, không chỉ đọc câu trả lời văn bản.
5. Thử sửa thượng nguồn: Khi cần tham số hóa, hãy thử sửa một biến số để xác nhận hạ nguồn thực sự biến đổi theo liên kết.

Khi chưa hài lòng, bạn có thể dùng nút `Cuộn lại` của tin nhắn đó để khôi phục cả tài liệu và hội thoại, hoặc dùng `Ctrl+Z` để hoàn tác lệnh dựng hình tương ứng. Nhiều lần gọi công cụ liên tiếp có thể tương ứng với nhiều bước hoàn tác.

### Kiểm tra quyền riêng tư trước khi chia sẻ

Tóm tắt node tài liệu, vùng chọn, kết quả truy vấn công cụ, ảnh chụp màn hình khung nhìn và ảnh tham khảo có thể được gửi tới endpoint mô hình đã cấu hình. Cuộc hội thoại được lưu cùng tài liệu và cũng có thể nằm trong tệp `.cd`. Trước khi chia sẻ tệp, hãy xóa các hội thoại lịch sử không cần thiết, rồi thực hiện `Lưu` và `Lưu thành tệp` để đảm bảo tài liệu xuất ra đã được cập nhật; đừng hiểu nhầm "không qua trung gian Chili3D" là dữ liệu hoàn toàn không rời khỏi máy tính. Chi tiết xem tại [Chương 9](09-ai-assistant.md).

## 12.4 Danh mục kiểm tra trước khi bàn giao

### Hình học và tham số

- [ ] Trong khung nhìn không có lỗi tính năng bị che giấu bởi việc dựa dẫm vào "hình dạng thành công lần trước".
- [ ] Phác thảo được ràng buộc đầy đủ theo yêu cầu thiết kế, không có xung đột hoặc dư thừa chưa xử lý.
- [ ] Các kích thước, diện tích hoặc thể tích quan trọng đã được kiểm tra ngẫu nhiên, đơn vị rõ ràng là milimét.
- [ ] Lệnh `Kiểm tra hình dạng` không báo cáo vấn đề nào cần xử lý tiếp.
- [ ] Các thông tin gia công chế tạo như lỗ, ren, lỗ bậc không bị nhầm lẫn bởi ngoại quan hình học; preset lỗ không đồng nghĩa với ren thực tế.
- [ ] Các instance cần chỉnh sửa độc lập đã được thực hiện `Tách độc lập`, không có sự liên kết ngoài ý muốn.

### Tệp tin và dữ liệu

- [ ] Đã thực hiện `Lưu`, và dùng `Lưu thành tệp` lưu lại bản sao lưu `.cd`.
- [ ] Hình học chính xác được lưu riêng thành STEP/BREP; định dạng lưới chỉ dùng cho các quy trình phù hợp.
- [ ] Nắm rõ phiên bản định dạng tài liệu Chili3D của bên nhận, hoặc chuyển sang dùng định dạng trung gian để tránh rào cản phiên bản.
- [ ] Không lấy bản sao lưu có cùng ID tài liệu xem như bản sao "Save as" độc lập để rồi ghi đè liên tục.
- [ ] Trước khi chia sẻ tệp `.cd` đã kiểm tra kỹ các cuộc hội thoại AI, hình ảnh tham khảo và dữ liệu tài liệu khác.
- [ ] Plugin đến từ nguồn đáng tin cậy; các tài liệu quan trọng không giao cho script không rõ nguồn gốc xử lý.

---

Chương trước: [Chương 11 Câu hỏi thường gặp](11-faq.md) · Bước tiếp theo: [Chương 13 Chỉnh sửa trực tiếp Pro](13-pro-direct-editing.md) · Quay lại [Mục lục sổ tay](README.md) · Tra cứu [Phụ lục C Bảng thuật ngữ](appendix-glossary.md)
