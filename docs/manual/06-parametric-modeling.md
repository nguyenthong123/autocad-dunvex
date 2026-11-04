# 6. Dựng hình tham số

Thân tham số (Parametric Body) là mô hình "cây thiết kế" của Chili3D: bản thân thân không lưu giữ hình học cuối cùng, mà chỉ lưu giữ một **danh sách tính năng có thứ tự**. Mỗi khi sửa đổi hoặc tái dựng (rebuild), danh sách sẽ được thực thi lại từ trên xuống dưới, do đó việc thay đổi tính năng ở thượng nguồn sẽ tự động kéo theo các tính năng ở hạ nguồn thay đổi.

![Chi tiết cơ khí màu xanh lá tạo bởi chuỗi tính năng tham số (giao diện tiếng Anh)](images/19-parametric-result.png)

*Ví dụ chi tiết tham số phức tạp: sau khi sửa kích thước phác thảo ở thượng nguồn, chuỗi tính năng sẽ được tính toán lại (giao diện tiếng Anh).*

<a id="61-参数化体和特征链"></a>
## 6.1 Thân tham số và chuỗi tính năng

- Một thân tham số hiển thị trong cây dự án dưới dạng `Thân tham số 1`, bên dưới nó ẩn chứa các đầu vào bị tiêu thụ như phác thảo (sketch), thân công cụ (tool body).
- Sau khi chọn thân, trên bảng thuộc tính sẽ xuất hiện vùng gập **Tính năng**, mỗi hàng là một tính năng (đùn, tạo lỗ, bo góc...).
- Điều chỉnh thứ tự: Kéo thả tiêu đề của hàng tính năng để sắp xếp lại thứ tự.
- Biểu tượng bên trái hàng tính năng biểu thị loại tính năng, biểu tượng `⋯` bên phải dùng để mở menu thao tác.

### Menu hàng tính năng

| Mục menu | Tác dụng |
| --- | --- |
| Đổi tên | Sửa tên hiển thị của tính năng |
| Chọn lại | Khi tham chiếu mà tính năng hỗ trợ bị mất hiệu lực, chọn lại đối tượng; đối tượng có thể chọn lại tùy thuộc vào tính năng |
| Ẩn (Nén) / Bỏ ẩn | Tạm thời bỏ qua tính năng này, vẫn giữ nguyên vị trí của nó trong danh sách |
| Ẩn theo biến số… | Chỉ định một biến số tài liệu: khi biến số phân giải thành 0 thì ẩn tính năng, có thể tích chọn "Ẩn khi biến số khác 0" để đảo ngược |
| Xóa | Loại bỏ tính năng này khỏi chuỗi tính năng và tái dựng lại |

### Mở rộng và tham số

Nhấp vào hàng tính năng (không phải nhấp vào `⋯`) để mở rộng, bên trong hàng sẽ hiển thị:

- Các ô nhập tham số riêng của tính năng đó;
- Các đầu vào bị thiếu (`Đầu vào bị thiếu #n`) và danh sách tham chiếu;
- Dòng chữ lỗi/cảnh báo;
- Hàng quan hệ "Phụ thuộc vào / Được dùng cho", nhấp vào tên có thể chuyển nhanh đến tính năng tương ứng.

Chỉnh sửa tham số được xác nhận khi rời tiêu điểm (blur) hoặc nhấn Enter; mỗi lần chỉnh sửa là một bước hoàn tác.

### Thanh cuộn ngược (Rollback bar)

Giữa các hàng trong danh sách tính năng có các đường kẻ ngang mảnh (rãnh cuộn ngược). Khi nhấp vào một rãnh nào đó, mô hình sẽ chỉ được tái dựng đến vị trí đó, các tính năng phía sau sẽ chuyển sang màu xám (nhưng vẫn được giữ lại). Nhấp lại hoặc kéo thanh cuộn ngược để khôi phục. Rất thích hợp để xem "mô hình trông như thế nào khi làm đến bước đó".

### Xử lý lỗi tái dựng

