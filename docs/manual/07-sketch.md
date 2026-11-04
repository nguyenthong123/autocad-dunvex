# 7. Phác thảo (Sketch)

Phác thảo là cội nguồn của dựng hình tham số: biên dạng 2D + ràng buộc + kích thước, sau đó được đùn, xoay, quét hoặc vuốt nối thành khối 3D solid. Phác thảo được bộ giải ràng buộc garlic tích hợp sẵn giải theo thời gian thực.

<a id="71-新建与编辑草图"></a>
## 7.1 Tạo mới và chỉnh sửa phác thảo

1. **Tham số → Tạo phác thảo mới**.
2. Chọn mặt phẳng chuẩn:
   - Ở giữa khung nhìn xuất hiện ba khối vuông bán trong suốt Đỏ/Xanh lá/Xanh dương, tương ứng với các mặt phẳng chuẩn thế giới YZ / ZX / XY;
   - Cũng có thể nhấp vào một mặt phẳng trên thân đặc để lấy mặt đó làm mặt phẳng phác thảo.

   ![Chọn mặt phẳng chuẩn phác thảo](images/02-sketch-plane-pick.png)

3. Trình chỉnh sửa phác thảo mở ra: Camera tự động xoay chính diện vuông góc với mặt phẳng phác thảo, khóa tính năng xoay camera, ẩn các mặt của thân đặc, và thanh Ribbon chuyển sang thẻ ngữ cảnh **Phác thảo**.

   ![Phiên làm việc phác thảo](images/03-sketch-session.png)

4. Vẽ hình, thêm ràng buộc, gắn kích thước.
5. **Phác thảo → Thoát phác thảo**, hoặc nhấn `Esc` từng bước để thoát.

Chỉnh sửa lại phác thảo:

- Chọn phác thảo, nhấp **Tham số → Sửa phác thảo**; hoặc
- Nhấp đúp chuột vào node phác thảo trong cây dự án hoặc trên khung nhìn.

> Phác thảo thuộc hệ tọa độ thế giới, không thể kéo rê tự do như thân đặc. Muốn thay đổi vị trí phác thảo, hãy sửa đổi mặt phẳng chuẩn khi tạo, hoặc dùng công cụ "Biến đổi" của phác thảo để di chuyển hình học bên trong phác thảo.

## 7.2 Thẻ phác thảo

| Nhóm | Nội dung |
| --- | --- |
| Phác thảo | Thoát phác thảo |
| Vẽ | Đường thẳng, Đường tròn/Elip, Cung tròn/Cung elip, Hình chữ nhật/Đa giác, Đường cong Spline/Bézier/Conic (menu thả xuống), Điểm, Chữ |
| Ràng buộc | Trùng khớp, Cố định/Nằm ngang/Thẳng đứng, Song song/Vuông góc/Bằng nhau, Tiếp tuyến/Đối xứng/Trung điểm, Điểm trên đường/Căn ngang/Căn dọc |
| Kích thước | Kích thước (thông minh), Khoảng cách/Bán kính/Góc, Khoảng cách điểm-đường/Khoảng cách ngang/Khoảng cách dọc |
| Chỉnh sửa | Bo góc/Vát mép, Dời song song (Offset), Cắt tỉa/Kéo dài/Ngắt, Đối xứng/Biến đổi/Mảng |
| Khác | Danh sách ràng buộc, Chuyển đổi Ràng buộc chính (Driving)/Bị động (Driven), Chiếu cạnh/Chuyển tham chiếu ngoài/Chuyển đường dựng hình |

## 7.3 Công cụ vẽ

Mỗi lệnh vẽ đều chấp nhận tùy chọn "Đường dựng hình" (hộp kiểm trong bảng lệnh): khi tích chọn, hình vẽ ra là hình học tham chiếu, hiển thị bằng nét đứt, có thể tham gia vào ràng buộc và bắt điểm, nhưng không tham gia tạo biên dạng đùn khối.

