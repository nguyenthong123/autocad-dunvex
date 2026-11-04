# 4. Dựng hình trực tiếp: Vẽ hình, cấu trúc và Boolean

Dựng hình trực tiếp (tab **Cơ bản**) thao tác trực tiếp trên hình học: mỗi lệnh sẽ tạo ra một nút hình dạng mới hoặc thay thế nút cũ bằng một hình dạng mới, **không lưu lại lịch sử tính năng tham số**. Ưu điểm là nhanh, áp dụng linh hoạt cho cả các mô hình nhập vào từ bên ngoài; khi sửa đổi kích thước, bạn chỉ có thể chỉnh sửa các trường dữ liệu mà bảng thuộc tính thực sự cung cấp, hoặc phải hoàn tác rồi làm lại / vẽ lại từ đầu, không thể quay ngược dòng thời gian để sửa đổi toàn bộ lịch sử lệnh.

Nếu cần lưu lại các mối quan hệ tính năng có thể chỉnh sửa, vui lòng dùng thân tham số trong tab **Tham số**, xem chi tiết tại [Chương 6](06-parametric-modeling.md).

![Mặt bích xanh có lỗ tạo bằng dựng hình trực tiếp](images/15-direct-modeling.png)

*Ví dụ dựng hình trực tiếp: Mặt bích gồm tấm đáy, vấu lồi hình trụ và lỗ, kết quả không phụ thuộc vào chuỗi tính năng tham số.*

## 4.1 Phương thức thao tác chung

- Sau khi khởi động lệnh, thanh trạng thái sẽ hướng dẫn rõ bước tiếp theo cần chọn đối tượng gì.
- Khi chọn đối tượng, rê chuột để làm nổi bật (highlight), nhấp chuột trái để xác nhận; khi cần chọn nhiều đối tượng thì nhấp liên tiếp, nhấn `Enter`/`Space` để kết thúc.
- `Esc` để hủy lệnh hiện tại hoặc hủy lượt chọn đối tượng hiện tại.
- Các tùy chọn trong bảng điều khiển lệnh có thể thay đổi bất kỳ lúc nào, sau khi sửa xong bản xem trước sẽ làm mới ngay.
- Mỗi lần hoàn thành một lệnh được tính là một bước hoàn tác (Ctrl+Z).
- Trước khi xác nhận, hãy kiểm tra kỹ các đối tượng được chọn, bản xem trước và các tùy chọn có nguy cơ tiêu thụ nút nguồn; sau khi xác nhận, hãy kiểm tra xem nút kết quả và nút nguồn có đúng như mong muốn không. Nếu chọn nhầm đầu vào hoặc vô tình xóa mất nút nguồn, hãy hoàn tác ngay, không nên tiếp tục dựng hình trên kết quả sai sót.

## 4.2 Nhóm Vẽ (Draw)

### Đoạn thẳng (L)

Nhấp chọn điểm đầu, điểm cuối. Mặc định là **vẽ liên tục**: sau khi vẽ xong một đoạn sẽ tự động nối tiếp từ điểm cuối, nhấn `Esc` hoặc `Enter` để kết thúc toàn bộ chuỗi. Hộp kiểm "Nối liền" trong bảng lệnh điều khiển hành vi này.

### Hình chữ nhật (R)

Nhấp chọn điểm góc thứ nhất, rồi chọn điểm góc đối diện. Bạn cũng có thể gõ trực tiếp `Rộng,Cao` rồi nhấn Enter ngay sau điểm thứ nhất để nhận kích thước chính xác.

### Đường tròn (C)

Nhấp chọn tâm, điểm bán kính. Có thể gõ giá trị số trực tiếp để cố định bán kính.

### Hình Elip

Nhấp chọn tâm → điểm mút trục lớn → điểm mút trục nhỏ. Ba điểm này quyết định mặt phẳng, hướng và hai bán trục của elip.

### Đa giác đều

Nhấp chọn tâm, điểm bán kính. Mục "Số cạnh" trong bảng lệnh mặc định là 6.

> Trong bảng lệnh của Đường tròn, Elip, Đa giác đều và Đa giác có hộp kiểm **"Mặt"**: tích chọn (mặc định) sẽ tạo ra một tấm mặt phẳng, bỏ tích sẽ tạo ra khung dây (wire). Khi cần đùn khối sau đó, tấm mặt phẳng thường thuận tiện hơn.

### Cung tròn (4 loại)

