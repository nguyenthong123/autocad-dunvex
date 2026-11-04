# 3. Góc nhìn, chọn đối tượng và bắt điểm

<a id="31-相机导航"></a>
## 3.1 Điều hướng Camera

Chili3D cung cấp 5 bộ cấu hình điều hướng, có thể lựa chọn trong mục "Kiểu điều hướng 3D" ở trang chủ; thanh trạng thái sẽ hiển thị hướng dẫn thao tác chuột của cấu hình hiện tại. Cấu hình mặc định là **Chili3d**.

| Cấu hình | Kéo lia (Pan) | Xoay góc nhìn (Orbit) |
| --- | --- | --- |
| Chili3d | Kéo chuột giữa | Shift + Kéo chuột giữa |
| Revit | Kéo chuột giữa | Shift + Kéo chuột giữa |
| Blender | Shift + Kéo chuột giữa | Kéo chuột giữa |
| Creo | Shift + Kéo chuột giữa | Kéo chuột giữa |
| Solidworks | Ctrl + Kéo chuột giữa | Kéo chuột giữa |

Các thao tác chung khác:

- **Con lăn cuộn**: Thu phóng theo hướng con trỏ chuột. Cấu hình Solidworks và Creo sẽ đảo ngược chiều cuộn để khớp với phần mềm gốc.
- **Nhấp đúp chuột giữa** (2 lần trong vòng nửa giây): Khớp toàn bộ nội dung vào khung nhìn (Fit content).
- **Kéo chuột trái**: Không phải xoay camera, mà là kéo khung chữ nhật để chọn đối tượng. Thao tác xoay camera sẽ quay quanh tâm của đối tượng đang chọn, hoặc tâm của hình dạng nằm dưới con trỏ chuột.
- **Chuột phải**: Không bật menu ngữ cảnh trình duyệt; trong phác thảo, chuột phải có thể hủy thao tác chọn hiện tại.
- **Màn hình cảm ứng**: Kéo 1 ngón tay (khi thao tác chọn đang kích hoạt), 2 ngón tay để kéo lia và thu phóng, 3 ngón tay để xoay góc nhìn.

<a id="32-投影与显示"></a>
## 3.2 Phép chiếu và hiển thị