Khi một tính năng bị lỗi, khung nhìn sẽ giữ lại kết quả của **lần tái dựng thành công toàn bộ chuỗi tính năng gần nhất**, chứ không phải là tiền tố tính năng đã tính được trước khi lỗi xảy ra lần này. Tham số hoặc biểu thức lỗi cũng sẽ được ghi vào tính năng, vì vậy "hình ảnh không thay đổi" không có nghĩa là chỉnh sửa chưa được lưu, cũng không có nghĩa là tham số hợp lệ. Bạn nên xử lý khôi phục theo thứ tự sau:

1. Nếu lỗi xuất phát từ chỉnh sửa vừa nhập, trước tiên hãy thực hiện **Hoàn tác** (phím tắt mặc định `Ctrl+Z`) để thu hồi chỉnh sửa lỗi đó, rồi tiến hành chỉnh sửa từng bước nhỏ; việc tái dựng thất bại sẽ không tự động cuộn lại tham số đã ghi.
2. Sửa từ **lỗi đầu tiên** ở trên cùng của chuỗi tính năng. Sau khi sửa xong và tái dựng, mới kiểm tra các lỗi tiếp theo, không nên điều chỉnh vòng quanh các lỗi hạ nguồn do nó gây ra.
3. Đối với `Đầu vào bị thiếu`, sử dụng chức năng **Chọn lại**; khi cần xác nhận hình dạng tiền đề mà một tính năng dựa vào, hãy dùng thanh cuộn ngược để định vị, kiểm tra xong thì khôi phục lại toàn bộ chuỗi.
4. Sau khi xác nhận tính năng thực sự không còn cần thiết nữa, mới cân nhắc việc ẩn hoặc xóa. Các thao tác này cũng làm thay đổi hình học và có thể khiến các tham chiếu hạ nguồn bị mất hiệu lực thêm.

Khi mặt, cạnh, đỉnh hoặc phác thảo được tham chiếu không tìm thấy sau khi tái dựng, hàng tính năng sẽ đưa ra cảnh báo. Một số tính năng sẽ tạm thời dùng vị trí tham chiếu đã lưu cuối cùng hoặc giá trị dự phòng khác để tiếp tục dựng hình, do đó hình dạng cũ có thể vẫn còn; bạn nên chọn lại kịp thời, không thể dựa vào việc này để kết luận rằng tham chiếu và tham số đều ổn.

### Vì sao tham chiếu duy trì ổn định

Mặt, cạnh, đỉnh và biên dạng phác thảo được tính năng hạ nguồn tham chiếu được lưu theo **mã định danh theo dõi (tracking identity)**, chứ không theo chỉ số thứ tự (index). Khi thay đổi ở thượng nguồn dẫn đến biến đổi cấu trúc liên kết (topology), các tham chiếu sẽ cố gắng khớp lại; chỉ khi không thể khớp được thì mới cần "Chọn lại".

## 6.2 Tạo thân tham số

### Bắt đầu từ phác thảo

1. **Tham số → Tạo phác thảo mới**, chọn mặt phẳng chuẩn (các khối vuông Đỏ/Xanh lá/Xanh dương) hoặc một mặt phẳng trên thân.
2. Vẽ biên dạng khép kín trong phác thảo.
3. Thoát phác thảo, chọn phác thảo, nhấp **Đùn (Extrude) / Xoay (Revolve) / Vuốt nối (Loft) / Quét (Sweep)**.
4. Thiết lập tham số, xác nhận. Tính năng đầu tiên sẽ tạo ra thân tham số.

Khi trong một phác thảo có nhiều biên dạng khép kín, lệnh đùn sẽ đùn tất cả chúng cùng lúc; vòng khép kín bên trong sẽ trở thành lỗ rỗng.

### Bắt đầu từ hình học nguyên mẫu

**Tham số → Tạo hình hộp/hình trụ/hình cầu/hình nón** sẽ trực tiếp tạo ra một thân tham số, tính năng đầu tiên chính là hình học nguyên mẫu đó. Tùy chọn `Thao tác` trên bảng lệnh có thể là Tạo mới, Gộp thêm, Loại bỏ, Giao nhau; `Thân mục tiêu` dùng để chọn thân đã có.

### Mặt phẳng chuẩn (Datum Plane)