| Lệnh | Các bước thực hiện |
| --- | --- |
| Cung tròn | Tâm → Bán kính → Hướng bắt đầu / Góc quét |
| Cung tròn qua 2 điểm | Điểm đầu → Điểm cuối → Độ cao cung (hướng và độ lồi) |
| Cung tròn qua 3 điểm | Điểm đầu → Điểm trên cung → Điểm cuối |
| Cung tròn tiếp xúc tiếp xúc bán kính (TTR) | Chọn hai cạnh liền kề → Bán kính |

### Khối hộp (B)

Nhấp chọn điểm góc thứ nhất, góc đối diện trên mặt đáy, rồi nhấp chọn điểm chiều cao. Chiều dài, chiều rộng, chiều cao tương ứng với `dx / dy / dz`, có thể chỉnh sửa trong bảng thuộc tính.

### Khối cầu (S)

Nhấp chọn tâm cầu, điểm bán kính.

### Khối trụ (Y)

Nhấp chọn tâm đáy, điểm bán kính, điểm chiều cao. Khối trụ được tạo dọc theo hướng pháp tuyến của mặt phẳng được chọn.

### Khối nón (N)

Nhấp chọn tâm đáy, điểm bán kính, điểm chiều cao của đỉnh nón.

### Khối kim tự tháp

Nhấp chọn điểm góc thứ nhất, góc đối diện của mặt đáy, rồi chọn điểm chiều cao đỉnh chóp.

> **Lưu ý chung cho Đùn khối, Xoay tròn, Quét dẫn:** Tùy chọn "Xóa đối tượng" trong bảng lệnh mặc định được tích chọn. Nếu đối tượng được chọn là một nút biên dạng hoàn chỉnh, sau khi xác nhận toàn bộ nút đó sẽ bị tiêu thụ; trục xoay hoặc đường dẫn quét nếu chọn bằng cả nút cũng sẽ bị tiêu thụ. Bỏ tích chọn này có thể giữ lại các nút nguồn, nhưng kết quả chỉ lưu lại hình học tại thời điểm tạo, việc chỉnh sửa biên dạng nguồn, trục hoặc đường dẫn sau đó sẽ không tự động cập nhật liên kết. **Đây không phải là lịch sử tham số.** Nếu còn muốn chỉnh sửa đầu vào sau này, hãy bỏ tích chọn trước; nếu lỡ tiêu thụ mất nút nguồn, nhấn `Ctrl+Z` ngay để hoàn tác toàn bộ lệnh cùng lúc.

### Đùn khối (P)

Đùn khối trong dựng hình trực tiếp là "kéo dài hình học từ một biên dạng có sẵn":

1. Chọn mặt, cạnh hoặc đường bao dây cần đùn (bao gồm cả biên dạng phác thảo).
2. Kéo mũi tên dọc theo hướng pháp tuyến để đặt khoảng cách, hoặc nhập giá trị số trong bảng lệnh.
3. Nhấn `Enter` để xác nhận.

Khác với đùn khối tham số, ở đây tạo ra một nút kết quả đùn khối độc lập, không đi vào danh sách tính năng của thân tham số. Chiều dài đùn sau đó có thể sửa trong bảng thuộc tính, nhưng điều này không làm thay đổi biên dạng nguồn ban đầu và cũng không thiết lập quan hệ liên kết giữa hai bên.

### Nối mặt cắt (Loft) / Bề mặt Gordon

- **Nối mặt cắt (Loft)**: Lần lượt chọn các mặt cắt theo đúng thứ tự dự kiến (mặt, biên dạng phác thảo hoặc đường bao dây khép kín), nhấn `Enter` để kết thúc chọn. Bảng lệnh có thể thiết lập "Khối đặc", "Mặt kẻ (ruled surface)", "Độ liên tục", "Xóa đối tượng".
- **Bề mặt Gordon**: Cần ít nhất 2 cạnh biên dạng + 2 cạnh dẫn hướng, chọn biên dạng trước rồi chọn dẫn hướng sau. Thích hợp để tạo mặt cong từ một lưới đường cong cắt nhau; trước khi xác nhận hãy kiểm tra xem hai nhóm đường cong có tạo thành lưới giao cắt chuẩn xác không, nếu thất bại hãy chỉnh lại số lượng và mối quan hệ giao cắt rồi thử lại.

### Quét đường dẫn (Sweep)

Trên giao diện nút hiện có tên là `Quét đường dẫn`. Chọn **Mặt cắt** trước (cạnh hoặc đường bao dây, có thể chọn nhiều), xác nhận xong chọn tiếp **Đường dẫn** (một đường bao dây hoặc chuỗi cạnh liên tục được chọn từng đoạn). Mục "Bo góc" trong bảng lệnh điều khiển việc có làm trơn mượt các khúc cua của đường dẫn hay không. Nếu không thấy bản xem trước hoặc xác nhận thất bại, hãy kiểm tra xem mặt cắt có hợp lệ và đường dẫn có liên tục không rồi chọn lại.