- Hai biểu tượng bên phải khung nhìn dùng để chuyển đổi giữa phép chiếu **trực giao (orthographic)** và **phối cảnh (perspective)**.
- Dòng chữ `[ Khối đặc và khung dây ]` ở góc trên bên trái nhấp vào để chuyển giữa **Khối đặc / Khung dây / Khối đặc và khung dây**.
- **Khớp nội dung**: Khi có đối tượng đang chọn, ưu tiên đưa đối tượng đó vừa khít khung nhìn; khi không chọn gì sẽ khớp toàn bộ khung cảnh. Khi tạo tài liệu mới mà mô hình quá nhỏ không nhìn thấy, bạn có thể nhấp vào nút này trước tiên.
- Để khớp toàn bộ khung cảnh, khi không chạy lệnh nào hãy nhấn `Esc` để xóa vùng chọn rồi mới nhấp "Khớp nội dung". Tính khả kiến (ẩn/hiện) không phải là điều kiện duy nhất khi tính toán phạm vi: đối tượng bị ẩn vẫn có thể được tính vào phạm vi bao quanh, trong khi hình học tham chiếu có thể bị loại trừ theo loại phần tử. Nếu sau khi khớp nội dung mà chi tiết chính trông quá nhỏ, hãy kiểm tra xem có nút nào nằm quá xa chi tiết chính không, hoặc chỉ chọn đối tượng mục tiêu rồi khớp lại.
- Thẻ đánh dấu góc nhìn (**Cơ bản → Khung cảnh → Tạo từ camera**) có thể lưu và gọi lại các góc nhìn thường dùng, chi tiết xem tại [Mục 2.3](02-interface.md#23-视口).

![Menu thả xuống chế độ hiển thị và mặt bích xanh](images/16-display-modes.png)

*Góc trên bên trái khung nhìn có thể chuyển đổi giữa khối đặc, khung dây hoặc khối đặc và khung dây.*

## 3.3 Chọn đối tượng

| Thao tác | Kết quả |
| --- | --- |
| Nhấp chuột trái vào hình dạng | Chọn toàn bộ nút |
| Nhấp chuột trái vào khoảng trống | Xóa vùng chọn |
| Shift + Nhấp chuột | Bật/tắt nút đó trong vùng chọn khung nhìn (thêm vào / bớt ra) |
| Kéo chuột trái | Chọn theo khung các mô hình thông thường, trúng khi tâm đối tượng kết xuất lọt vào khung |
| Ctrl + Nhấp chuột (cây dự án, trên macOS cũng dùng Ctrl, không dùng Cmd) | Bật/tắt chọn nhiều đối tượng |
| Shift + Nhấp chuột (cây dự án) | Chọn một dải đối tượng liên tục |
| Tab | Chuyển đổi luân phiên giữa các hình dạng chồng lấn dưới con trỏ chuột |
| Enter / Space | Xác nhận thao tác chọn hiện tại (khi đang trong lệnh) |
| Esc | Xóa vùng chọn, hoặc hủy lệnh hiện tại |

Chọn theo khung cho mô hình thông thường không đòi hỏi phải bao trùm toàn bộ mô hình, khi thao tác hãy cố gắng để tâm của đối tượng rơi vào khung chữ nhật. Các hình con (sub-shape) và chú thích có phương thức phát hiện riêng, không áp dụng một quy tắc chung "chạm vào là chọn". Sau khi chọn theo khung nên đối chiếu lại trên cây dự án và bảng thuộc tính; nếu bị sót đối tượng thì điều chỉnh lại khung chữ nhật bao phủ tâm đối tượng, hoặc đổi góc nhìn khác rồi thử lại.

Trạng thái được chọn hiển thị bằng màu xanh lá cây. Do trạng thái rê chuột (hover) cũng là màu xanh lá, nên khi nhìn thấy màu xanh hãy lấy tên hiển thị trong bảng thuộc tính / thanh trạng thái làm chuẩn.

Trong quá trình thực thi lệnh, thao tác chọn sẽ do lệnh đó tiếp quản: ví dụ "Bo góc" chỉ chấp nhận chọn cạnh, "Làm rỗng" chỉ chấp nhận chọn mặt, khi rê chuột hệ thống sẽ tự động lọc các loại đối tượng được phép chọn. Nếu số đối tượng chọn theo khung trong lệnh ít hơn mong đợi, hãy kiểm tra loại đối tượng hoặc hình con mà thanh trạng thái đang yêu cầu, tránh việc chỉ liên tục mở rộng khung chọn.

## 3.4 Biến đổi và kéo rê

- Sau khi chọn nút có hỗ trợ biến đổi trực tiếp, mục thu gọn "Ma trận" trong bảng thuộc tính cho phép nhập chính xác khoảng dịch chuyển, góc xoay và tỷ lệ thu phóng.
- Khi trong khung nhìn xuất hiện tay cầm mũi tên/vòng tròn/khối hộp (trong các lệnh di chuyển, xoay, mảng, đùn, đẩy-kéo...), kéo rê tay cầm để xem trước thay đổi theo thời gian thực.
- Khi kéo rê, thanh trạng thái hiển thị giá trị số; bạn cũng có thể gõ trực tiếp giá trị số vào bảng lệnh, hoặc gõ trực tiếp bàn phím ngay trong lúc kéo rê (sẽ bật lên một ô nhập số).

<a id="35-捕捉与追踪"></a>
## 3.5 Bắt điểm và dò gióng

Hộp kiểm `Bắt điểm` ở bên phải thanh trạng thái là công tắc chính; nhấp vào mũi tên nhỏ bên cạnh để bật/tắt từng loại bắt điểm trong bảng điều khiển:

| Bắt điểm | Hút vào vị trí |
| --- | --- |
| Điểm mút | Điểm đầu/cuối của đoạn thẳng/cạnh |
| Trung điểm | Điểm chính giữa của đoạn thẳng/cạnh |
| Tâm tròn | Tâm của đường tròn / cung tròn / elip |
| Điểm vuông góc | Chân đường vuông góc trên đường cong mục tiêu |
| Giao điểm | Điểm giao nhau của hai đường cong |
| Tiếp điểm | Điểm tiếp xúc của đường tròn |
| Trên cạnh | Điểm gần nhất bất kỳ trên cạnh |
| Trên mặt | Vị trí bất kỳ trên bề mặt |
| Dò gióng | Đường căn gióng / kéo dài dẫn ra từ điểm đã bắt, cùng giao điểm của hai đường dò gióng |

- `Dò gióng` có công tắc riêng trên thanh trạng thái, không nằm trong bảng bật/tắt các loại bắt điểm nói trên.
- Bắt điểm có hiệu lực trong mọi thao tác vẽ hình, chọn điểm, kéo điểm phác thảo, chọn qua nút bấm.
- Trong phác thảo còn có cơ chế bắt điểm "từ tính": vẽ đường gần nằm ngang/thẳng đứng sẽ tự động thêm ràng buộc nằm ngang/thẳng đứng; vẽ gần tiếp xúc sẽ tự động thêm ràng buộc tiếp xúc.
- Nếu con trỏ chuột liên tục hút vào các điểm không mong muốn, bạn chỉ cần tạm thời tắt hộp kiểm tương ứng.

## 3.6 Mặt phẳng làm việc

Mặt phẳng làm việc quyết định "vẽ ở đâu" và "điểm rơi trên mặt phẳng nào".

- **Mặt phẳng làm việc động** (mặc định bật, **Cơ bản → Mặt phẳng làm việc → Mặt phẳng làm việc động**): Mỗi lần chọn điểm, hệ thống tự động chọn mặt phẳng thế giới XY/XZ/YZ gần con trỏ nhất, giúp điểm rơi trên mặt phẳng tự nhiên nhất.
- Khi tắt mặt phẳng làm việc động, điểm sẽ rơi trên mặt phẳng làm việc hiện tại của khung nhìn.
- **Đặt mặt phẳng làm việc**: Bật hộp thoại để chọn XOY / YOZ / ZOX.
- **Căn chỉnh theo mặt phẳng**: Chọn một mặt phẳng (mặt phẳng của khối đặc hoặc mặt phẳng chuẩn) để đặt làm mặt phẳng làm việc.
- **Tạo từ mặt cắt**: Chọn một cạnh trước, sau đó chọn một điểm trên cạnh đó, mặt phẳng làm việc sẽ vuông góc với đường cong và đi qua điểm đó.

Khi tạo phác thảo mới, hệ thống cũng yêu cầu bạn chọn mặt phẳng chuẩn: giữa khung nhìn xuất hiện 3 khối vuông bán trong suốt màu đỏ/xanh lá/xanh dương, tương ứng với mặt YZ / ZX / XY; nhấp vào khối vuông nào thì mặt đó sẽ trở thành mặt phẳng phác thảo.

![Chọn mặt phẳng chuẩn phác thảo](images/02-sketch-plane-pick.png)

Trong tab **Tham số**, lệnh **Mặt phẳng chuẩn** (`feature.plane`) sẽ tạo ra một nút mặt phẳng chuẩn có thể tái sử dụng, bao gồm các loại: mặt phẳng lệch (offset), mặt phẳng song song qua điểm, mặt phẳng theo góc nghiêng của đường, mặt phẳng pháp tuyến qua điểm, qua ba điểm, mặt phẳng trung gian, qua điểm trên đường cong. Mặt phẳng chuẩn sẽ xuất hiện trên cây dự án và có thể dùng làm tham chiếu cho mặt phẳng phác thảo, mặt phẳng đối xứng gương, mặt trung hòa góc thoát khuôn...

---

Bước tiếp theo: [Chương 4 Dựng hình trực tiếp](04-direct-modeling.md)