**Tham số → Mặt phẳng chuẩn** tạo các node mặt phẳng chuẩn có thể tái sử dụng, bao gồm các kiểu:

| Kiểu | Cách định nghĩa |
| --- | --- |
| Mặt song song cách đều (Offset) | Cách một mặt phẳng đã có một khoảng cách |
| Mặt song song qua điểm | Đi qua một điểm và song song với một mặt phẳng |
| Mặt nghiêng theo đường | Xoay quanh một đường thẳng một góc |
| Mặt pháp tuyến qua điểm | Đi qua một điểm với hướng pháp tuyến cho trước |
| Ba điểm | Đi qua ba điểm |
| Mặt chính giữa | Mặt nằm chính giữa hai mặt phẳng song song |
| Mặt qua điểm trên đường cong | Đi qua một điểm trên đường cong và vuông góc với đường cong |

Mặt phẳng chuẩn có thể dùng làm mặt phẳng phác thảo, mặt phẳng đối xứng, mặt trung hòa cho lệnh rút góc nghiêng (draft)...

## 6.3 Nhóm tính năng tạo hình

### Đùn (Extrude)

- Biên dạng: Mặt biên dạng phác thảo, hoặc mặt phẳng trên thân.
- `Thao tác`: Tạo mới / Gộp thêm / Loại bỏ / Giao nhau.
- `Độ sâu`: Khoảng cách theo hướng chính khi dùng độ sâu cho trước, có thể nhập trực tiếp biểu thức.
- `Độ sâu 2`: Hiển thị khi mở rộng hàng tính năng sau khi tạo; khi không tích chọn `Đối xứng`, đùn thêm khoảng cách độc lập này về phía ngược lại của hướng chính. Phải là giá trị dương và xung đột với `Đối xứng`.
- `Đối xứng`: Phía chính đùn theo `Độ sâu` (hoặc điều kiện kết thúc), phía còn lại cũng đi một **khoảng cách đầy đủ** như vậy, chứ không phải chia đôi độ sâu. Ví dụ khi độ sâu cho trước là 10, hai bên biên dạng mỗi bên đùn 10, tổng chiều dày là 20.
- `Đảo chiều`: Lật ngược hướng đùn chính.
- `Khoảng lệch bắt đầu`: Bắt đầu đùn sau khi lệch một đoạn so với mặt phẳng biên dạng.
- `Khoảng lệch kết thúc` (dùng được khi chọn Đến mặt/Đến điểm): Giá trị dương sẽ vượt quá mục tiêu theo hướng đùn thực tế, giá trị âm sẽ dừng lại trước khi chạm tới mục tiêu.
- `Góc nghiêng (Draft)`: Góc côn của thành bên.

Hành vi của `Điều kiện kết thúc`:

| Tùy chọn | Cách kết thúc |
| --- | --- |
| Độ sâu cho trước | Dùng `Độ sâu` để xác định chiều dài theo hướng chính |
| Xuyên thủng hoàn toàn | Tự động xuyên qua toàn bộ hình dạng của **thân tham số hiện tại đứng trước tính năng này**; cần có tính năng phía trước, không phải xuyên qua tất cả các thân trong tài liệu, cũng không tính đến hình dạng của các tính năng phía sau tính năng này |
| Đến mặt | Lấy mặt được chọn làm giới hạn, dừng ở phía gần mà hướng đùn chạm tới trước; khi tham số cho phép, mặt đầu mút sẽ áp sát mặt cong mục tiêu |
| Đến điểm | Dùng đỉnh được chọn để xác định điểm kết thúc, sao cho vị trí kết thúc đi qua điểm đó |

Khả năng áp sát mặt cong của `Đến mặt` chủ yếu dùng cho **một biên dạng phác thảo đơn lẻ**, và không có khoảng lệch bắt đầu/kết thúc, không đối xứng, không có độ sâu 2 hoặc góc nghiêng; thao tác có thể là Tạo mới, Gộp thêm hoặc Loại bỏ. Khi có nhiều biên dạng, thao tác giao nhau, tham chiếu mục tiêu chỉ dùng được hình học cố định (frozen geometry), hoặc khi kernel không thể hoàn thành việc áp sát mặt cong, lệnh sẽ lùi về tạo nắp phẳng theo khoảng cách gần nhất. Khi thấy nắp phẳng, bạn nên kiểm tra các điều kiện này và cảnh báo trên hàng tính năng.