| Lệnh | Cách vẽ |
| --- | --- |
| Đường thẳng | Lần lượt chọn các điểm liên tiếp; nhấn `Enter`/`Esc` để kết thúc chuỗi |
| Đường tròn | Tâm tròn → Điểm bán kính |
| Elip | Tâm elip → Điểm mút trục lớn → Điểm mút trục nhỏ |
| Cung tròn | Tâm cung → Điểm bắt đầu → Điểm kết thúc (quét ngược chiều kim đồng hồ) |
| Cung elip | Elip (Tâm/Trục lớn/Trục nhỏ) → Điểm bắt đầu → Điểm kết thúc |
| Hình chữ nhật | Hai điểm góc đối diện; tự động sinh ra 4 đoạn thẳng + ràng buộc Nằm ngang/Thẳng đứng + Trùng khớp |
| Đa giác | Tâm đa giác → Điểm bán kính; trên bảng lệnh thiết lập `Số cạnh`, `Ngoại tiếp/Nội tiếp` |
| Đường cong Spline | Lần lượt chọn các điểm điều khiển |
| Đường cong Bézier | 4 điểm điều khiển, đường cong Bézier bậc 3 |
| Đường conic | Điểm bắt đầu → Điểm kết thúc → Điểm điều khiển → Điểm vai (quyết định hệ số rho) |
| Điểm | Nhấp chuột để đặt điểm |
| Chữ | Chọn điểm neo → Chọn điểm đỉnh (quyết định chiều cao và hướng); trên bảng lệnh đặt nội dung, chiều cao chữ, font chữ |

Khi vẽ hình, thanh trạng thái sẽ hiển thị số đo kích thước, bạn cũng có thể gõ trực tiếp chiều dài/góc.

### Ràng buộc tự động và Bắt điểm từ tính

- Khi vẽ đường thẳng gần nằm ngang/thẳng đứng, hệ thống sẽ tự động thêm ràng buộc **Nằm ngang/Thẳng đứng**.
- Khi điểm mút đến gần điểm mút/đường cong khác, hệ thống sẽ tự động thêm ràng buộc **Trùng khớp** hoặc **Điểm trên đường**.
- Khi gần tiếp tuyến, tự động thêm ràng buộc **Tiếp tuyến**.
- Khi kéo rê một điểm trong phác thảo cũng có bắt điểm từ tính, ràng buộc sẽ được ấn định khi thả chuột.
- Ràng buộc tự động chỉ được thêm khi hợp lý: ví dụ ghim tâm hình tròn vào chính nó sẽ bị từ chối.

<a id="74-约束"></a>
## 7.4 Ràng buộc

Ràng buộc quyết định mối quan hệ tương đối giữa các đối tượng hình học. Sau khi gọi lệnh, hãy làm theo hướng dẫn trên thanh trạng thái để chọn thực thể/điểm; khi không thỏa mãn điều kiện, hệ thống sẽ đưa ra thông báo nhắc nhở (ví dụ: "Ràng buộc trung điểm đã cố định điểm này trên đường, không cần thêm ràng buộc điểm trên đường nữa").

| Ràng buộc | Tác dụng |
| --- | --- |
| Trùng khớp | Hai điểm trùng khít nhau |
| Cố định | Ghim chặt cả hai tọa độ X, Y hiện tại của điểm được chọn |
| Nằm ngang | Đường thẳng nằm ngang |
| Thẳng đứng | Đường thẳng thẳng đứng |
| Song song | Hai đường thẳng song song |
| Vuông góc | Hai đường thẳng vuông góc |
| Bằng nhau | Chiều dài bằng nhau / Bán kính bằng nhau |
| Tiếp tuyến | Hai đường cong tiếp tuyến |
| Đối xứng | Hai điểm/hai đường đối xứng qua một trục |
| Trung điểm | Điểm nằm ở chính giữa đường thẳng |
| Điểm trên đường | Điểm nằm trên đường cong/đường thẳng |
| Căn ngang | Hai điểm có cùng tung độ y |
| Căn dọc | Hai điểm có cùng hoành độ x |

Ràng buộc **Cố định** mỗi lần tác dụng lên một điểm duy nhất, ví dụ điểm mút đoạn thẳng hoặc tâm tròn, triệt tiêu hai bậc tự do vị trí của điểm đó, chứ không phải khóa chung toàn bộ tập hợp đối tượng. Nhấp đúp vào huy hiệu cố định (hoặc hàng tương ứng trong danh sách ràng buộc) để chỉnh sửa hai tọa độ này.

Các lưu ý quan trọng:

- Thêm trùng lặp một ràng buộc đã có sẽ báo "Ràng buộc đã tồn tại".
- Khi các ràng buộc mâu thuẫn nhau, thanh trạng thái / danh sách ràng buộc sẽ báo **Xung đột**; ràng buộc dư thừa sẽ được đánh dấu là **Dư thừa (Redundant)**. Các xung đột hoặc dư thừa thông thường có thể khôi phục bằng cách hoàn tác ràng buộc vừa thêm, hoặc xóa bớt một ràng buộc theo đề xuất chẩn đoán.
- Khi xảy ra xung đột hoặc dư thừa, có thể dùng công cụ **Tìm thủ phạm** trong bảng điều khiển: công cụ sẽ thử xóa từng ràng buộc và liệt kê mã số ứng viên. Thông báo "Xóa bất kỳ một trong các ràng buộc `#2, #5`" nghĩa là chỉ xóa một trong số đó, **không phải xóa toàn bộ danh sách liệt kê**; chỉ khi có thông báo "Cần xóa một nhóm" thì mới biểu thị rằng không thể giải quyết vấn đề bằng cách xóa riêng lẻ một ràng buộc.
- Nếu có thông báo kích thước ép đối tượng vào tình trạng **Sụp đổ hình học (Geometric collapse)** (ví dụ chiều dài đoạn thẳng hoặc bán kính trở về 0), cách xử lý sẽ khác: bạn phải sửa đổi kích thước chính gây sụp đổ, hoặc nới lỏng các ràng buộc liên quan, chứ không xóa từng cái theo cách xử lý xung đột thông thường; lúc này không có ứng viên xóa đơn lẻ nào hợp lệ.
- Xóa ràng buộc: Chọn trong danh sách ràng buộc rồi nhấn `Delete` / `Backspace`, hoặc chọn biểu tượng ràng buộc trong khung nhìn rồi xóa.

### Bảng danh sách ràng buộc

Nhấp **Phác thảo → Danh sách ràng buộc** để mở:

![Bảng danh sách ràng buộc](images/04-sketch-constraints.png)

Bảng liệt kê tất cả các ràng buộc theo thứ tự (`#1 Trùng khớp`, `#2 Trùng khớp`...). Khi rê chuột qua một hàng, huy hiệu ràng buộc và các đối tượng hình học liên quan trong khung nhìn sẽ cùng sáng lên; rất tiện để điều tra xung đột và dư thừa.

## 7.5 Đo và gán kích thước

| Lệnh | Đối tượng đo |
| --- | --- |
| Kích thước | Thông minh: Tự động nhận diện khoảng cách/bán kính/góc theo hình học đã chọn |
| Khoảng cách | Khoảng cách giữa hai điểm hoặc hai đường thẳng song song |
| Bán kính | Bán kính hình tròn / cung tròn |
| Góc | Góc giữa hai đường thẳng |
| Khoảng cách điểm-đường | Khoảng cách từ một điểm đến một đường thẳng |
| Khoảng cách ngang | Khoảng cách ngang giữa hai điểm / hai đường thẳng |
| Khoảng cách dọc | Khoảng cách dọc giữa hai điểm / hai đường thẳng |

Thao tác:

1. Thực hiện lệnh, làm theo lời nhắc chọn hình học (tối đa hai đối tượng).
2. Di chuyển con trỏ chuột, đường kích thước xem trước sẽ đi theo.
3. Nhấp chuột chọn vị trí đặt đường kích thước.
4. Đối với kích thước chính (driving) cần nhập giá trị, nhập số vào và xác nhận. Ô nhập giá trị hỗ trợ biểu thức và có thể tham chiếu biến số tài liệu.
5. Sau khi xác nhận, ràng buộc được ấn định và tính là một bước hoàn tác; nếu hủy bỏ sẽ hoàn tác về trước đó.

Về sau, bạn có thể **nhấp đúp vào chữ số kích thước** để sửa đổi giá trị.

### Kích thước chính (Driving) và Kích thước bị động (Driven)

- **Kích thước chính (Driving)** (mặc định): Ràng buộc hình học, thay đổi giá trị sẽ làm di chuyển/biến đổi hình học.
- **Kích thước bị động (Driven)**: Chỉ đo kích thước hình học hiện tại, không ràng buộc. Kích thước bị động hiển thị ở chế độ chỉ đọc, không thể trực tiếp sửa giá trị.
- Kích thước mới đo nếu bị **dư thừa** so với các ràng buộc hiện có sẽ tự động chuyển thành kích thước bị động, trực tiếp giữ lại giá trị đo được, **không bật hộp thoại nhập số**, và không điều khiển hình học nữa.
- Dùng lệnh **Chuyển đổi Driving / Driven**, hoặc chọn kích thước rồi chuyển đổi. Chỉ sau khi chuyển về kích thước chính thì mới có thể chỉnh sửa giá trị.

## 7.6 Bậc tự do và trạng thái giải

Góc dưới bên trái thanh trạng thái hiển thị:

- `Bậc tự do: n` — Phác thảo còn n bậc tự do chưa được ràng buộc;
- `Ràng buộc đầy đủ` — Bậc tự do bằng 0;
- `Xung đột ràng buộc` / `Ràng buộc dư thừa` — Bộ giải phát hiện vấn đề;
- `Phác thảo không thể giải — Thay đổi lần này không có hiệu lực` — Thao tác bị từ chối, phác thảo giữ nguyên như cũ.

Trong trình chỉnh sửa, **các đối tượng chưa được ràng buộc đầy đủ sẽ hiển thị màu xanh dương**; sau khi mọi tham số của một đối tượng đều được ràng buộc, nó sẽ trở về màu đường viền mặc định. Bạn có thể dựa vào dấu hiệu này để tìm ra phần còn thiếu ràng buộc, và lấy trạng thái `Ràng buộc đầy đủ` trên thanh trạng thái làm chuẩn xác nhận cuối cùng cho toàn bộ phác thảo.

### Ví dụ: Ràng buộc đầy đủ cho hình chữ nhật

1. Dùng lệnh **Hình chữ nhật** chọn hai điểm góc đối diện. Công cụ tự động tạo 4 đường thẳng cùng các ràng buộc trùng khớp góc, cạnh trên/dưới nằm ngang, cạnh trái/phải thẳng đứng; lúc này thường còn lại 4 bậc tự do: vị trí tổng thể x/y, cùng chiều rộng và chiều cao.
2. Định vị một điểm góc: Muốn đặt điểm góc vào gốc tọa độ, dùng **Trùng khớp** lần lượt chọn điểm góc đó và gốc tọa độ phác thảo; cũng có thể dùng **Cố định** cho điểm góc đó, rồi nhấp đúp vào huy hiệu cố định để nhập tọa độ X/Y mong muốn.
3. Đo kích thước: Dùng **Khoảng cách ngang** chọn hai điểm mút của một cạnh ngang để định chiều rộng, dùng tiếp **Khoảng cách dọc** chọn hai điểm mút của một cạnh dọc để định chiều cao.
4. Quan sát thanh trạng thái, trạng thái sẽ chuyển thành `Ràng buộc đầy đủ`; nếu vẫn còn đối tượng màu xanh dương, hãy tiếp tục kiểm tra bậc tự do chưa được ràng buộc của nó.

## 7.7 Công cụ chỉnh sửa phác thảo

| Lệnh | Giải thích |
| --- | --- |
| Bo góc | Chọn hai đối tượng liền kề, đặt bán kính |
| Vát mép | Chọn hai đối tượng liền kề, đặt khoảng cách |
| Dời song song (Offset) | Chọn đối tượng (nhấp chọn hoặc quét chọn), kéo mũi tên hoặc đặt `Khoảng cách`; các góc có nhiều cạnh giao nhau sẽ được dời song song riêng |
| Cắt tỉa | Nhấp xóa đoạn muốn bỏ |
| Kéo dài | Chọn đối tượng cần kéo dài, rồi chọn đường ranh giới |
| Ngắt | Nhấp vào điểm ngắt trên đối tượng; đường cong khép kín cần hai điểm ngắt |
| Đối xứng | Chọn đối tượng (hoặc quét chọn), rồi nhấp vào đường đối xứng |
| Biến đổi | Sau khi chọn đối tượng, kéo các tay cầm để tịnh tiến/xoay/co giãn, nhấn `Enter` để xác nhận |
| Mảng | Mảng thẳng / Mảng xoay vòng / Theo đường cong; đặt số lượng, khoảng cách, góc |

Chỉnh sửa phác thảo sẽ thay đổi hình học và có thể làm mất các ràng buộc không thể duy trì. Sau khi lệnh hoàn thành sẽ hiển thị thông báo đã gỡ bỏ bao nhiêu ràng buộc (ví dụ: "Cắt tỉa đã gỡ bỏ 2 ràng buộc").

### Huy hiệu của lệnh Dời song song và Mảng

Lệnh Dời song song và Mảng sẽ hiển thị các huy hiệu có thể nhấp đúp:

- Dời song song: `Dời 40`, nhấp đúp để đổi khoảng cách;
- Mảng: `12 đối tượng` / `Khoảng cách 25` / `Cả vòng 6`, nhấp đúp để đổi số lượng, khoảng cách hoặc góc;
- Menu hàng mảng có thể **Hủy nhóm mảng** (các bản sao trở thành hình học thông thường), **Xóa mảng** (xóa cả mảng lẫn các bản sao) hoặc chỉ **Tách bớt một số đối tượng**.

## 7.8 Đường dựng hình, Chiếu cạnh và Tham chiếu ngoài