### Xoay tròn khối (Revolve)

Chọn mặt cắt trước, sau đó chọn trục xoay. Trục xoay bắt buộc phải là **cạnh thẳng**, và không thể lấy chính mặt cắt làm trục xoay. Mục "Góc" trong bảng lệnh mặc định là 360°, phải là một giá trị số hợp lệ khác 0; khi góc nhỏ hơn 360° sẽ thu được một phần vật thể xoay tròn. Khi có thông báo không thể xoay, hãy kiểm tra lại trục, góc xoay và mặt cắt đã chọn rồi thử lại.

### Các mục thu gọn: Điểm, Đa giác, Bezier, Đường xoắn ốc, Ống dẫn, Chữ văn bản

Các lệnh này nằm trong menu mở rộng của nhóm "Vẽ" (tam giác nhỏ bên phải tên nhóm).

- **Điểm**: Nhấp chuột một lần để đặt một điểm.
- **Đa giác**: Nhấp chọn liên tiếp các điểm, có thể khép kín; thích hợp để vẽ biên dạng đường gấp khúc.
- **Đường cong Bezier**: Nhấp chọn liên tiếp các điểm điều khiển để vẽ đường cong Bezier.
- **Đường xoắn ốc**: Nhấp chọn tâm, bán kính, chiều cao; mục "Bước xoắn" trong bảng lệnh điều khiển độ cao tăng lên sau mỗi vòng xoay.
- **Ống dẫn**: Nhấp chọn liên tiếp các điểm của đường dẫn gấp khúc, nhấn `Enter`/`Esc` để kết thúc; mục "Bán kính" trong bảng lệnh quyết định bán kính của ống.
- **Chữ văn bản**: Bảng lệnh cho phép chọn font chữ, chiều cao chữ, nội dung, phương thức đặt (chọn 2 điểm / dọc theo đường dẫn). Làm theo lời nhắc để chọn vị trí, hướng và độ dày đùn. Font chữ được tải về theo nhu cầu ở lần sử dụng đầu tiên, mỗi font có dung lượng khác nhau; nếu font hiện tại thiếu ký tự nào đó, hệ thống sẽ ghi nhật ký và bỏ qua ký tự đó.

<a id="43-布尔运算组"></a>
## 4.3 Nhóm Phép toán Boolean

Cả ba lệnh đều có thao tác hoàn toàn giống nhau, chỉ khác ở phép tính hình học:

| Lệnh | Kết quả |
| --- | --- |
| Hợp nhất | Đối tượng đích ∪ Công cụ |
| Trừ khối | Đối tượng đích − Công cụ |
| Giao nhau | Đối tượng đích ∩ Công cụ |

Các bước thực hiện:

1. Chọn khối **Đích** (đối tượng được chọn đầu tiên).
2. Chọn khối **Công cụ** (có thể chọn nhiều), nhấn `Enter` để kết thúc.
3. Trong bảng lệnh, tùy chọn "Giữ lại công cụ":
   - Không tích chọn (mặc định): Cả đối tượng đích và công cụ đều bị thay thế bởi nút kết quả.
   - Có tích chọn: Khối công cụ được giữ lại trong khung cảnh, chỉ có đối tượng đích bị thay thế bởi kết quả.

Khi Boolean thất bại, một thông báo lỗi sẽ xuất hiện và các nút ban đầu được giữ nguyên. Nếu một khối đặc nào đó đang được một "thực thể" (instance) tham chiếu đến, nó sẽ không thể bị tiêu thụ; lệnh sẽ từ chối và nhắc bạn xóa thực thể đó trước hoặc thực hiện lệnh `Tách rời` (`modify.detach`) cho thực thể.

## 4.4 Nhóm Chuyển đổi

| Lệnh | Tác dụng |
| --- | --- |
| Chuyển thành đường bao dây | Chuyển các cạnh/đường bao dây được chọn thành một nút đường bao dây |
| Chuyển thành khối phức hợp | Gộp nhiều hình dạng vào một khối phức hợp (không hòa tan, bên trong vẫn tách biệt) |
| Chuyển thành mặt | Dùng các cạnh/đường bao dây khép kín được chọn để tạo thành một mặt phẳng/mặt cong |
| Chuyển thành vỏ | Khâu ghép các mặt được chọn thành một vỏ (shell) |
| Chuyển thành khối đặc | Chuyển một vỏ khép kín thành khối rắn (solid) |