Sau khi chọn "Đến mặt/Đến điểm", một cú nhấp chuột chỉ là chọn mục tiêu, bạn cần nhấn `Enter` hoặc nút xác nhận để hoàn tất việc chọn mục tiêu. Khi mục tiêu nằm phía sau hướng hiện tại, lệnh sẽ tự động đảo chiều về phía mục tiêu; nếu mục tiêu nằm trên mặt bắt đầu, cắt ngang qua mặt bắt đầu, hoặc khoảng lệch khiến điểm kết thúc lùi về trước điểm bắt đầu thì lệnh sẽ báo lỗi.

### Xoay (Revolve)

Chọn biên dạng và trục xoay, thiết lập `Góc` (mặc định 360°), `Đối xứng`, `Góc 2` (xoay hai chiều), `Thao tác`.

### Vuốt nối (Loft)

Lần lượt chọn nhiều tiết diện, thiết lập `Thân đặc`, `Mặt kẻ (Ruled surface)`, `Độ liên tục`, `Thao tác`. Thứ tự tiết diện quyết định hướng vuốt nối.

### Quét (Sweep)

Sau khi chọn tiết diện, lần lượt chọn từng đoạn cạnh của đường dẫn, cuối cùng xác nhận. Đường dẫn có thể gồm nhiều đoạn cạnh, nhưng các cạnh này phải thuộc **cùng một node**, và có thể nối đầu-đuôi thành một đường khung dây.

- `Thao tác`: Tạo mới / Gộp thêm / Loại bỏ / Giao nhau.
- `Bo góc`: Điều khiển chuyển tiếp ở **góc gập của đường dẫn** có bo tròn mượt mà hay không, không phải là bo góc cho biên dạng tiết diện.
- `Điều khiển biên dạng`: Có thể chỉnh sửa trong hàng tính năng sau khi tạo, bao gồm `Hệ tọa độ Frenet` (mặc định), `Hệ tọa độ Frenet hiệu chỉnh` và `Hướng cố định`.

`Hướng cố định` sẽ tự động chiếu trục thế giới `+Z` lên mặt phẳng biên dạng để làm hướng tham chiếu giữ cố định; khi mặt phẳng biên dạng nằm ngang sẽ chuyển sang dùng trục thế giới `+Y`. Không cần phải chọn thêm hướng thủ công.

### Làm dày (Thicken)

Làm dày mặt hoặc vỏ thành khối solid: `Độ dày`, `Độ dày 2`, `Đối xứng`, `Đảo chiều`, `Thao tác`.

### Đường xoắn ốc (Helix)

Thiết lập `Bán kính`, `Chiều dài`, `Bước xoắn`. Đường xoắn ốc có thể dùng làm đường dẫn quét.

### Gân tăng cứng (Rib)

Chọn chuỗi cạnh hở làm vị trí gân, thiết lập `Độ dày`, `Thao tác`; tùy chọn `Kéo dài tới chi tiết` quyết định gân có kéo dài cho tới khi chạm vào khối solid hay không.

## 6.4 Nhóm tính năng tinh chỉnh

### Đẩy-Kéo (Push-Pull, Q)

Đẩy-Kéo là một "cửa ngõ thông minh", tự động quyết định mở lệnh tính năng nào dựa vào đối tượng bạn chọn:

| Đối tượng chọn | Kết quả khi kéo |
| --- | --- |
| Mặt biên dạng phác thảo | Đùn (kéo ra khoảng cách, hướng/đầu mút quyết định tạo mới, gộp thêm hay cắt bỏ) |
| Mặt phẳng trên thân đặc | Dời mặt song song (Offset face) |
| Mặt tạo bởi tính năng bo góc/vát mép | Chỉnh sửa bán kính bo/vát mép tương ứng |
| Cạnh | Khoảng cách dương = Bo góc, khoảng cách âm = Vát mép |

Kéo mũi tên hoặc nhập giá trị trên bảng lệnh, nhấn Enter để xác nhận. Lệnh Đẩy-Kéo mỗi lần chỉ xử lý một loại đối tượng (mặt hoặc cạnh).