### Đường dựng hình (Construction line)

- Khi vẽ tích chọn "Đường dựng hình", hoặc sau khi vẽ xong dùng **Chuyển đường dựng hình** để biến đối tượng được chọn thành đường dựng hình.
- Đường dựng hình hiển thị bằng nét đứt, tham gia vào ràng buộc/bắt điểm, nhưng không tạo thành biên dạng đùn.
- Khi chưa chọn đối tượng nào, lệnh `Chuyển đường dựng hình` sẽ cho phép bạn nhấp chọn liên tiếp từng đối tượng để chuyển đổi.

Trong thực tế, bạn có thể vẽ một đường trục tâm dựng hình để làm trục **Đối xứng**, hỗ trợ định vị **Trung điểm** hoặc giao điểm, cũng có thể dùng đường dựng hình, đường tròn dựng hình để đo góc, khoảng cách hoặc bán kính nhằm điều khiển biên dạng thực. Bằng cách này, kích thước và quan hệ hình học đều được bảo toàn trọn vẹn mà hình học phụ trợ không bị lẫn vào tiết diện đùn. Nếu một đường phác thảo bình thường tạm thời không nên tham gia tạo biên dạng, bạn cũng có thể chuyển nó thành đường dựng hình thay vì phải xóa nó cùng các ràng buộc của nó.

### Chiếu cạnh (Project Edge)

**Chiếu cạnh** đưa các cạnh trên thân khác đồng phẳng với mặt phẳng phác thảo vào làm tham chiếu ngoài; hỗ trợ đường thẳng, đường tròn và cung tròn, chứ không phải chiếu phối cảnh một cạnh không gian bất kỳ. Các cạnh chiếu nhận được chia thành hai vai trò:

- **Tham chiếu**: Nét đứt, chỉ dùng để ràng buộc/định vị, không tham gia tạo biên dạng;
- **Biên dạng**: Có thể cùng với các đường phác thảo thông thường khép thành biên dạng dùng cho các tính năng như đùn khối.

Cách dùng điển hình là vẽ biên dạng mới trên bề mặt trên của tấm chi tiết đã có: trước tiên chiếu các cạnh của tấm thành **Tham chiếu**, sau đó gắn điểm mút của đường vẽ mới **Trùng khớp** với điểm góc tham chiếu, hoặc thêm các ràng buộc song song, vuông góc, tiếp tuyến và kích thước khoảng cách. Nhờ đó phác thảo mới sẽ bám theo vị trí của cạnh chi tiết ở thượng nguồn mà bạn không cần phải chép tay tọa độ. Chỉ khi thực sự cần cho cạnh đã có tham gia vào tiết diện khép kín thì mới chuyển nó sang vai trò **Biên dạng**.

Lệnh **Chuyển tham chiếu ngoài** dùng để nhấp vào đường tham chiếu ngoài màu tím và chuyển đổi qua lại giữa hai vai trò trên, đây là công tắc riêng biệt so với lệnh **Chuyển đường dựng hình** của đường phác thảo thông thường. Khi hình học nguồn bị mất, tham chiếu ngoài sẽ chuyển sang màu đỏ và thông báo số lượng bị mất; hệ thống sẽ lưu lại bản chụp nhanh (snapshot) hình học gần nhất, biên dạng cũng tạm thời sử dụng hình học đóng băng này, vì thế bạn vẫn nên nhanh chóng sửa chữa nguồn tham chiếu, không thể xem việc "vẫn sinh được biên dạng" là liên kết vẫn bình thường.

<a id="79-草图的退出与清理"></a>
## 7.9 Thoát và dọn dẹp phác thảo

- `Esc` thoát lùi từng lớp một: Kết thúc chuỗi vẽ hiện tại → Thoát công cụ hiện tại → Hủy chọn/hủy ràng buộc → (Tùy trường hợp) Thoát phiên làm việc phác thảo.
- `Delete` / `Backspace` xóa đối tượng/ràng buộc dưới con trỏ hoặc đang được chọn.
- **Thoát phác thảo** lưu phác thảo và quay về tài liệu; phác thảo vẫn có thể được mở lại để chỉnh sửa bất kỳ lúc nào.
- Phác thảo sau khi được dùng làm đầu vào tính năng để đùn/xoay sẽ tự động ẩn đi, nhưng vẫn có thể tìm thấy và chỉnh sửa lại trong cây dự án.

---

Bước tiếp theo: [Chương 8 Tài liệu, tệp tin và hoàn tác](08-document-files.md)