Lưu ý: Các lệnh chuyển đổi sẽ **thay thế** nút được chọn ban đầu (nút gốc bị xóa, nút kết quả tiếp quản). Trước khi chuyển đổi, bạn nên lưu tài liệu hoặc chắc chắn rằng có thể hoàn tác.

## 4.5 Nhóm Công cụ

| Lệnh | Giải thích |
| --- | --- |
| Chiếu đường cong | Chọn một đường cong, sau đó chọn một mặt, chiếu theo "Hướng" (mặc định `0,0,-1`) lên mặt đó để nhận được một đường cong chiếu |
| Tạo nhóm | Gom các đối tượng có thể tạo nhóm lại thành một khối tổng thể (không phải thư mục cây dự án); thực thể và nguồn của nó, nút đang bị kích thước tham chiếu... không thể tạo nhóm theo cách này, lệnh sẽ báo và giữ chúng độc lập |
| Đường cong giao nhau | Chọn hai hình dạng để lấy đường giao tuyến của chúng |
| Song song (Offset) | Chọn cạnh/đường bao dây/mặt, sau đó chọn khoảng cách theo phương pháp tuyến; kiểu nối góc có thể chọn cung tròn/tiếp xúc/giao nhau |
| Sao chép hình | Chọn các cạnh hoặc mặt để sao chép thành các nút độc lập, giữ nguyên vị trí và phép biến đổi ban đầu |
| Sửa chữa hình | Chạy công cụ ShapeFix trên hình dạng được chọn để sửa các lỗi tô pô phổ biến |
| Kiểm tra hình | Kiểm tra tính hợp lệ từng mặt, bật hộp thoại liệt kê kết quả kiểm tra của từng mặt |

Lệnh `Tạo nhóm` sẽ yêu cầu đặt tên cụm chi tiết và điểm chèn, đưa các đối tượng được chọn vào định nghĩa cụm chi tiết và có thể tạo ra nút cụm chi tiết. Cụm chi tiết sử dụng lưới hợp nhất được cố định tại thời điểm tạo, không phải là thư mục thông thường liên tục cập nhật theo hình học nguồn; khi chỉ cần sắp xếp cây dự án, bạn nên dùng thư mục trên thanh công cụ của cây. Thực thể cùng nguồn của nó, nút bị kích thước tham chiếu, công cụ đã bị tính năng tiêu thụ... không thể tạo nhóm theo cách này.

"Sửa chữa hình" và "Kiểm tra hình" nằm trong menu thả xuống của nhóm "Công cụ".

<a id="46-直接建模的编辑方式"></a>
## 4.6 Phương thức chỉnh sửa trong dựng hình trực tiếp

Nút dựng hình trực tiếp không nhất thiết phải giữ lại các tham số lệnh ban đầu. Bảng thuộc tính chỉ có thể chỉnh sửa các trường dữ liệu mà nó thực sự liệt kê, căn cứ theo hiển thị của nút đang chọn:

- **Ví dụ có thể sửa trực tiếp**: Tọa độ vị trí, chiều dài, chiều rộng, chiều cao của khối hộp; tâm, bán kính, chiều cao của khối trụ; tâm, bán kính của đường tròn; chiều rộng, chiều cao của hình chữ nhật; chiều dài của đùn khối.
- **Ví dụ không để lộ đầu vào lệnh gốc**: Kết quả xoay tròn trực tiếp không cung cấp các trường biên dạng, trục xoay và góc; kết quả quét dẫn không cung cấp các trường mặt cắt, đường dẫn và tùy chọn bo góc.
- Kết quả của nối mặt cắt (Loft)/mặt Gordon, hình học nhập từ tệp ngoài, kết quả sửa hình sau khi bo góc/vát mép trực tiếp cũng hoàn toàn không có danh sách tham số lệnh gốc để tiếp tục chỉnh sửa.

Việc sửa đổi các trường có thể chỉnh sửa sẽ lập tức tái tạo lại nút đó và được tính là một bước hoàn tác. Đối với các kết quả không để lộ đầu vào lệnh gốc, bạn chỉ có thể hoàn tác để làm lại, hoặc tái tạo bằng thân tham số; không thể trông đợi việc sửa biên dạng nguồn sẽ tự động cập nhật kết quả. Nếu muốn quay lại một bước nào đó trong chuỗi thao tác, hãy dùng Hoàn tác/Làm lại, chứ không nên trông đợi dựng hình trực tiếp có sẵn lịch sử tham số.

---

Bước tiếp theo: [Chương 5 Chỉnh sửa, đo lường và chú thích](05-modify-convert-measure.md)