### Tạo lỗ (Hole)

**Tạo lỗ** là tính năng trừ bớt vật liệu (subtractive), bắt buộc phải gắn vào một thân tham số đã có, và thân đó phải có hình dạng trước tính năng tạo lỗ; không thể đặt tính năng tạo lỗ làm tính năng đầu tiên của một chuỗi rỗng.

Có thể đặt tâm lỗ theo hai cách:

1. **Chọn trực tiếp trên mặt**: Nhấp vào mặt phẳng của thân tham số làm `Mặt khoan`, sau đó nhấp một hoặc nhiều tâm lỗ trên mặt, nhấn `Enter` hoặc nút xác nhận để kết thúc. Tâm lỗ phải nằm trong phạm vi của mặt đó.
2. **Liên kết với điểm độc lập trong phác thảo**: Nhấp vào một hoặc nhiều điểm độc lập không phải đường dựng hình (non-construction) được tạo bằng công cụ **Điểm** trong phác thảo đang hiển thị, rồi xác nhận. Các điểm liên kết phải đến từ **cùng một phác thảo**; sau khi di chuyển hoặc ràng buộc lại các điểm này, tâm lỗ sẽ cập nhật theo điểm và chiếu lên mặt khoan. Chương trình sẽ cố gắng suy ra mặt khoan đồng phẳng từ mặt phẳng phác thảo; khi không tìm thấy mặt phù hợp, hệ thống sẽ giữ lại các điểm đã chọn và bạn nhấp thủ công vào mặt khoan, rồi hoàn tất việc chọn tâm lỗ.

Trước khi kết thúc việc chọn điểm, hãy thiết lập `Kiểu` và kích thước trên bảng lệnh. Cả ba kiểu đều dùng chung `Đường kính`, `Độ sâu (để trống = xuyên thủng)` và `Góc mũi khoan`, các tham số còn lại gồm:

| Kiểu | Tham số riêng | Hình dạng |
| --- | --- | --- |
| Đơn giản | Không có | Lỗ khoan thẳng, đáy lỗ bịt có góc nhọn mũi khoan |
| Lỗ bậc (Counterbore) | `Đường kính lỗ bậc`, `Độ sâu lỗ bậc` | Miệng lỗ có bậc hình trụ tròn |
| Lỗ côn (Countersink) | `Đường kính lỗ côn`, `Góc lỗ côn` | Miệng lỗ có vát côn |

Quy ước về độ sâu và mũi khoan:

- **Khi tạo lỗ mới, để trống độ sâu tức là xuyên thủng**, lỗ sẽ xuyên qua toàn bộ thân hiện tại; nhập giá trị dương sẽ tạo lỗ bịt (blind hole).
- `Độ sâu` của lỗ bịt được đo từ mặt khoan đến **chóp mũi khoan**, đã bao gồm cả phần mũi nhọn của mũi khoan, chứ không chỉ đo đoạn thành trụ thẳng; vì vậy độ sâu bắt buộc phải lớn hơn chiều cao của bản thân chóp mũi khoan.
- `Góc mũi khoan` là góc mở của mũi khoan, mặc định là **118°**.

Kích thước cũng phải thỏa mãn: đường kính khoan là số dương; góc mũi khoan và góc lỗ côn nằm trong khoảng từ 0° đến 180°; đường kính lỗ bậc, đường kính lỗ côn đều phải lớn hơn đường kính lỗ khoan; độ sâu lỗ bậc là số dương; độ sâu lỗ bậc hoặc chiều cao vát côn đều phải nhỏ hơn chiều dài thành trụ của lỗ khoan, không được chiếm hết toàn bộ thành thẳng.

#### Preset quy cách lỗ

Sau khi tạo lỗ, mở rộng **hàng tính năng** của nó, chọn quy cách trong danh sách thả xuống `Preset`. Các kích thước có sẵn gồm `M3`, `M4`, `M5`, `M6`, `M8`, `M10`, `M12`, `M14`, `M16`, `M20`.

