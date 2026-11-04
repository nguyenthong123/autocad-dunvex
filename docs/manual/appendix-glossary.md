# Phụ lục C Bảng thuật ngữ

Bảng thuật ngữ này giải thích các khái niệm CAD xuất hiện lặp đi lặp lại trong cuốn sổ tay. Đây không phải là định nghĩa toán học thuần túy khắt khe, mà nhằm giúp bạn phán đoán "nên chọn đối tượng nào, lệnh sẽ thay đổi những gì".

## C.1 Tài liệu và đối tượng

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Tài liệu (Document) | Môi trường tệp Chili3D có thể lưu độc lập, chứa dữ liệu về cây dự án, hình học, biến số, khung cảnh, hội thoại AI... Mỗi tài liệu đang mở có vùng chọn và ngăn xếp hoàn tác (undo stack) riêng biệt. Xem [Chương 8](08-document-files.md). |
| Nút (Node) | Một đối tượng trong cây dự án, ví dụ như khối hộp, phác thảo, thân tham số, thư mục hoặc kích thước ghi chú. Xóa một nút hoàn toàn khác với việc xóa một cạnh nào đó trên nút. |
| Thân tham số (Parametric Body) | Vật chứa khối rắn (solid) được điều khiển bởi danh sách tính năng (feature list) có thứ tự. Khi sửa đổi tính năng phía trước (upstream), thân tham số sẽ tự động tính toán lại theo danh sách. Đây không đơn thuần chỉ là "một nút hình dạng". |
| Tính năng (Feature) | Một bước thao tác thiết kế trong thân tham số, ví dụ như đùn khối, tạo lỗ hoặc bo góc. Tính năng có thể chỉnh sửa, sắp xếp lại thứ tự, ẩn/nén (suppress), xóa và có thể tham chiếu đến hình học khác. |
| Nút dựng hình trực tiếp | Nút lưu trữ kết quả hình học hiện tại, không giữ lại toàn bộ lịch sử thiết kế. Một số nút có hiển thị thuộc tính kích thước; nếu bảng thuộc tính không liệt kê các tham số của lệnh gốc, bạn sẽ không thể tiếp tục chỉnh sửa các tham số đó trong bảng thuộc tính. |
| Thư mục (Folder) | Chỉ dùng để sắp xếp phân cấp trên cây dự án, không làm thay đổi hình học. Có thể tạo thông qua thanh công cụ của cây dự án, và không phải cùng một loại đối tượng với lệnh `Tạo nhóm`. |
| Cụm chi tiết (Tạo nhóm) | Đưa các đối tượng được chọn vào định nghĩa cụm chi tiết và có thể tạo ra các nút cụm chi tiết. Cụm chi tiết sử dụng lưới hợp nhất được cố định tại thời điểm tạo, không phải là thư mục cây thông thường, cũng không phải là phép hợp Boolean; nó thuộc cơ chế khác so với thực thể hình dạng (shape instance). |

## C.2 Hình học và tô pô

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Đỉnh (Vertex) | Phần tử tô pô dạng điểm trong hình học, thường là điểm mút của cạnh, cũng có thể dùng làm đích dừng cho thao tác đùn khối. |
| Cạnh (Edge) | Đoạn đường cong có giới hạn, ví dụ như cạnh thẳng, cạnh tròn hoặc cạnh cung tròn. Các lệnh như bo góc (fillet), vát mép (chamfer) thường yêu cầu chọn cạnh. |
| Đường bao dây (Wire) | Tập hợp các cạnh được nối liên tiếp theo thứ tự, có thể hở hoặc khép kín. Đường bao dây khép kín có thể tạo thành mặt hoặc dùng làm đường dẫn quét (sweep path). |
| Mặt (Face) | Bề mặt có ranh giới, ví dụ như mặt phẳng, mặt trụ hoặc mặt cong B-spline. Mặt không nhất thiết phải thuộc về một khối rắn (solid). |
| Vỏ (Shell) | Tập hợp các mặt nối liền nhau. Vỏ khép kín (closed shell) có thể chuyển đổi thành khối rắn (solid), còn vỏ hở (open shell) thường không có thể tích. |
| Khối rắn (Solid) | Hình học không gian ba chiều chính xác có ranh giới khép kín, có thể tính toán thể tích, phù hợp cho hầu hết các thao tác Boolean và dựng hình cơ khí. |
| Khối phức hợp (Compound) | Đặt nhiều hình dạng vào cùng một vật chứa tô pô mà không tự động hợp nhất chúng. Lệnh `Chuyển thành khối phức hợp` cho kết quả khác với `Hợp nhất Boolean`. |
| Biên dạng (Profile) | Mặt cắt đầu vào dùng cho các thao tác đùn, xoay, loft... Vòng ngoài khép kín tạo thành diện tích đặc, vòng trong thường tạo thành lỗ rỗng; đường dựng và điểm độc lập không tham gia vào biên dạng khối đặc. |
| B-rep | Biểu diễn ranh giới (Boundary Representation), sử dụng đường cong, mặt cong và tô pô chính xác để mô tả hình học CAD. Định dạng STEP, IGES, BREP thường được dùng để trao đổi dữ liệu loại này. |
| Lưới tam giác (Mesh) | Xấp xỉ bề mặt bằng một lượng lớn tam giác, thường dùng để hiển thị, in 3D hoặc trao đổi mô hình kết xuất. Tệp STL sau khi nhập vào sẽ không khôi phục lại các mặt cong CAD trơn láng ban đầu. |

