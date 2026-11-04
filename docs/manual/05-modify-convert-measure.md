# 5. Chỉnh sửa, đo lường và chú thích

Chương này bao gồm các lệnh ở nửa bên phải của thẻ **Cơ bản**: Chỉnh sửa, Đo lường, Chú thích, Khung cảnh (Scene), và Trình chỉnh sửa vật liệu. Đa số các lệnh đều tuân theo cùng một quy trình "Chọn đối tượng → Đặt tham số → Xác nhận".

<a id="51-变换移动旋转镜像阵列"></a>
## 5.1 Biến đổi: Di chuyển, Xoay, Đối xứng, Mảng (Array)

Khi di chuyển, xoay, đối xứng mà tích chọn `Sao chép đối tượng`, cũng như khi thực hiện tạo mảng, đối với body tham số, hình dạng tham số tạo bởi dựng hình trực tiếp (như hình hộp, kết quả xoay/quét) và hình dạng chỉnh sửa được thông thường, hệ thống sẽ tạo ra **thực thể liên kết (associated instance)**, chứ không phải bản sao hình học hoàn toàn độc lập. Các instance có thể đặt ở các vị trí khác nhau, nhưng vẫn tham chiếu hình học của node nguồn; khi sửa đổi kích thước, hình dạng hoặc tính năng của nguồn, các instance sẽ tự động thay đổi theo.

Khi chỉ cần chỉnh sửa một bản sao cụ thể, trước tiên hãy chọn instance đó, trong vùng "Node nguồn" trên bảng thuộc tính nhấp vào `Tách độc lập`, hoặc dùng **Tham số → Thao tác node → Tách độc lập**. Nếu lỡ sửa nguồn khiến nhiều instance cùng đổi theo, hãy hoàn tác (`Ctrl+Z`) ngay thao tác sửa nguồn đó, rồi thực hiện `Tách độc lập` trên instance cần chỉnh sửa riêng.

### Di chuyển (M)

1. Chọn trước các node cần di chuyển (không chọn trước cũng được, lệnh sẽ nhắc bạn chọn).
2. Nhấp `Di chuyển`, chọn **điểm cơ sở**, sau đó chọn **điểm đích**.
3. Độ dời giữa hai điểm chính là lượng di chuyển. Khi chọn điểm, thanh trạng thái sẽ hiển thị khoảng cách.
4. Tích chọn `Sao chép đối tượng` trên bảng lệnh để giữ lại đối tượng gốc và tạo ra một bản sao.

### Xoay (Shift+R)

1. Chọn đối tượng, nhấp `Xoay`.
2. Chọn tâm xoay → chọn điểm tham chiếu xác định mặt phẳng xoay → chọn điểm góc.
3. Bảng lệnh cũng có tùy chọn `Sao chép đối tượng`.

### Đối xứng (Mirror)

1. Chọn đối tượng, nhấp `Đối xứng`.
2. Chọn **hai điểm của đường đối xứng** trong khung nhìn: điểm thứ nhất nằm trên đường đối xứng, điểm thứ hai xác định hướng của đường đối xứng (mặt phẳng đối xứng vuông góc với mặt phẳng làm việc hiện tại).
3. Tùy chọn `Sao chép đối tượng` trên bảng lệnh quyết định việc giữ lại đối tượng gốc hay đối xứng tại chỗ thay thế gốc. Khi không tích chọn, đối tượng gốc sẽ bị kết quả đối xứng thay thế.

### Mảng (Shift+A)

Lệnh `Mảng` hỗ trợ bốn kiểu (chọn trong "Kiểu mảng" trên bảng lệnh):

| Kiểu | Tham số |
| --- | --- |
| Mảng thẳng | Đường dẫn hướng, số lượng, tổng chiều dài (khoảng cách xác định theo thao tác kéo/tổng dài) |
| Mảng xoay vòng | Trục tâm, tổng góc, số lượng, phân bố đều |
| Mảng theo đường cong | Đường cong dẫn hướng, số lượng |
| Mảng chữ nhật | Số lượng theo các hướng X/Y/Z (khoảng cách xác định theo thao tác kéo) |

