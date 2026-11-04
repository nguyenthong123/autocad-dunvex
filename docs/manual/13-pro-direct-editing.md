# 13. Pro Chỉnh sửa trực tiếp

> Chương này chỉ áp dụng cho **Chili3D Pro**. Phiên bản Community không có phiên làm việc nhấp đúp chỉnh sửa và thẻ ngữ cảnh **Chỉnh sửa**; các lệnh dựng hình trực tiếp và sửa đổi của bản Community xem tại [Chương 4](04-direct-modeling.md) và [Chương 5](05-modify-convert-measure.md).

Tính năng **Chỉnh sửa trực tiếp** của bản Pro dùng để sửa đổi hình học B-rep đã tồn tại: sau khi nhấp đúp vào mô hình, bạn có thể trực tiếp chọn đỉnh, cạnh hoặc mặt, rồi thông qua các thao tác kéo rê, đẩy-kéo, offset, phân tách, bo góc, vát mép, di chuyển và sửa chữa để thay đổi node hiện tại. Nó không yêu cầu mô hình gốc phải có cây tính năng tham số, vì thế rất thích hợp để xử lý mô hình nhập vào (import).

## 13.1 Phân biệt rõ ba phương thức thao tác

| Phương thức | Lối vào chính | Đối tượng sửa đổi | Có giữ lại lịch sử tính năng không |
| --- | --- | --- | --- |
| Dựng hình trực tiếp | Thẻ **Cơ bản** | Tạo hoặc thay thế node hình dạng | Không giữ lịch sử hoàn chỉnh; một số node sửa được tham số công khai |
| Dựng hình tham số | Thẻ **Tham số**, Phác thảo | Thân tham số và chuỗi tính năng của nó | Có giữ lại, có thể sửa tính năng và liên kết tái dựng |
| Pro Chỉnh sửa trực tiếp | Thẻ **Chỉnh sửa** sau khi nhấp đúp vào mô hình | Các hình dạng con (sub-shape) như cạnh, mặt trong node có thể chỉnh sửa | Không thêm lịch sử tính năng tham số mới, quay lui bằng hoàn tác và sao lưu |

Nếu về sau bạn vẫn cần điều khiển mô hình thông qua biến số, kích thước phác thảo và chuỗi tính năng, hãy ưu tiên ở lại luồng làm việc tham số. Chỉnh sửa trực tiếp phù hợp cho việc sửa nhanh hình dạng, mô hình không có lịch sử và các chỉnh sửa cục bộ cần chọn điểm thủ công.

**Lưu trước khi bắt đầu.** Bạn nên nhấn `Ctrl+S` để lưu tài liệu hiện tại, và trước các chỉnh sửa quan trọng hãy dùng `Lưu thành tệp` để để lại bản sao lưu `.cd`. Chỉnh sửa trực tiếp không tự động lưu; việc thoát khỏi chế độ chỉnh sửa cũng không lưu tài liệu.

<a id="132-进入转换与退出"></a>
## 13.2 Vào chế độ, chuyển đổi và thoát

### Nhấp đúp để vào chế độ chỉnh sửa

1. Tìm hình dạng cần sửa đổi trong khung nhìn.
2. Nhấp đúp chuột trái nhanh vào hình dạng đó.
3. Nếu mô hình đã là node có thể chỉnh sửa, hệ thống sẽ vào thẳng chế độ chỉnh sửa; các node hình dạng khác sẽ bật lên thông báo `Chuyển đổi thành node có thể chỉnh sửa`.
4. Sau khi vào, thanh Ribbon tự động mở thẻ **Chỉnh sửa**, xung quanh mô hình xuất hiện khung ranh giới chỉnh sửa bằng nét đứt màu xanh ngọc.

Chế độ chỉnh sửa chỉ tác động lên node hiện tại. Không vào chế độ này bằng cách nhấp đúp vào chữ trong cây dự án; lối vào duy nhất là hình dạng mô hình trong khung nhìn.

### Ảnh hưởng bắt buộc phải xác nhận trước khi chuyển đổi thành node có thể chỉnh sửa

Thân tham số hoặc các node hình dạng chưa thể trực tiếp chỉnh sửa cần phải chuyển đổi trước. Sau khi nhấp `Chuyển đổi thành node có thể chỉnh sửa`:

- Hình học hiện tại, tên, ma trận biến đổi và vật liệu sẽ được giữ nguyên;
- **Danh sách tính năng tham số ban đầu và lịch sử chỉnh sửa của nó sẽ bị mất**, kết quả trở thành một node có thể chỉnh sửa lưu trữ B-rep hiện tại;
- Các thao tác chỉnh sửa trực tiếp sau đó sẽ không tạo lại cây tính năng này, cũng không thể khôi phục lại các tham số tính năng ban đầu trong bảng thuộc tính;
- Nếu chuyển đổi nhầm, hãy nhấn `Ctrl+Z` ngay lập tức. Nếu đã lỡ thao tác tiếp các bước khác, bạn có thể cần phải hoàn tác từng bước, hoặc mở lại bản sao lưu trước khi chuyển đổi.