## C.3 Phác thảo và tham số

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Phác thảo (Sketch) | Hình học 2D nằm trên một mặt phẳng cùng với các ràng buộc, kích thước và tham chiếu, có thể dùng làm đầu vào cho các tính năng tham số. |
| Đường dựng (Construction line) | Hình học tham chiếu trong phác thảo, hiển thị dưới dạng nét đứt, có thể tham gia vào bắt điểm và ràng buộc nhưng không tham gia vào biên dạng khối đặc của đùn khối. |
| Tham chiếu ngoài / Cạnh chiếu | Tham chiếu được thiết lập từ hình học bên ngoài phác thảo. Dùng để định vị và ràng buộc; khi hình học nguồn thay đổi hoặc mất đi, cần kiểm tra lại trạng thái tham chiếu. |
| Ràng buộc hình học | Quy định các mối quan hệ như trùng khớp (coincident), nằm ngang (horizontal), tiếp xúc (tangent), song song (parallel)... mà không nhất thiết phải chứa giá trị số. |
| Kích thước chủ động (Driving dimension) | Kích thước mà giá trị số của nó sẽ thúc đẩy hình học biến đổi, ví dụ sửa chiều rộng từ 80 thành 100. |
| Kích thước bị động (Driven dimension) | Kích thước chỉ đọc giá trị từ hình học hiện tại mà không điều khiển ngược lại hình học. Kích thước dư thừa có thể tự động chuyển thành kích thước bị động (kích thước tham khảo). |
| Bậc tự do (DOF) | Mức độ mà phác thảo vẫn có thể thay đổi độc lập. Khi bậc tự do bằng 0 và không có xung đột, phác thảo được ràng buộc đầy đủ (fully constrained). |
| Biến số (Variable) | Giá trị được đặt tên ở cấp tài liệu, có thể điều khiển tham số tính năng và kích thước phác thảo. Loại biến được phân biệt thành chiều dài, góc và không thứ nguyên (vô hướng). |
| Biểu thức (Expression) | Cách viết tham số bao gồm các con số, biến số, toán tử và hàm số, ví dụ `plateWidth - holeInset`. Thứ nguyên/đơn vị phải tương thích với yêu cầu của tham số. |

## C.4 Tái tạo và tham chiếu tham số

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Tái tạo (Rebuild) | Thực thi lại danh sách tính năng theo các tham số và tham chiếu hiện tại, hoặc tính toán lại một nút dựng hình trực tiếp nào đó. Nhìn thấy hình dạng cũ không có nghĩa là lần tái tạo này đã thành công. |
| Tham chiếu theo dõi (Tracked reference) | Định danh ổn định được các tính năng phía sau (downstream) lưu lại đối với mặt, cạnh, đỉnh hoặc biên dạng phác thảo, dùng để tìm lại hình học tương ứng sau khi tính năng phía trước (upstream) thay đổi. Đây không phải là một số thứ tự cố định luôn luôn tin cậy. |
| Chọn lại (Reselect) | Thao tác chọn lại các đầu vào cần thiết cho tính năng khi tham chiếu không thể tự động khôi phục. Các tính năng khác nhau hỗ trợ chọn lại tham chiếu khác nhau, không phải mọi trường hợp mất tham chiếu đều sửa được bằng thao tác này. |
| Ẩn/Nén tính năng (Suppress) | Tạm thời bỏ qua một tính năng nhưng vẫn giữ lại vị trí của nó trong danh sách tính năng. Sau khi hủy nén (unsuppress), tính năng sẽ lại tham gia vào quá trình tái tạo. |
| Nén theo biến số | Giá trị của biến số quyết định việc có bỏ qua tính năng hay không. Khi biến số tham chiếu bị lỗi phân giải, hệ thống sẽ không đơn giản coi nó là 0, mà cần xem cảnh báo trước. |
| Thanh cuộn lui (Rollback bar) | Điều khiển thân tham số tạm thời chỉ tái tạo đến một vị trí nhất định trong danh sách tính năng, dùng để kiểm tra trạng thái trung gian và xác định lỗi. |
| Phía trước / Phía sau (Upstream / Downstream) | Các thao tác nằm ở vị trí sớm hơn / muộn hơn trong danh sách tính năng. Việc sửa đổi tính năng phía trước sẽ buộc các tính năng phía sau phải tính toán lại và có thể làm thay đổi hình học mà phía sau đang tham chiếu. |