- **Đơn giản**: Mỗi quy cách cung cấp 3 mức đường kính lỗ dung sai: `close` (chặt) / `normal` (bình thường) / `loose` (lỏng).
- **Lỗ bậc**: Dùng đường kính lỗ dung sai bình thường, và điền sẵn đường kính chứa đầu bu-lông và độ sâu bậc tương ứng.
- **Lỗ côn**: Dùng đường kính lỗ dung sai bình thường, và điền sẵn đường kính chứa đầu bu-lông và góc côn 90°; **M14 không có preset lỗ côn**.

Ví dụ với ren M8 dung sai bình thường:

- Lỗ đơn giản chọn mức `normal` của M8, đường kính khoan là **9**;
- Lỗ bậc chọn preset `⌀9 / ⌀14×8` của M8, đường kính khoan là **9**, đường kính lỗ bậc là **14**, độ sâu là **8**;
- Lỗ côn chọn preset `⌀9 / ⌀17.92×90°` của M8, đường kính khoan là **9**, đường kính lỗ côn là **17.92**, góc là **90°**.

Preset chỉ ghi các giá trị số vào các ô kích thước tương ứng, sau đó bạn vẫn có thể tự sửa đổi; preset **không tạo ren thực tế, cũng không phải bảng đường kính lỗ mồi để taro ren**.

Khi mất tham chiếu tâm lỗ, chức năng **Chọn lại** trên hàng tính năng chỉ chọn lại tâm lỗ, không thể thay đổi mặt khoan. Nếu bản thân mặt khoan đã bị mất, bạn cần phải tạo lại tính năng lỗ.

### Bo góc (Fillet)

Chọn cạnh (có thể chọn nhiều cạnh), thiết lập `Bán kính`. Để trống `Bán kính đầu cuối` biểu thị bo góc bán kính đều; nhập giá trị khác nhau để tạo bo góc bán kính biến thiên. Sau khi xác nhận sẽ sinh ra một tính năng bo góc.

### Vát mép (Chamfer)

Chọn cạnh, chọn chế độ vát:

| Chế độ | Tham số |
| --- | --- |
| Khoảng cách bằng nhau | Khoảng cách |
| Hai khoảng cách | Khoảng cách 1, Khoảng cách 2 |
| Khoảng cách và góc | Khoảng cách, Góc, Đảo chiều |

### Sửa bo góc / Sửa vát mép

Chọn mặt được tạo bởi một tính năng bo góc/vát mép nào đó, trực tiếp sửa bán kính/khoảng cách của tính năng đó. Cách này thường bảo toàn ý đồ thiết kế tốt hơn việc xóa tính năng rồi làm lại, đồng thời giảm thiểu việc các tham chiếu hạ nguồn bị mất hiệu lực; tuy nhiên khi bán kính hoặc khoảng cách làm thay đổi cấu trúc liên kết, bạn vẫn nên kiểm tra lại các tính năng hạ nguồn.

### Rút góc nghiêng (Draft)

1. Chọn mặt trung hòa (mặt phẳng chuẩn hoặc mặt phẳng trên thân) — góc nghiêng sẽ xoay quanh mặt này.
2. Chọn các mặt cần tạo độ nghiêng (có thể chọn nhiều mặt).
3. Thiết lập `Góc`; `Đảo chiều` để lật ngược hướng nghiêng.

### Tạo vỏ rỗng (Shell)

Chọn các mặt cần mở nắp, thiết lập `Độ dày`, `Hướng ra ngoài`, `Kiểu nối`. Thân solid sẽ được khoét rỗng thành dạng thành mỏng.

### Dời mặt song song (Offset Face)

Chọn các mặt cần di chuyển (có thể chọn nhiều mặt), thiết lập `Khoảng cách`. Tùy chọn `Giữ bán kính bo góc` dùng cho trường hợp bên cạnh mặt có góc bo: khi tích chọn, hệ thống sẽ gỡ bỏ góc bo trước, dời mặt đi, rồi tái dựng lại góc bo theo bán kính ban đầu (nếu không, bán kính góc bo sẽ biến dạng theo mặt và kéo các mặt phía sau đi theo).