![Thông báo chuyển đổi thành node có thể chỉnh sửa sau khi nhấp đúp vào node](images/21-pro-convert-dialog.png)

*Node không thể chỉnh sửa trực tiếp sẽ hiển thị thông báo chuyển đổi trước; bạn nên đánh giá ảnh hưởng đến lịch sử tính năng và instance trước khi xác nhận.*

Nếu bạn chỉ muốn sửa đổi độ sâu đùn, đường kính lỗ hoặc các tham số tính năng đã có, hãy nhấp `Hủy`, chuyển sang dùng cách chỉnh sửa tham số ở [Chương 6](06-parametric-modeling.md), đừng chuyển đổi cả thân tham số chỉ vì muốn sửa một kích thước.

### Nhấp đúp vào instance sẽ chỉnh sửa node nguồn

Khi nhấp đúp vào một thực thể (instance), bản Pro sẽ chuyển đến **node nguồn** của nó. Việc chuyển đổi và các sửa đổi hình học tiếp theo trên node nguồn sẽ phản ánh lên tất cả các instance dùng chung nguồn này, chứ không chỉ sửa riêng bản sao hiện tại.

Khi chỉ muốn sửa một instance riêng lẻ, trước tiên hãy thoát chế độ chỉnh sửa, chọn instance đó và thực hiện `Tách độc lập`, rồi mới nhấp đúp vào để chỉnh sửa. Mối quan hệ instance xem tại [Mục 5.1](05-modify-convert-measure.md#51-变换移动旋转镜像阵列).

### Thoát chế độ chỉnh sửa

Có thể thoát bằng bất kỳ cách nào sau đây:

- Nhấp **Chỉnh sửa → Quản lý → Thoát**;
- Nhấn `Esc` khi không chạy lệnh nào; nếu đang chọn điểm hoặc thực thi lệnh, nhấn `Esc` để hủy lệnh hiện tại trước;
- Nhấp chuột ra vùng bên ngoài khung ranh giới chỉnh sửa.

Sau khi thoát, hệ thống sẽ gỡ bỏ trạng thái ẩn hoặc khóa đối với các đối tượng khác trong lần chỉnh sửa này, khôi phục lại chế độ lựa chọn thông thường và đóng thẻ **Chỉnh sửa**. **Thoát không đồng nghĩa với hoàn tác, cũng không đồng nghĩa với đã lưu.** Các sửa đổi đã xác nhận vẫn nằm trong tài liệu, bạn cần nhấn `Ctrl+S` để lưu lại.

## 13.3 Lựa chọn, cách ly và cài đặt chỉnh sửa

### Chọn hình dạng con (Sub-shape)

| Thao tác | Kết quả |
| --- | --- |
| Nhấp vào đỉnh, cạnh hoặc mặt | Chọn hình dạng con bên trong node hiện tại |
| `Shift+Nhấp chuột` | Chọn thêm hoặc bớt hình dạng con |
| `Enter` / `Space` | Xác nhận thao tác chọn hiện tại trong lệnh |
| `Esc` | Hủy lệnh hoặc thao tác chọn hiện tại trước; khi không có lệnh nào chạy thì thoát chỉnh sửa |
| `Delete` / `Backspace` | Xóa các cạnh, mặt hoặc đường hỗ trợ được chọn và tái dựng lại node hiện tại |

Ở chế độ bình thường, nhấp vào hình dạng là chọn toàn bộ node; ở chế độ chỉnh sửa, nhấp chuột là chọn các hình dạng con bên trong node. Các lệnh sẽ tiếp tục lọc đầu vào, ví dụ lệnh bo góc chỉ nhận cạnh, lệnh offset mặt chỉ nhận mặt. Khi chọn nhiều đối tượng để di chuyển, không thể chọn lẫn lộn cả cạnh và mặt, lệnh sẽ chỉ giữ lại loại đối tượng cùng kiểu với đối tượng được chọn đầu tiên.

![Chế độ Pro chỉnh sửa trực tiếp với mặt được chọn, tay cầm màu vàng và ranh giới chỉnh sửa](images/22-pro-edit-mode.png)

*Sau khi vào chế độ chỉnh sửa, thẻ "Chỉnh sửa" sẽ tự động mở; mặt màu xanh lá là vùng chọn hiện tại, tay cầm tròn màu vàng dùng để kéo rê, khung nét đứt màu xanh ngọc đánh dấu ranh giới chỉnh sửa.*

### Chế độ cách ly

Mở **Chỉnh sửa → Quản lý → Cài đặt chỉnh sửa**, trong phần `Chế độ cách ly` chọn:

| Chế độ | Hiệu ứng khi chỉnh sửa |
| --- | --- |
| `Khóa` (Mặc định) | Các đối tượng khác vẫn nhìn thấy, nhưng không thể chọn làm đối tượng chỉnh sửa thông thường; thích hợp để quan sát quan hệ lắp ráp |
| `Ẩn` | Chỉ hiển thị node đang chỉnh sửa; thích hợp để kiểm tra bên trong hoặc tránh bị che khuất |

Dù ở chế độ nào, các lệnh chỉnh sửa cũng chỉ tác động lên node hiện tại. Việc chuyển đổi chế độ có hiệu lực ngay lập tức; sau khi thoát chỉnh sửa sẽ gỡ bỏ cách ly và khôi phục lựa chọn thông thường. Cài đặt này được lưu trong LocalStorage của trình duyệt và sẽ tiếp tục áp dụng cho lần chỉnh sửa tiếp theo.

Khi cần di chuyển toàn bộ node hoặc chỉnh sửa chi tiết khác, hãy thoát chỉnh sửa trực tiếp trước, sau đó dùng chế độ chọn node thông thường hoặc các lệnh trong thẻ **Cơ bản**.

### Công tắc kéo chỉnh sửa bo góc

Tùy chọn `Kéo chỉnh sửa bo góc` trong `Cài đặt chỉnh sửa` mặc định tắt. Sau khi bật, bạn có thể kéo các mặt bo góc đã nhận diện để điều chỉnh bán kính, xem tại [Mục 13.4](#134-拖拽编辑). Công tắc này cũng được lưu trong LocalStorage của trình duyệt.

### Xóa hình dạng con khác với xóa node

Phím `Delete` / `Backspace` trong chế độ chỉnh sửa tác động lên các hình dạng con đang được chọn:

- Xóa mặt sẽ khiến vỏ kín ban đầu xuất hiện lỗ hở, **không tự động dùng mặt mới để bịt lỗ**;
- Xóa cạnh sẽ trải qua quá trình đơn giản hóa và tái dựng, kết quả phụ thuộc vào cấu trúc liên kết xung quanh;
- Khi chọn đường hỗ trợ, chỉ xóa đường hỗ trợ chứ không cắt gọt hình học của thân đặc;
- Để loại bỏ sạch sẽ các tính năng cục bộ như góc bo, vấu lồi, hãy ưu tiên thử dùng `Xóa tính năng`, đừng trực tiếp xóa tất cả các mặt của nó.

Nếu lỡ xóa nhầm, hãy nhấn `Ctrl+Z` ngay lập tức. Lệnh `Sửa chữa` có thể khâu và vá các hình học hiện có, nhưng không thể tự khôi phục một mặt đã bị xóa mất.

<a id="134-拖拽编辑"></a>
## 13.4 Chỉnh sửa kéo rê

Sau khi chọn cạnh hoặc mặt có thể xử lý, gần đó sẽ xuất hiện một tay cầm kéo hình tròn màu vàng. Nhấn giữ tay cầm và di chuyển chuột, khung nhìn sẽ hiển thị hình học xem trước và giá trị; sau khi thả chuột, hệ thống sẽ xác nhận theo tình trạng bắt dính, hoặc bật hộp thoại nhập số để nhập giá trị chính xác. Nếu kết quả không đúng, hãy hoàn tác trước rồi chọn lại.

### Kéo mặt phẳng: Offset hoặc Đẩy-Kéo

1. Nhấp vào một mặt phẳng; khi cần di chuyển cùng lúc, dùng `Shift+Nhấp chuột` để chọn nhiều mặt phẳng có pháp tuyến song song.
2. Kéo tay cầm màu vàng di chuyển ra ngoài hoặc vào trong theo hướng pháp tuyến của mặt.
3. Quan sát bản xem trước. Bản Pro sẽ ưu tiên xử lý theo kiểu **Dời mặt song song (Offset face)** để các mặt lân cận và góc bo có thể giữ lại cùng đi theo; khi vùng chọn hoặc hình học hiện tại không thích hợp để offset, hệ thống sẽ lùi về phương thức **Đẩy-Kéo (Push-Pull)**.
4. Thả chuột rồi nhập giá trị cuối cùng và xác nhận, hoặc dùng kết quả bắt dính mặt dưới đây.

![Hình ảnh xem trước hình học theo thời gian thực khi kéo tay cầm màu vàng của mặt phẳng](images/23-pro-face-drag.png)

*Khi kéo tay cầm của mặt phẳng, khung nhìn hiển thị hình dạng mới và khoảng cách theo thời gian thực; sau khi nhả chuột mới xác nhận giá trị chính xác.*

Khi kéo có thể di chuột đến mặt mục tiêu song song với hướng kéo để bắt dính mặt di chuyển vào vị trí mặt đó. Mục tiêu có thể đến từ các mô hình khác đang hiển thị; nó chỉ dùng làm tham chiếu vị trí chứ không bị sửa đổi.

Khi phát hiện có mặt đối diện, hộp thoại giá trị có thể cung cấp:

- `Tổng chiều dài`: Sau khi di chuyển, tổng khoảng cách giữa mặt đối diện và mặt hiện tại;
- `Khoảng cách`: Độ dời tăng thêm trong lần di chuyển này tính từ vị trí cũ.

Hãy xác nhận xem giá trị hiện đang hiển thị là loại nào trước khi nhập. Khi không có mặt đối diện, giá trị chính là khoảng cách kéo của lần này. Nếu có cảnh báo không thể giữ bán kính bo góc và đã chuyển sang dùng đẩy-kéo, bạn nên kiểm tra lại góc bo và các mặt liền kề, không chỉ nhìn mỗi điểm đích của mặt di chuyển.

![Hộp thoại nhập chính xác tổng chiều dài và khoảng cách sau khi kéo mặt phẳng](images/24-pro-pushpull-input.png)

*Khi có mặt đối diện, có thể chuyển đổi giữa "Tổng chiều dài" và "Khoảng cách"; ý nghĩa của hai giá trị này hoàn toàn khác nhau.*

### Kéo cạnh: Bo góc hoặc Vát mép

1. Chọn một cạnh, hoặc dùng `Shift+Nhấp chuột` để chọn nhiều cạnh có thể xử lý.
2. Kéo tay cầm màu vàng. Hướng kéo quyết định việc tạo bo góc hay vát mép, bản xem trước sẽ hiển thị kết quả tương ứng.
3. Thả chuột, nhập giá trị chính xác vào hộp thoại `Bán kính` hoặc `Chiều dài` rồi xác nhận.

Chỉ các cạnh nối giữa hai mặt không song song mới xuất hiện loại tay cầm này. Cạnh tự do, cạnh có hai mặt liền kề song song nhau hoặc cấu trúc liên kết không thể tính toán sẽ không xuất hiện tay cầm. Thao tác kéo sẽ bị giới hạn xung quanh phạm vi hình học cho phép, tuy nhiên các cạnh phức tạp vẫn có thể tạo hình thất bại; khi thất bại hãy giảm bán kính hoặc chiều dài, giảm bớt số cạnh chọn cùng lúc, hoặc chuyển sang dùng bảng lệnh để thử lại.

### Kéo mặt bo góc hiện có để đổi bán kính

1. Trong **Cài đặt chỉnh sửa**, bật tùy chọn `Kéo chỉnh sửa bo góc`.
2. Chọn mặt bo góc cong phi phẳng đã được nhận diện.
3. Kéo tay cầm để điều chỉnh bán kính, thả chuột rồi xác nhận giá trị.

Chỉ các mặt bo góc có thể nhận diện, gỡ bỏ và tái dựng lại được mới hỗ trợ thao tác này. Mặt trụ thông thường hoặc các mặt cong khác không nhất thiết xuất hiện tay cầm; khi cần đổi bán kính thành lỗ hoặc mặt bên hình trụ, hãy dùng `Dời mặt song song (Offset face)`.

<a id="135-工具推拉偏移面圆角与倒角"></a>
## 13.5 Công cụ: Đẩy-kéo, Dời mặt song song, Bo góc và Vát mép

### Đẩy-Kéo

**Chỉnh sửa → Công cụ → Đẩy-Kéo** hoàn thành việc đẩy-kéo một mặt phẳng qua hai lần chọn điểm:

1. Chọn một mặt phẳng.
2. Lần lượt chọn điểm mục tiêu dọc theo pháp tuyến của mặt đó, quan sát bản xem trước.
3. Khi chọn điểm mục tiêu, nhấn giữ phím `Alt` để chuyển đổi chế độ `Mặt mới`: khi bật sẽ giữ lại các mặt phân chia do đẩy-kéo tạo thành, khi tắt sẽ cố gắng đơn giản hóa các cạnh và mặt đồng phẳng. Chế độ này không có hộp kiểm riêng, sau khi chuyển đổi hãy căn cứ vào các mặt phân chia và đường cạnh trong bản xem trước.
4. Xác nhận kết quả; khi cần kích thước chính xác hãy dùng bắt điểm hoặc nhập giá trị số.

Đẩy-kéo chỉ chấp nhận các mặt có mặt phẳng xác định rõ ràng. Muốn thay đổi bán kính mặt bên hình trụ, hoặc mong muốn các góc bo liền kề giữ tối đa bán kính ban đầu, nên chuyển sang dùng `Dời mặt song song`.

### Dời mặt song song (Offset face)

**Chỉnh sửa → Công cụ → Dời mặt song song** có thể di chuyển mặt phẳng hoặc mặt cong, thích hợp để điều chỉnh độ dày tấm, ngoại hình cũng như bán kính của lỗ và hình trụ:

1. Chọn một hoặc nhiều mặt, nhấn `Enter` / `Space` hoặc nút xác nhận để kết thúc việc chọn.
2. Trên bảng lệnh, nhập `Khoảng cách`. Giá trị dương di chuyển theo hướng pháp tuyến ngoài của mặt, giá trị âm di chuyển ngược lại; không được nhập `0`.
3. Thiết lập tùy chọn `Giữ bán kính bo góc` (mặc định bật) theo nhu cầu. Khi bật, các góc bo cạnh mặt di chuyển sẽ được cố gắng tháo dỡ rồi dựng lại theo bán kính cũ; khi không thể giữ được, lệnh sẽ từ chối xác nhận chứ không âm thầm đổi sang bán kính khác.
4. Kiểm tra bản xem trước kết quả trên hình học gốc bán trong suốt rồi mới xác nhận.

![Bản xem trước lệnh Dời mặt song song trên mặt bên của vấu lồi hình trụ](images/25-pro-offset-face.png)

*Sau khi chọn mặt bên hình trụ và đặt khoảng cách, hình học gốc hiển thị bán trong suốt, có thể kiểm tra trực quan kết quả offset và tùy chọn "Giữ bán kính bo góc".*

Đối với thành lỗ, pháp tuyến ngoài của mặt thân đặc thường hướng vào trong tâm lỗ, vì vậy **khoảng cách dương thường làm lỗ nhỏ lại, khoảng cách âm thường làm lỗ to ra**. Các cấu trúc liên kết khác nhau vẫn nên căn cứ vào bản xem trước và đo đạc cuối cùng.

Xử lý các thông báo thường gặp:

| Thông báo hoặc hiện tượng | Cách xử lý |
| --- | --- |
| Khoảng cách vượt quá phạm vi có thể offset | Giảm khoảng cách, hoặc chia thành nhiều lần sửa với khoảng cách nhỏ |
| Các mặt này không thể offset | Chọn lại mặt khác, dùng `Đơn giản hóa` trước, hoặc chuyển sang `Đẩy-Kéo` |
| Yêu cầu khối solid | Đối tượng hiện tại không phải solid có thể offset; đổi sang lệnh phù hợp cho mặt/vỏ |
| Tồn tại khoang rỗng khép kín bên trong | Quy trình offset hiện tại không hỗ trợ, đổi sang luồng dựng hình khác |
| Không thể giữ bán kính bo góc | Giảm khoảng cách, chỉnh lại mặt chọn, hoặc gỡ bỏ góc bo rồi dựng lại sau |

Khi thất bại đừng gửi lặp lại cùng một nhóm dữ liệu đầu vào. Hãy hoàn tác kết quả sai đã xác nhận trước, rồi kiểm tra xem mô hình có còn khép kín không, việc chọn mặt có đúng không.

### Bo góc / Vát mép

1. Nhấp **Chỉnh sửa → Công cụ → Bo góc**, hoặc mở rộng nút chia này chọn `Vát mép`.
2. Chọn một hoặc nhiều cạnh, kết thúc chọn.
3. Nhập tương ứng `Bán kính` hoặc `Chiều dài`, kiểm tra bản xem trước rồi xác nhận.

Các lệnh này chỉ xử lý node đang chỉnh sửa hiện tại, kết quả trực tiếp thay thế hình học hiện tại mà không tạo ra các tính năng bo góc/vát mép tham số có thể tiếp tục chỉnh sửa. Khi cần giữ lại tham số bán kính và liên kết thượng nguồn, bạn nên hủy chuyển đổi chỉnh sửa và dùng các lệnh tham số.

## 13.6 Phân tách: Vẽ hình trực tiếp trên mô hình hiện có

Các công cụ trong **Chỉnh sửa → Phân tách** không tạo ra các node phác thảo độc lập mới, mà sử dụng hình học vẽ ra để phân tách node hiện tại. Quy trình chung là: Chọn công cụ → Chọn điểm trên mặt hoặc mặt phẳng làm việc → Kiểm tra kết quả phân tách.

| Công cụ | Các bước chọn điểm / Tùy chọn |
| --- | --- |
| Đoạn thẳng | Điểm bắt đầu → Điểm kết thúc; có thể vẽ liên tục, nhấn `Enter` hoặc `Esc` để kết thúc |
| Cung tròn | Tâm → Điểm bắt đầu/bán kính → Điểm quyết định góc quét |
| Cung tròn 2 điểm | Điểm bắt đầu → Điểm kết thúc → Điểm chiều cao cung |
| Cung tròn 3 điểm | Điểm bắt đầu → Một điểm trên cung → Điểm kết thúc |
| Cung tiếp tuyến - tiếp tuyến - bán kính | Hai cạnh tham chiếu → Điểm hoặc giá trị quyết định bán kính |
| Đường tròn | Tâm → Điểm bán kính |
| Elip | Tâm → Điểm mút trục lớn → Điểm mút trục nhỏ |
| Hình chữ nhật | Điểm góc thứ nhất → Điểm góc đối diện; `Hình chữ nhật tâm` đổi thành tâm → điểm góc |
| Đa giác | Tâm → Điểm bán kính; thiết lập số cạnh trên bảng lệnh |
| Dời song song (Offset) | Chọn một mặt → Chọn khoảng cách offset; sử dụng **vòng ngoài** của mặt, có thể đặt kiểu nối |

Khi vẽ hình có thể dùng các kiểu bắt điểm như điểm mút, trung điểm, tâm tròn, giao điểm, trên mặt. Hãy để điểm chọn đầu tiên rơi trên mặt phẳng mục tiêu, hoặc thiết lập mặt phẳng làm việc trước, rồi kiểm tra bản xem trước để tránh vẽ đường phân tách sai hướng.

### Phân tách giữ lại các đường có thể tiếp tục sử dụng

Đoạn thẳng, cung tròn và biên dạng khép kín sẽ cắt với hình dạng hiện tại và phân tách mặt. Công cụ vẽ cũng sẽ giữ lại các đoạn đường nằm ngoài hình dạng gốc làm cạnh tự do; khi các cạnh này cùng với ranh giới đã có tạo thành vòng khép kín đồng phẳng phù hợp, chúng có thể tạo thành mặt mới. Vì vậy bạn có thể giống như vẽ tranh trên mặt phẳng, từng bước phân tách, bù mặt, rồi đẩy-kéo một vùng nào đó.

Nếu chỉ cần tạo vấu lồi cục bộ, hãy vẽ biên dạng khép kín hoàn chỉnh trước, sau đó chọn mặt bên trong biên dạng để đẩy-kéo. Khi phân tách thất bại, node hiện tại giữ nguyên như cũ; đừng giả định bản xem trước đã được xác nhận, hãy căn cứ vào mô hình sau khi lệnh kết thúc.

### Đường hỗ trợ (Auxiliary line)

Ngoại trừ công cụ `Dời song song (Offset)`, các công cụ vẽ phân tách nêu trên đều cung cấp hộp kiểm `Đường hỗ trợ`:

- **Không tích chọn (Mặc định)**: Nội dung vẽ ra tham gia vào phân tách thực tế;
- **Tích chọn**: Nội dung vẽ ra được lưu dưới dạng cạnh hỗ trợ nét đứt, không cắt gọt thân đặc nhưng vẫn có thể bắt điểm và chọn được.

Đường hỗ trợ chỉ hiển thị khi đang chỉnh sửa node đó, sau khi thoát ra sẽ ẩn đi nhưng không bị xóa, và được lưu cùng node và tài liệu. Muốn xóa đường hỗ trợ, hãy vào lại chế độ chỉnh sửa, chọn đường nét đứt rồi nhấn `Delete` / `Backspace`. Đường hỗ trợ rất thích hợp để lưu giữ các đường định vị, tham chiếu căn gióng và hình học dựng hình cần cho các bước phân tách tiếp theo.

![Sự khác biệt giữa cạnh phân tách thực tế và đường hỗ trợ nét đứt](images/26-pro-split-auxiliary.png)

*Đường nét đứt dài phía trước là tham chiếu hỗ trợ, biên dạng nét liền bên phải là phân tách thực tế; khi tích chọn "Đường hỗ trợ", nội dung vẽ ra sẽ không cắt gọt thân đặc.*

## 13.7 Sửa đổi: Di chuyển, Sao chép, Xoay, Đối xứng và Mảng

Nhóm lệnh này trực tiếp xử lý các hình dạng con của node hiện tại, không tương đương với các phép biến đổi trên toàn bộ node trong thẻ **Cơ bản**.

### Di chuyển

Lệnh `Di chuyển` sẽ di chuyển các mặt hoặc cạnh được chọn, và tái dựng lại các mặt lân cận bị ảnh hưởng:

1. Chọn trước nhiều mặt hoặc nhiều cạnh cùng loại, hoặc khởi động lệnh rồi chọn theo lời nhắc.
2. Chọn điểm cơ sở.
3. Chọn điểm đích; vectơ giữa hai điểm quyết định lượng di chuyển và phương hướng.
4. Kiểm tra bản xem trước và cấu trúc liên kết cuối cùng.

Lệnh này không phải là tịnh tiến vật rắn trên toàn bộ node. Khi cần di chuyển tổng thể, hãy thoát chỉnh sửa rồi dùng lệnh `Di chuyển` thông thường hoặc ma trận biến đổi trong bảng thuộc tính.

### Sao chép, Xoay, Đối xứng

Ba lệnh này lấy các **cạnh** được chọn làm đầu vào, ghi các cạnh sau biến đổi trở lại hình dạng hiện tại để dùng cho việc phân tách; cạnh gốc được giữ lại và không tạo ra nhóm node độc lập.

| Lệnh | Các bước thao tác |
| --- | --- |
| Sao chép | Chọn cạnh → Điểm cơ sở → Điểm đích; có thể đặt liên tiếp các bản sao, nhấn `Esc` để kết thúc |
| Xoay | Chọn cạnh → Tâm xoay → Điểm tham chiếu → Điểm góc |
| Đối xứng | Chọn cạnh → Hai điểm trên đường đối xứng |

Chúng thích hợp để sao chép các đường phân tách và biên dạng cục bộ. Khi cần sao chép toàn bộ thân đặc hoặc tạo instance liên kết, bạn nên thoát chỉnh sửa và dùng lệnh tương ứng trong **Cơ bản → Chỉnh sửa**.

### Mảng

1. Chọn một hoặc nhiều cạnh rồi xác nhận.
2. Trên bảng lệnh chọn `Mảng thẳng`, `Mảng xoay vòng`, `Mảng theo đường cong` hoặc `Mảng chữ nhật`.
3. Tùy theo kiểu mảng chọn hướng, trục tâm, đường dẫn hoặc hướng chữ nhật, và thiết lập các tham số như số lượng, khoảng cách/tổng chiều dài.
4. Sau khi xác nhận, các cạnh được chọn sẽ được sao chép đến vị trí mảng trong node hiện tại và tham gia phân tách.

Mảng chữ nhật ở đây chỉ cung cấp hai hướng X/Y, không có số lượng theo hướng Z và không có tùy chọn nhóm. Số lượng được hiểu là đã bao gồm cả vị trí ban đầu; nó biểu thị số lượng mảng của các cạnh phân tách, chứ không phải số node thân đặc tăng thêm.

## 13.8 Đơn giản hóa, Sửa chữa và Xóa tính năng

### Đơn giản hóa

Nhấp **Chỉnh sửa → Công cụ → Đơn giản hóa**, lệnh xử lý ngay node hiện tại mà không cần chọn mặt. Nó sẽ dọn dẹp các mặt nhỏ và gộp các hình học đồng phẳng/cùng đường thẳng có thể đơn giản hóa, thích hợp để giảm bớt các cạnh thừa sau khi nhập mô hình hoặc sau nhiều lần phân tách.

Đơn giản hóa sẽ làm thay đổi cấu trúc liên kết, có thể khiến các đường phân tách vốn dùng để chọn cạnh, chọn mặt bị biến mất. Hãy xác nhận trước những ranh giới nào bắt buộc phải giữ lại; sao lưu trước các sửa đổi lớn, hoàn tác nếu kết quả không như ý.

### Sửa chữa

Nhấp **Chỉnh sửa → Công cụ → Sửa chữa**, hệ thống sẽ lần lượt xử lý dung sai, khâu vỏ, sửa chữa hình dạng và dọn dẹp mặt nhỏ cho node hiện tại. Thích hợp để xử lý mô hình nhập vào có khe hở hoặc sự cố cấu trúc liên kết cục bộ.

Sửa chữa không phải công cụ vá mặt vạn năng: nó không thể khôi phục lại lịch sử tham số ban đầu, cũng không đảm bảo tái dựng lại toàn bộ một mặt đã bị xóa mất. Sau khi sửa chữa bạn vẫn phải kiểm tra các kích thước quan trọng, độ hở và tính kín của khối solid.

### Xóa tính năng

1. Nhấp **Chỉnh sửa → Công cụ → Xóa tính năng**.
2. Chọn các mặt do tính năng cục bộ cần loại bỏ tạo ra, ví dụ mặt bo góc hoặc mặt vấu lồi; có thể chọn nhiều mặt.
3. Sau khi xác nhận, ứng dụng cố gắng gỡ bỏ các mặt này và kéo dài hình học xung quanh để hàn lành lại.

"Tính năng" ở đây là hình dạng cục bộ có thể nhận diện theo hình học, chứ không phải hàng tính năng tham số trong cây dự án. Nếu chọn mặt không đúng hoặc hình học xung quanh không thể kéo dài tiếp giáp, thao tác có thể thất bại hoặc cho ra kết quả bất ngờ; hãy hoàn tác trước rồi điều chỉnh lại vùng chọn.

| Thao tác | Mục đích áp dụng |
| --- | --- |
| `Delete` / `Backspace` | Trực tiếp xóa các cạnh, mặt hoặc đường hỗ trợ được chọn |
| `Xóa tính năng` | Loại bỏ tính năng hình học cục bộ và cố gắng hàn lành các mặt lân cận |
| Lệnh `Xóa` ở chế độ thường | Xóa toàn bộ node trong cây dự án |

<a id="139-一个完整的-pro-修形流程"></a>
## 13.9 Một quy trình sửa hình Pro hoàn chỉnh

Mục tiêu: Trên một khối hình nhập vào, vẽ một vấu lồi hình chữ nhật, điều chỉnh đường kính lỗ đã có, thêm góc bo, sau đó kiểm tra và lưu lại.

1. **Sao lưu**: Sau khi nhập mô hình hãy nhấn `Ctrl+S` trước, các mốc quan trọng dùng thêm `Lưu thành tệp`.
2. **Vào chế độ chỉnh sửa**: Nhấp đúp vào node nhập vào. Nếu bật hộp thoại chuyển đổi, hãy xác nhận node này không còn lịch sử tham số nào cần giữ lại, rồi mới quyết định chuyển đổi.
3. **Cài đặt cách ly**: Trong `Cài đặt chỉnh sửa` giữ `Khóa` để quan sát các chi tiết xung quanh, hoặc chuyển sang `Ẩn` để tránh bị che khuất.
4. **Vẽ vùng vấu lồi**: Chọn **Phân tách → Hình chữ nhật**, vẽ hình chữ nhật khép kín trên mặt đỉnh; khi cần đường tham chiếu hãy tích chọn `Đường hỗ trợ` để vẽ hình học định vị trước, sau đó bỏ tích chọn để vẽ đường phân tách thực tế.
5. **Đẩy-kéo vùng hình**: Chọn mặt mới bên trong hình chữ nhật, kéo tay cầm màu vàng. Khi cần chiều cao chính xác, hãy nhập giá trị sau khi nhả chuột, hoặc bắt dính vào mặt mục tiêu song song.
6. **Điều chỉnh đường kính lỗ**: Nhấp `Dời mặt song song`, chọn thành trụ của lỗ, nhập khoảng cách có dấu âm/dương. Xem trước lỗ to ra hay nhỏ lại trước khi xác nhận và đo đạc.
7. **Xử lý góc cạnh**: Chọn các cạnh cần xử lý rồi kéo rê, hoặc dùng lệnh `Bo góc` / `Vát mép` nhập giá trị chính xác.
8. **Dọn dẹp và kiểm tra**: Thực hiện `Đơn giản hóa` nếu cần; thoát chế độ chỉnh sửa, dùng `Kiểm tra hình dạng` và các lệnh đo lường để đối chiếu lại hình học. Nếu từng xóa mặt, đặc biệt cần kiểm tra xem mô hình có vô tình trở thành vỏ hở hay không.
9. **Lưu và bàn giao**: Nhấn `Ctrl+S` lưu tài liệu chỉnh sửa được, lưu thêm bản sao lưu `.cd`; khi cần chuyển giao cho phần mềm CAD khác hãy xuất tệp STEP, và kiểm tra đối chiếu lại trong phần mềm phía người nhận.

## 13.10 Thứ tự khôi phục khi chỉnh sửa thất bại

1. **Dừng việc tiếp tục thực hiện thêm các thao tác chồng chất**, trước tiên phân biệt rõ đó là thất bại ở bản xem trước hay kết quả sai đã được xác nhận.
2. Với kết quả sai đã xác nhận hãy nhấn `Ctrl+Z` ngay; khi việc chuyển đổi làm mất lịch sử tính năng, hãy hoàn tác từng bước về trước lúc chuyển đổi, hoặc khôi phục bản sao lưu trước khi chuyển đổi.
3. Kiểm tra xem hiện tại có đang chỉnh sửa đúng node hay không, các mặt/cạnh được chọn có thuộc node đó không, kiểu và số lượng có khớp yêu cầu lệnh không.
4. Kiểm tra `Chế độ cách ly`, mặt phẳng làm việc và bắt điểm; khi không nhấp chọn được mục tiêu, hãy đổi góc nhìn khác rồi thử lại.
5. Với các phân tách thừa hãy thử `Đơn giản hóa` trước, với khe hở nhập vào hãy thử `Sửa chữa`, rồi giảm khoảng cách hoặc bán kính để thử lại.
6. Sau khi chỉnh sửa xong hãy thoát chế độ chỉnh sửa, đo đạc các kích thước quan trọng và thực hiện `Kiểm tra hình dạng`. Đừng chỉ dựa vào cảm giác "trông có vẻ đúng" hoặc lệnh không báo lỗi mà vội vàng bàn giao.
7. Xác nhận không còn sai sót rồi mới lưu. Quy tắc lưu, hoàn tác và sao lưu xem tại [Chương 8](08-document-files.md), các câu hỏi khác xem tại [Mục 11.6](11-faq.md#116-pro-直接编辑).

---

Chương trước: [Chương 12 Quy trình làm việc điển hình](12-workflows.md) · Quay lại [Mục lục sổ tay](README.md) · Tra cứu [Phụ lục A Bảng tra cứu lệnh nhanh](appendix-commands.md)