- **Số lượng**: Thông thường đã bao gồm đối tượng nguồn. Đối với instance liên kết, số lượng chính là đối tượng nguồn cộng với "Số lượng − 1" instance; mảng chữ nhật tính theo số vị trí X × Y × Z. Không nên hiểu nhầm số lượng là số bản sao "thêm mới".
- `Nhóm`: Khi kết quả không chứa instance liên kết, có thể nhóm lại; khi kết quả có chứa instance, dù có tích chọn hệ thống cũng sẽ nhắc nhở không thể nhóm theo cách này, và giữ lại dưới dạng các node độc lập. Sau khi xác nhận, hãy căn cứ vào kết quả thực tế trong cây dự án.
- Hướng mảng thường được xác định bằng cách chọn một cạnh hoặc một trục.
- Các node độc lập thông thường sẽ bị kết quả mảng thay thế; còn node nguồn của instance liên kết nêu trên sẽ được giữ lại, làm nguồn định nghĩa cho instance.

Trước khi xác nhận, hãy kiểm tra số lượng, khoảng cách và hướng trong bản xem trước; nếu kết quả không đúng, nhấn `Ctrl+Z` để hoàn tác toàn bộ lệnh mảng rồi thiết lập lại, tránh phải dọn dẹp từng bản sao lỗi.

## 5.2 Bo góc, vát mép và tạo vỏ (Shell)

### Bo góc (Shift+F)

1. Nhấp `Bo góc`, chọn một hoặc nhiều **cạnh**.
2. Trên bảng lệnh, nhập `Bán kính`.
3. Nhấn Enter để xác nhận. Bản xem trước sẽ cập nhật theo thời gian thực theo bán kính.

Bo góc trong dựng hình trực tiếp sẽ thay thế hình dạng gốc bằng kết quả chỉnh sửa mới.

### Vát mép (Shift+C)

Chọn cạnh, thiết lập `Khoảng cách`, rồi xác nhận. Vát mép cũng thay thế hình dạng gốc tương tự như bo góc.

Kết quả bo góc/vát mép không để lộ lại bán kính, khoảng cách và danh sách cạnh ban đầu trên bảng thuộc tính. Nếu bản xem trước biến mất hoặc xác nhận thất bại, trước tiên hãy kiểm tra giá trị có lớn hơn 0 không, sau đó thử giảm bán kính/khoảng cách, hoặc giảm bớt số cạnh chọn cùng lúc; khi đã xác nhận nhưng kết quả không như ý, dùng `Ctrl+Z` để khôi phục hình dạng gốc rồi thử lại. Nếu cần liên tục chỉnh sửa các kích thước này, nên chuyển sang dùng body tham số.

### Tạo vỏ rỗng (Shell)

1. Chọn khối solid.
2. Chọn các mặt cần **mở nắp** (có thể chọn nhiều mặt, nhấn `Enter` để hoàn tất chọn).
3. Thiết lập `Độ dày`; `Hướng ra ngoài` quyết định hướng làm dày, `Kiểu nối` quyết định cách các mặt liền kề tiếp giáp nhau.
4. Xác nhận.

## 5.3 Cắt tỉa, kéo dài, ngắt và phân tách

### Cắt tỉa (T)

`Cắt tỉa` là một lệnh liên tục:

1. Nhấp `Cắt tỉa`.
2. Nhấp trực tiếp vào **đoạn cạnh muốn xóa**. Lệnh sẽ tính toán giao điểm của nó với các cạnh khác, xóa đoạn đó đi và giữ lại các đoạn còn lại.
3. Có thể tiếp tục nhấp vào các đoạn khác; nhấn `Esc` để kết thúc lệnh.

### Kéo dài (Extend)

1. Nhấp `Kéo dài`, chọn cạnh cần kéo dài.
2. Chọn cạnh ranh giới cần kéo dài tới.
3. Tùy chọn `Đồng thời sửa ranh giới` trên bảng lệnh quyết định có rút ngắn/kéo dài ranh giới cùng lúc hay không.

### Ngắt (Break)

Chọn một cạnh, sau đó chọn một điểm trên cạnh đó, cạnh sẽ bị ngắt thành hai đoạn tại điểm đã chọn.

### Phân tách (Split)

1. Chọn hình dạng cần phân tách.
2. Chọn công cụ cắt: cạnh, khung dây hoặc mặt (có thể chọn nhiều).
3. Sau khi xác nhận, hình dạng gốc được cắt thành nhiều node riêng biệt.

### Khâu / Đơn giản hóa