## C.5 Chọn đối tượng, sao chép và đối tượng thao tác

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Hình con (Sub-shape) | Các cạnh, mặt, đỉnh... bên trong một nút. Chọn toàn bộ nút và chọn hình con sẽ sử dụng các lệnh và mang lại kết quả khác nhau. |
| Đối tượng đích (Target) | Đối tượng chủ thể được giữ lại và sửa đổi trong các thao tác như Boolean. Kết quả của dựng hình trực tiếp có thể thay thế nút đích ban đầu. |
| Công cụ (Tool / Cutter) | Hình dạng khác dùng để cắt, hợp nhất, phân tách... trong các thao tác. Việc có giữ lại công cụ hay không tùy thuộc vào từng lệnh và quy trình dựng hình. |
| Thực thể (Instance) | Bản sao liên kết dùng chung hình học với đối tượng nguồn. Sửa đổi nguồn sẽ ảnh hưởng đến thực thể; khi cần chỉnh sửa riêng biệt thì dùng lệnh `Tách rời` (`modify.detach` / Tách độc lập). |
| Bản sao độc lập | Bản sao đã tách khỏi mối quan hệ dùng chung với đối tượng nguồn, sau đó có thể chỉnh sửa độc lập. |
| Mặt phẳng làm việc (Workplane) | Mặt phẳng làm chuẩn cho việc chọn điểm và vẽ 2D. Mặt phẳng làm việc động sẽ tự động chọn mặt phẳng dựa trên vị trí con trỏ chuột. |
| Bắt điểm (Snap) | Hút điểm nhập liệu vào các vị trí hình học đã biết như điểm mút, trung điểm, tâm tròn, giao điểm, cạnh hoặc mặt. |
| Dò gióng (Tracking) | Thiết lập đường gióng căn chỉnh hoặc đường kéo dài từ điểm đã bắt được, giúp tìm điểm căn gióng và giao điểm đường gióng. |

## C.6 Pro Chỉnh sửa trực tiếp

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Chỉnh sửa trực tiếp (Direct editing) | Quy trình làm việc trong bản Pro cho phép nhấp đúp vào mô hình để sửa đổi B-rep hiện tại, có thể thao tác trực tiếp với các cạnh, mặt và đường phân tách mà không phụ thuộc vào cây tính năng tham số gốc. Xem [Chương 13](13-pro-direct-editing.md). |
| Nút có thể chỉnh sửa (Editable node) | Nút lưu trữ hình học hiện tại và cho phép vào chế độ Pro chỉnh sửa trực tiếp. Nút tham số sau khi chuyển đổi thành loại nút này sẽ bị mất danh sách tính năng ban đầu. |
| Khung bao chỉnh sửa (Editing boundary) | Khung hộp nét đứt màu xanh lơ biểu thị phạm vi của nút hiện tại trong chế độ chỉnh sửa, đây không phải là hình học khối rắn mới. |
| Đường hỗ trợ (Guide line - Pro) | Cạnh tham chiếu nét đứt được vẽ trong chế độ chỉnh sửa, có thể bắt điểm, chọn và được lưu cùng tài liệu, nhưng không làm phân tách khối đặc và chỉ hiển thị khi đang chỉnh sửa nút đó. |
| Chế độ cô lập (Isolate mode) | Phương thức hiển thị các đối tượng khác khi đang chỉnh sửa nút hiện tại: `Khóa` giữ hiển thị nhưng khóa chọn, `Ẩn` chỉ hiển thị nút hiện tại. |
| Offset mặt / Đẩy-kéo | Offset mặt làm cho mặt được chọn và các hình học liền kề di chuyển theo hướng pháp tuyến, đồng thời có thể xử lý cả mặt cong; đẩy-kéo chủ yếu dùng để kéo dài hoặc làm lõm cục bộ một mặt phẳng. Khi kéo rê mặt phẳng, Pro sẽ tự động lựa chọn giữa hai phương thức này tùy theo tình huống hình học. |

---

Quay lại [Mục lục sổ tay](README.md) · Tiếp tục xem [Phụ lục A Bảng tra nhanh lệnh](appendix-commands.md)