- Nếu không phải khối solid, hoặc có khoang rỗng khép kín bên trong, hoặc trên mặt trơn có cạnh sắc, lệnh sẽ từ chối và giải thích nguyên nhân rõ ràng.
- Khi khoảng cách đặt quá lớn, lệnh sẽ báo giới hạn tối đa ước tính.

### Phân tách (Split)

Chọn một thân và công cụ phân tách (mặt/cạnh/khung dây), thiết lập `Phía giữ lại`: Cả hai phía / Phía pháp tuyến / Phía đối diện.

### Mảng tham số

Ba kiểu mảng tham số:

| Lệnh | Tham số |
| --- | --- |
| Mảng thẳng | Hướng 1, Khoảng cách, Số lượng; khi tích chọn Hướng 2 có thể đặt Khoảng cách 2, Số lượng 2; việc bỏ qua instance được chỉnh sửa trong hàng tính năng |
| Mảng xoay vòng | Trục mảng, Tổng góc, Số lượng, Phân bố đều |
| Mảng theo đường cong | Đường dẫn, Khoảng cách hoặc Phân bố đều, Định hướng (Khóa cố định / Theo tiếp tuyến) |

### Đối xứng (Mirror)

Chọn mặt phẳng đối xứng (mặt phẳng chuẩn hoặc mặt phẳng trên thân), tùy chọn `Hợp nhất` quyết định kết quả đối xứng có gộp chung với thân gốc hay không.

### Boolean

- **Hợp nhất (Union)**: Mục tiêu ∪ Công cụ
- **Trừ bớt (Cut)**: Mục tiêu − Công cụ
- **Giao nhau (Intersection)**: Mục tiêu ∩ Công cụ

Thân công cụ sẽ không bị xóa, mà được **ẩn đi và gắn bên dưới danh sách tính năng của thân**, đóng vai trò là đầu vào cho tính năng Boolean đó. Để sửa đổi hoặc xóa chúng, hãy thao tác thông qua danh sách tính năng.

### Xóa tính năng và Chọn lại

- `Xóa tính năng`: Chọn một mặt do tính năng nào đó tạo ra (như mặt bo tròn), loại bỏ tính năng đó khỏi chuỗi và hàn lành bề mặt.
- `Chọn lại`: Dùng khi hình học mà tính năng tham chiếu bị mất; cũng có thể truy cập từ menu hàng tính năng.

<a id="65-体与节点操作"></a>
## 6.5 Thao tác trên thân và node

- **Di chuyển / Xoay / Đối xứng**: Thực hiện **biến đổi vật rắn (rigid transform)** trên thân tham số, biến đổi này sẽ được bổ sung như một tính năng `transform` vào cuối chuỗi tính năng (còn mảng và sao chép sẽ tạo ra các node instance).
- **Mảng**: Tạo ra nhiều instance hoặc nhóm; các instance chia sẻ chung hình học nguồn, việc sửa nguồn sẽ ảnh hưởng đến tất cả các instance.
- **Tách độc lập**: Biến thực thể (instance) thành bản sao có hình học độc lập; sửa bản sao không ảnh hưởng đến nguồn.
- **Xóa**: Xóa toàn bộ thân cùng toàn bộ chuỗi tính năng của nó.
- **Thùng sơn**: Đổi vật liệu cho toàn bộ thân.

Phác thảo không thể di chuyển — nó được định nghĩa trong hệ tọa độ thế giới, vị trí do mặt phẳng chuẩn khi tạo quyết định. Muốn di chuyển thiết kế, hãy di chuyển bản thân thân đó hoặc sửa đổi tham số phác thảo/tính năng.

<a id="66-文档变量"></a>
## 6.6 Biến số tài liệu

**Tham số → Khác → Biến số** (hoặc `feature.variable`) để mở bảng biến số cấp tài liệu:

![Hộp thoại biến số](images/09-variables.png)

| Cột | Giải thích |
| --- | --- |
| Tên | Tên biến số, phải khớp với biểu thức chính quy `[A-Za-z_][A-Za-z0-9_]*`, không được trùng tên với hằng số `pi`, `e` |
| Kiểu | Chiều dài / Góc / Không thứ nguyên (vô hướng) |
| Giá trị | Khi được trỏ chuột vào thì sửa biểu thức, khi rời trỏ chuột sẽ hiển thị giá trị đã phân giải hoặc thông báo lỗi |
| Mô tả | Chỉnh sửa trong ô nhỏ cạnh tên, tùy chọn |