- **Khâu**: Khâu nhiều mặt/vỏ lại thành một thể thống nhất theo `Dung sai`.
- **Đơn giản hóa**: Loại bỏ các cạnh và mặt đồng phẳng/cùng đường thẳng; trên bảng lệnh có thể tích chọn riêng `Loại bỏ cạnh`, `Loại bỏ mặt`.

### Phân rã (Explode)

Chọn khối compound, node chứa nhiều hình dạng hoặc cụm chi tiết, lệnh `Phân rã` sẽ tách các hình con trực tiếp của nó thành các node độc lập.

## 5.4 Ba ý nghĩa khác nhau của việc xóa

Ba lệnh này rất dễ bị nhầm lẫn:

| Lệnh | Tác dụng |
| --- | --- |
| `Xóa` (Delete / Backspace) | Xóa toàn bộ node được chọn |
| `Xóa phần tử con` | Chọn cạnh hoặc mặt trên hình dạng, chỉ xóa các phần tử con này và tái dựng lại node |
| `Xóa tính năng` | Chọn các mặt do một tính năng tạo ra (ví dụ các mặt bo của góc bo), loại bỏ tính năng đó và hàn lành hình học xung quanh |

Hai lệnh sau sẽ **thay thế** node (kết quả là một hình dạng mới sau khi hàn lành), muốn quay lại phải dựa vào thao tác hoàn tác (`Ctrl+Z`).

## 5.5 Cọ vẽ và vật liệu

### Thùng sơn

Chọn một số node, nhấp `Thùng sơn`, chọn vật liệu trên bảng lệnh, sau khi xác nhận toàn bộ node sẽ đổi sang vật liệu đó. Nếu trên node từng có vật liệu gán riêng theo từng mặt, chúng sẽ bị xóa bỏ hoàn toàn.

### Thêm cọ vẽ / Xóa cọ vẽ / Xóa sạch cọ vẽ

- `Thêm cọ vẽ`: Chọn mặt (có thể chọn nhiều mặt), chọn vật liệu trên bảng lệnh, chỉ gán vật liệu riêng cho các mặt này.
- `Xóa cọ vẽ`: Chọn mặt, loại bỏ vật liệu riêng của các mặt này, khôi phục về vật liệu chung của node.
- `Xóa sạch cọ vẽ`: Chọn node, xóa bỏ toàn bộ vật liệu gán theo từng mặt của nó.

Các lệnh này nằm trong menu thả xuống của nhóm "Chỉnh sửa".

<a id="56-材质与外观"></a>
## 5.6 Vật liệu và ngoại quan

Sau khi chọn đối tượng, dòng "Vật liệu" trên bảng thuộc tính sẽ hiển thị vật liệu hiện tại. Nhấp vào ô màu vật liệu để mở trình chỉnh sửa vật liệu:

![Trình chỉnh sửa vật liệu của mặt bích màu xanh](images/10-material-editor.png)

*Các tham số vật liệu tương ứng trực tiếp với ngoại quan trong khung nhìn; trong hình là vật liệu kim loại màu xanh tùy chỉnh.*

Trình chỉnh sửa bao gồm:

- **Danh sách vật liệu**: Các ô màu ở phía trên, nhấp để chuyển đổi; `+` tạo mới (vật liệu trống hoặc preset), sao chép, xóa.
- **Tên, Màu sắc, Độ mờ (Opacity)**.
- **Cường độ phản xạ, Độ nhám (Roughness), Độ kim loại (Metalness)**: Các tham số PBR.
- **Cường độ pháp tuyến (Normal strength), Cường độ gồ ghề (Bump strength)**.
- **Tự phát quang (Emissive), Cường độ phát quang**.
- **Texture (Bản đồ vân bề mặt)**: Base color texture, Normal map, Roughness map, Metalness map, Bump map, Emissive map; mỗi map đều có thể thiết lập xoay, độ lệch (offset), lặp lại (repeat) và kiểu bao bọc (wrap), hình ảnh có thể tải trực tiếp từ tệp tin.

Nhấp `Xác nhận` để áp dụng, `Hủy` để bỏ qua. Chỉnh sửa vật liệu được tính là một bước hoàn tác.

## 5.7 Đo lường

### Chiều dài (D)

Chọn hai điểm, khung nhìn sẽ hiển thị khoảng cách giữa hai điểm. Khi chọn điểm, có thể sử dụng tất cả các kiểu bắt điểm.