Thao tác:

- Nhập tên biến mới vào **ô "Tên" ở hàng trống dưới đáy bảng**, rời ô hoặc nhấn `Enter` để thêm mới; không phải dùng nút `+` trên thanh tiêu đề. Hàng mới mặc định là kiểu Chiều dài, biểu thức là `0`.
- Sau khi chọn một hàng đã có, có thể dùng các nút trên thanh tiêu đề để Xóa, Di chuyển lên, Di chuyển xuống.
- Các trường như tên, biểu thức sẽ lập tức được xác nhận khi rời tiêu điểm hoặc nhấn `Enter` và kích hoạt tái dựng các phác thảo cùng thân liên quan; bảng không có nút "Xác nhận" chung, việc đóng bảng cũng không hoàn tác các thay đổi. Mỗi lần xác nhận là một bước hoàn tác.
- Biến số được tính toán tuần tự từ trên xuống dưới, **chỉ có thể tham chiếu các biến nằm phía trên nó**, do đó sẽ không xảy ra tham chiếu vòng tròn.
- Kéo mép tiêu đề cột để chỉnh độ rộng cột "Tên/Kiểu", hoặc dùng các phím mũi tên để tinh chỉnh.
- **Biểu thức lỗi cũng được lưu nguyên trạng**. Hàng bị lỗi được đánh dấu màu đỏ và không sinh ra giá trị có thể tham chiếu; các hàng độc lập không phụ thuộc vào nó vẫn được tính toán, nhưng các biến hạ nguồn tham chiếu biến lỗi này cũng sẽ bị lỗi theo.

Hỗ trợ biểu thức:

- Số, tên biến khác, `+ - * / %`, dấu ngoặc đơn; không hỗ trợ toán tử lũy thừa `^`, và không viết các hậu tố đơn vị như `mm`;
- Hằng số `pi`, `e`;
- Hàm số: `abs`, `sqrt`, `floor`, `ceil`, `round`, `min`, `max`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`;
- Góc luôn luôn tính theo độ: `sin(30)` bằng 0.5, `sin(90)` mới bằng 1, `sin(pi/2)` **không phải** là 1;
- Có kiểm tra thứ nguyên (kiểu): biến chiều dài không thể đưa trực tiếp vào vị trí của góc, hàm `sqrt` yêu cầu số mũ thứ nguyên của đầu vào phải là số chẵn.

Giả sử `width`, `height` là biến chiều dài, `tilt` là biến góc, có thể dùng các biểu thức thứ nguyên sau:

| Biểu thức | Kiểu kết quả và công dụng |
| --- | --- |
| `width*2` | Chiều dài, ví dụ định nghĩa tổng bề rộng gấp đôi bề rộng |
| `width/height` | Tỷ số không thứ nguyên |
| `sqrt(width*height)` | Chiều dài, tức căn bậc hai của diện tích tạo bởi bình phương chiều dài |
| `width*cos(tilt)` | Chiều dài, tức hình chiếu của bề rộng theo hướng nghiêng |
| `atan2(height,width)` | Góc; thứ tự tham số là y trước, x sau |

Trong tham số tính năng hoặc kích thước phác thảo, chỉ cần nhập trực tiếp tên biến hoặc biểu thức, ví dụ: `Độ sâu = plateThickness * 2`.

### Ẩn theo biến số

Menu hàng tính năng → `Ẩn theo biến số…`, chọn một biến số:

- Khi biến số phân giải thành 0 thì ẩn tính năng này;
- Tích chọn "Ẩn khi biến số khác 0" thì đảo ngược lại quy tắc;
- Khi biến số không tồn tại hoặc phân giải thất bại, **tính năng sẽ không bị ẩn**, mà chỉ hiển thị cảnh báo trên hàng tính năng.

Hàng bị ẩn theo biến số có màu sắc hiển thị riêng biệt để phân biệt với hàng bị ẩn thủ công.

---

Bước tiếp theo: [Chương 7 Phác thảo](07-sketch.md)