### Góc

Chọn **đỉnh** → điểm trên cạnh thứ nhất → điểm trên cạnh thứ hai. Khung nhìn sẽ hiển thị góc (độ).

### Chọn (Tổng hợp)

1. Nhấp `Đo lường → Chọn`.
2. Trong phần `Kiểu` trên bảng lệnh, chọn Chiều dài / Diện tích / Thể tích.
3. Lần lượt chọn các hình dạng cần thống kê. Ở góc trên bên trái khung nhìn sẽ xuất hiện bảng nổi, liệt kê giá trị của từng mục và giá trị tích lũy.
4. Nhấn `Esc` để thoát, bảng nổi sẽ biến mất; nếu cần lưu lại kết quả, hãy chụp ảnh màn hình trước.

![Kết quả đo thể tích của mặt bích màu xanh](images/17-measure-volume.png)

*Đo lường kiểu "Chọn" đồng thời liệt kê thể tích từng mục và thể tích tích lũy, đơn vị trong hình là milimét khối.*

## 5.8 Chú thích

Chú thích là **ký hiệu đo kích thước trong khung nhìn**, không làm thay đổi hình học và được lưu cùng tài liệu.

| Lệnh | Các bước |
| --- | --- |
| Kích thước | Chọn hai điểm → chọn vị trí đường kích thước; khi kéo chuột, mặt phẳng kích thước được suy ra theo hướng trục tọa độ |
| Bán kính | Chọn cạnh tròn/cung tròn → chọn vị trí đường dẫn |
| Đường kính | Tương tự như trên, hiển thị đường kính |
| Góc | Chọn hai cạnh thẳng → chọn vị trí chú thích |
| Chữ | Chọn điểm đường dẫn trỏ tới → chọn vị trí chữ, sau đó nhập văn bản |

- Bảng lệnh chú thích có thể thiết lập `Chiều cao chữ`.
- Khi hình học mà chú thích tham chiếu không tìm thấy sau khi tái dựng, chú thích sẽ được giữ ở vị trí cuối cùng và đưa ra cảnh báo.
- Node được chú thích tham chiếu không thể nhóm trực tiếp; lệnh sẽ từ chối và giữ lại dưới dạng các node độc lập để tránh chú thích bị mất liên kết tham chiếu.

## 5.9 Khung cảnh (Scene - Dấu trang góc nhìn)

**Cơ bản → Khung cảnh → Tạo từ camera** sẽ lưu góc nhìn hiện tại thành một dấu trang (bookmark):

1. Điều chỉnh góc nhìn camera ưng ý.
2. Nhấp `Tạo từ camera`.
3. Ở giữa phía dưới khung nhìn sẽ xuất hiện dấu trang; nhấp vào đó camera sẽ bay về góc nhìn này.
4. Nhấp vào biểu tượng bánh răng bên phải dấu trang để đổi tên, biểu tượng `×` để xóa.

## 5.10 Đổi tham số trong dựng hình trực tiếp vs Thực hiện lại lệnh

- Thay đổi kích thước trên từng node đơn lẻ: Chỉ có thể sửa trực tiếp khi bảng thuộc tính thực sự liệt kê các trường tương ứng, ví dụ kích thước hình hộp hoặc chiều dài đùn.
- Đối với kết quả Boolean, bo góc/vát mép và các thao tác như xoay trực tiếp, quét, loft/Gordon không hiển thị lại tham số đầu vào ban đầu: Chỉ có thể hoàn tác (`Ctrl+Z`) rồi làm lại, hoặc dùng body tham số để dựng lại.
- Chỉnh sửa cục bộ trên mô hình nhập vào (import): Sử dụng các lệnh như `Xóa phần tử con`, `Xóa tính năng`, `Sửa chữa hình dạng`, `Đơn giản hóa`; chúng sẽ không khôi phục lại lịch sử dựng hình ban đầu của mô hình.
- Trước khi sửa đổi, nếu không chắc chắn node có giữ lại các trường tham số cần thiết hay không, hãy chọn node đó trước để kiểm tra bảng thuộc tính; nếu lỡ sửa nhầm, hãy dùng `Ctrl+Z` để khôi phục trước khi tiếp tục bước tiếp theo.

---

Bước tiếp theo: [Chương 6 Dựng hình tham số](06-parametric-modeling.md)
