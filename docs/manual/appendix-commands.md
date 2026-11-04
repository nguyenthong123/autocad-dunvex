# Phụ lục A Bảng tra cứu lệnh nhanh

Cột "Phím lệnh" là mã định danh nội bộ của lệnh (dùng cho việc điều tra lỗi, phát triển plugin và tham chiếu API của AI); trên giao diện lấy nhãn nút tiếng Việt làm chuẩn. Các lệnh có phím tắt xem tại [Phụ lục B](appendix-shortcuts.md).

> Một số ít lệnh không có nút độc lập trên thanh Ribbon mà có lối vào ở vị trí khác:
>
> - `feature.reselect` nằm trong menu `⋯` của hàng tính năng trong thân tham số;
> - `create.thickSolid` (Làm dày thân đặc), `create.refSegment` (Đoạn thẳng tham chiếu), `feature.sew` (Khâu tham số) đã được đăng ký trong v0.8.0 nhưng chưa có nút trên Ribbon, chỉ có thể gọi qua plugin hoặc script bằng phím lệnh.

## A.1 Thẻ Cơ bản

### Vẽ hình

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Đoạn thẳng | `create.line` | Vẽ đường liên tục; có thể tắt tùy chọn "Nối liền" |
| Hình chữ nhật | `create.rect` | Hai điểm góc đối diện; có thể nhập `rộng,cao` |
| Đường tròn | `create.circle` | Tâm tròn + Bán kính |
| Elip | `create.ellipse` | Tâm + Trục lớn + Trục nhỏ |
| Đa giác đều | `create.regularPolygon` | Tâm + Bán kính; mặc định 6 cạnh |
| Cung tròn | `create.arc` | Tâm + Điểm bắt đầu + Điểm kết thúc |
| Cung tròn 2 điểm | `create.arc2point` | Điểm bắt đầu + Điểm kết thúc + Chiều cao cung |
| Cung tròn 3 điểm | `create.arc3point` | Điểm bắt đầu + Điểm giữa + Điểm kết thúc |
| Cung tiếp tuyến - tiếp tuyến - bán kính | `create.arcTTR` | Hai cạnh + Bán kính |
| Hình hộp | `create.box` | Hai điểm góc đáy + Chiều cao |
| Hình cầu | `create.sphere` | Tâm cầu + Bán kính |
| Hình trụ | `create.cylinder` | Tâm đáy + Bán kính + Chiều cao |
| Hình nón | `create.cone` | Tâm đáy + Bán kính + Chiều cao |
| Hình chóp | `create.pyramid` | Hai điểm góc đáy + Chiều cao |
| Đùn khối | `create.extrude` | Chọn mặt/biên dạng + Khoảng cách |
| Vuốt nối (Loft) | `create.loft` | Nhiều tiết diện; Thân đặc/Mặt kẻ/Độ liên tục |
| Mặt cong Gordon | `create.gordon` | Cạnh biên dạng + Cạnh dẫn hướng |
| Quét (Sweep) | `create.sweep` | Tiết diện + Đường dẫn |
| Xoay (Revolve) | `create.revol` | Tiết diện + Trục xoay + Góc xoay |
| Điểm | `create.point` | Nhấp chuột để đặt điểm |
| Đường gấp khúc (Polyline) | `create.polygon` | Các điểm liên tiếp; có thể khép kín |
| Đường cong Bézier | `create.bezier` | Các điểm điều khiển liên tiếp |
| Đường xoắn ốc | `create.helix` | Tâm + Bán kính + Chiều cao; Bước xoắn |
| Đường ống (Pipe) | `create.pipe` | Đường dẫn gấp khúc + Bán kính |
| Chữ | `create.text` | Font/Chiều cao chữ/Nội dung/Cách đặt + Vị trí + Độ sâu |

### Chỉnh sửa

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Di chuyển | `modify.move` | Điểm cơ sở + Điểm đích; có thể sao chép |
| Xoay | `modify.rotate` | Tâm xoay + Điểm tham chiếu + Điểm góc; có thể sao chép |
| Đối xứng | `modify.mirror` | Hai điểm đường đối xứng; có thể sao chép |
| Mảng | `modify.array` | Mảng thẳng/Xoay vòng/Theo đường cong/Chữ nhật; có thể nhóm |
| Cắt tỉa | `modify.trim` | Nhấp xóa đoạn muốn bỏ; thực hiện liên tục |
| Kéo dài | `modify.extend` | Cạnh mục tiêu + Đường ranh giới |
| Tạo vỏ rỗng (Shell) | `modify.shell` | Khối solid + Các mặt mở nắp + Độ dày |
| Phân tách | `modify.split` | Hình dạng + Công cụ cắt |
| Khâu | `modify.sew` | Khâu mặt/vỏ theo dung sai |
| Đơn giản hóa | `modify.simplifyShape` | Loại bỏ các cạnh/mặt đồng phẳng |
| Bo góc | `modify.fillet` | Cạnh + Bán kính |
| Vát mép | `modify.chamfer` | Cạnh + Chiều dài vát |
| Phân rã | `modify.explode` | Tách thành các hình dạng con trực tiếp |
| Xóa | `modify.deleteNode` | Xóa toàn bộ node |
| Xóa phần tử con | `modify.removeShapes` | Xóa các cạnh/mặt được chọn và tái dựng |
| Xóa tính năng | `modify.removeFeature` | Loại bỏ tính năng tạo ra một mặt nào đó |
| Ngắt | `modify.break` | Cạnh + Điểm ngắt |
| Thùng sơn | `modify.paintBucket` | Đổi vật liệu cho toàn bộ node |
| Thêm cọ vẽ | `modify.brushAdd` | Gán vật liệu riêng cho các mặt được chọn |
| Xóa cọ vẽ | `modify.brushRemove` | Xóa vật liệu riêng của các mặt được chọn |
| Xóa sạch cọ vẽ | `modify.brushClear` | Xóa sạch toàn bộ vật liệu gán theo mặt của node |
| Sửa chữa hình dạng | `modify.repairShape` | Sửa chữa bằng ShapeFix |
| Kiểm tra hình dạng | `modify.checkShape` | Kiểm tra tính hợp lệ từng mặt |

### Chuyển đổi / Boolean / Mặt phẳng làm việc / Công cụ

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Chuyển thành đường gấp khúc | `convert.toWire` | Cạnh/khung dây → Node khung dây |
| Chuyển thành khối compound | `convert.toCompound` | Nhiều hình dạng → Khối compound |
| Chuyển thành mặt | `convert.toFace` | Cạnh/khung dây khép kín → Mặt |
| Chuyển thành vỏ | `convert.toShell` | Khâu các mặt thành vỏ |
| Chuyển thành thân đặc | `convert.toSolid` | Vỏ khép kín → Thân đặc solid |
| Giao nhau | `boolean.common` | Mục tiêu ∩ Công cụ |
| Trừ bớt | `boolean.cut` | Mục tiêu − Công cụ |
| Hợp nhất | `boolean.join` | Mục tiêu ∪ Công cụ |
| Mặt phẳng làm việc động | `workingPlane.toggleDynamic` | Bật/tắt tự động chọn mặt |
| Đặt mặt phẳng làm việc | `workingPlane.set` | XOY / YOZ / ZOX |
| Căn gióng theo mặt phẳng | `workingPlane.alignToPlane` | Chọn mặt phẳng làm mặt phẳng làm việc |
| Tạo từ tiết diện | `workingPlane.fromSection` | Cạnh + Điểm, tạo mặt phẳng làm việc vuông góc |
| Chiếu đường cong | `convert.curveProjection` | Đường cong + Mặt + Phương chiếu |
| Tạo nhóm (Group) | `create.group` | Đưa đối tượng vào định nghĩa cụm chi tiết; sinh node component, không phải thư mục cây |
| Giao tuyến | `create.section` | Tìm giao tuyến giữa hai hình dạng |
| Dời song song (Offset) | `create.offset` | Cạnh/khung dây/mặt + Khoảng cách; Kiểu nối |
| Sao chép hình dạng | `create.copyShape` | Sao chép cạnh/mặt được chọn |

### Đo lường / Chú thích / Khung cảnh / Tệp tin / Khác

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Chiều dài | `measure.length` | Khoảng cách giữa hai điểm |
| Góc | `measure.angle` | Đỉnh + Hai điểm cạnh |
| Chọn (Tổng hợp) | `measure.select` | Tổng hợp chiều dài/diện tích/thể tích |
| Kích thước | `annotate.dimension` | Hai điểm + Vị trí đường kích thước |
| Bán kính | `annotate.radius` | Đường tròn/cung tròn + Vị trí |
| Đường kính | `annotate.diameter` | Đường tròn/cung tròn + Vị trí |
| Góc | `annotate.angle` | Hai cạnh thẳng + Vị trí |
| Chữ | `annotate.text` | Điểm đường dẫn + Vị trí chữ |
| Tạo từ camera | `act.alignCamera` | Lưu góc nhìn hiện tại làm dấu trang khung cảnh |
| Nhập tệp | `file.import` | STEP/IGES/BREP/STL |
| Xuất tệp | `file.export` | STEP/IGES/BREP/STL/PLY/OBJ |
| Nhóm WeChat | `wechat.group` | Mã QR |
| Trợ lý AI | `ai.toggleChat` | Bật/tắt bảng điều khiển bên phải |

## A.2 Thẻ Tham số

### Phác thảo và Tạo hình

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Tạo phác thảo mới | `sketch.create` | Chọn mặt phẳng chuẩn/mặt phẳng trên thân để vào phác thảo |
| Sửa phác thảo | `sketch.enter` | Chọn phác thảo đã có |
| Thoát phác thảo | `sketch.exit` | Kết thúc phiên làm việc phác thảo |
| Mặt phẳng chuẩn | `feature.plane` | 7 cách định nghĩa mặt phẳng chuẩn |
| Hình hộp | `feature.primitiveBox` | Dài/Rộng/Cao; có thể kết hợp Boolean |
| Hình trụ | `feature.primitiveCylinder` | Bán kính/Chiều cao; có thể kết hợp Boolean |
| Hình cầu | `feature.primitiveSphere` | Bán kính; có thể kết hợp Boolean |
| Hình nón | `feature.primitiveCone` | Bán kính đáy/Bán kính đỉnh/Chiều cao; có thể kết hợp Boolean |
| Đùn | `feature.extrude` | Thao tác/4 điều kiện kết thúc/Đối xứng/Độ sâu 2/Lệch bắt đầu-kết thúc/Góc nghiêng; xem [Chương 6](06-parametric-modeling.md) |
| Xoay | `feature.revolve` | Góc/Góc 2/Đối xứng/Thao tác |
| Vuốt nối (Loft) | `feature.loft` | Thân đặc/Mặt kẻ/Độ liên tục/Thao tác |
| Quét (Sweep) | `feature.sweep` | Tiết diện + Nhiều đoạn đường dẫn; Bo góc đường dẫn, 3 kiểu điều khiển biên dạng; xem [Chương 6](06-parametric-modeling.md) |
| Làm dày | `feature.thicken` | Độ dày/Độ dày 2/Đối xứng/Đảo chiều |
| Gân tăng cứng | `feature.rib` | Chuỗi cạnh hở + Độ dày + Kéo dài tới chi tiết |
| Đường xoắn ốc | `feature.helix` | Bán kính/Chiều dài/Bước xoắn |

### Tính năng

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Đẩy-Kéo | `feature.pressPull` | Tùy đối tượng chọn chuyển giao sang Đùn/Dời mặt/Sửa bo góc/Sửa vát mép |
| Bo góc | `feature.fillet` | Cạnh + Bán kính (hỗ trợ bán kính đầu cuối khác nhau) |
| Vát mép | `feature.chamfer` | Khoảng cách bằng nhau/Hai khoảng cách/Khoảng cách và góc |
| Sửa bo góc | `feature.modifyFillet` | Chọn mặt bo góc để sửa bán kính |
| Sửa vát mép | `feature.modifyChamfer` | Chọn mặt vát mép để sửa khoảng cách |
| Rút góc nghiêng | `feature.draft` | Mặt trung hòa + Mặt nghiêng + Góc |
| Tạo vỏ rỗng (Shell) | `feature.shell` | Mặt mở nắp + Độ dày/Hướng ra ngoài |
| Dời mặt song song | `feature.offsetFace` | Mặt + Khoảng cách; Giữ bán kính bo góc |
| Phân tách | `feature.split` | Công cụ + Phía giữ lại |
| Tạo lỗ | `feature.hole` | Đơn giản/Lỗ bậc/Lỗ côn, tâm lỗ từ điểm phác thảo, xuyên thủng/lỗ bịt, preset dòng M; xem [Chương 6](06-parametric-modeling.md) |
| Xóa tính năng | `feature.removeFeature` | Chọn mặt tính năng để loại bỏ |
| Mảng thẳng | `feature.patternLinear` | Hướng/Khoảng cách/Số lượng/Hướng thứ hai |
| Mảng xoay vòng | `feature.patternCircular` | Trục/Góc/Số lượng/Phân bố đều |
| Mảng theo đường cong | `feature.patternCurve` | Đường dẫn/Khoảng cách/Định hướng |
| Đối xứng | `feature.mirror` | Mặt phẳng đối xứng + Hợp nhất |
| Hợp nhất | `feature.fuse` | Boolean hợp |
| Trừ bớt | `feature.cut` | Boolean hiệu |
| Giao nhau | `feature.common` | Boolean giao |
| Chọn lại | `feature.reselect` | Chọn lại các tham chiếu bị mất hiệu lực; phạm vi hỗ trợ tùy tính năng |

### Thao tác trên node và lệnh khác

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Di chuyển | `modify.move` | Thực hiện biến đổi tổng thể trên thân |
| Xoay | `modify.rotate` | Tương tự như trên |
| Đối xứng | `modify.mirror` | Tương tự như trên |
| Mảng | `modify.array` | Tương tự như trên; số lượng thường đã bao gồm đối tượng nguồn |
| Tách độc lập | `modify.detach` | Thực thể (instance) → Bản sao độc lập |
| Xóa | `modify.deleteNode` | Xóa thân |
| Thùng sơn | `modify.paintBucket` | Đổi vật liệu cho toàn bộ thân |
| Biến số | `feature.variable` | Thêm mới ở hàng trống dưới đáy; Biểu thức chiều dài/góc/không thứ nguyên |
| Chú thích | `annotate.*` | Giống như trong thẻ Cơ bản |
| Nhập/Xuất | `file.*` | Giống như trong thẻ Cơ bản |
| Trợ lý AI | `ai.toggleChat` | Bật/tắt bảng điều khiển |

## A.3 Thẻ Phác thảo

### Vẽ hình

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Đoạn thẳng | `sketch.line` | Chuỗi liên tục; tự động thêm ràng buộc Nằm ngang/Thẳng đứng |
| Đường tròn | `sketch.circle` | Tâm tròn + Bán kính |
| Elip | `sketch.ellipse` | Tâm + Trục lớn + Trục nhỏ |
| Cung tròn | `sketch.arc` | Tâm + Điểm bắt đầu + Điểm kết thúc (ngược chiều kim đồng hồ) |
| Cung elip | `sketch.ellipseArc` | Elip + Điểm bắt đầu + Điểm kết thúc |
| Hình chữ nhật | `sketch.rectangle` | Hai điểm góc đối diện; tự động gán ràng buộc |
| Đa giác | `sketch.polygon` | Số cạnh + Nội tiếp/Ngoại tiếp |
| Đường cong Spline | `sketch.nurbs` | Spline qua các điểm điều khiển |
| Đường cong Bézier | `sketch.bezier` | Bézier bậc 3 qua bốn điểm |
| Đường conic | `sketch.conic` | Điểm bắt đầu/kết thúc/điểm điều khiển/điểm vai (rho) |
| Điểm | `sketch.point` | Đặt điểm |
| Chữ | `sketch.text` | Nội dung/Chiều cao chữ/Font + Vị trí + Điểm đỉnh |

### Ràng buộc / Kích thước

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Trùng khớp | `constraint.coincident` | Hai điểm trùng khít nhau |
| Cố định | `constraint.fix` | Khóa cố định hình học |
| Nằm ngang | `constraint.horizontal` | Đường thẳng nằm ngang |
| Thẳng đứng | `constraint.vertical` | Đường thẳng thẳng đứng |
| Song song | `constraint.parallel` | Hai đường thẳng song song |
| Vuông góc | `constraint.perpendicular` | Hai đường thẳng vuông góc |
| Bằng nhau | `constraint.equal` | Bằng chiều dài / Bằng bán kính |
| Tiếp tuyến | `constraint.tangent` | Hai đường cong tiếp tuyến |
| Đối xứng | `constraint.symmetric` | Đối xứng qua một trục |
| Trung điểm | `constraint.midpoint` | Điểm nằm ở trung điểm của đường |
| Điểm trên đường | `constraint.pointOn` | Điểm nằm trên đường cong |
| Căn ngang | `constraint.horizontalAlign` | Cùng tung độ y |
| Căn dọc | `constraint.verticalAlign` | Cùng hoành độ x |
| Chuyển Driving / Driven | `constraint.toggleDriven` | Chuyển đổi kiểu kích thước chính/bị động |
| Kích thước | `dimension` | Kích thước thông minh |
| Khoảng cách | `dimension.distance` | Khoảng cách giữa hai điểm / hai đường thẳng |
| Bán kính | `dimension.radius` | Bán kính |
| Góc | `dimension.angle` | Góc giữa hai đường thẳng |
| Khoảng cách điểm-đường | `dimension.pointLineDistance` | Khoảng cách từ điểm đến đường |
| Khoảng cách ngang | `dimension.horizontalDistance` | Khoảng cách hình chiếu nằm ngang |
| Khoảng cách dọc | `dimension.verticalDistance` | Khoảng cách hình chiếu thẳng đứng |

### Chỉnh sửa / Khác

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Bo góc | `sketch.fillet` | Hai đối tượng + Bán kính |
| Vát mép | `sketch.chamfer` | Hai đối tượng + Chiều dài |
| Dời song song (Offset) | `sketch.offset` | Đối tượng + Khoảng cách; có huy hiệu sửa nhanh |
| Cắt tỉa | `sketch.trim` | Nhấp xóa đoạn muốn bỏ |
| Kéo dài | `sketch.extend` | Đối tượng + Đường ranh giới |
| Ngắt | `sketch.break` | Đối tượng + Điểm ngắt; đường cong kín cần 2 điểm |
| Đối xứng | `sketch.mirror` | Đối tượng + Đường đối xứng |
| Biến đổi | `sketch.transform` | Kéo tay cầm; nhấn Enter để xác nhận |
| Mảng | `sketch.array` | Thẳng/Xoay vòng/Theo đường cong; huy hiệu/Hủy mảng |
| Danh sách ràng buộc | `sketch.constraints` | Bảng điều khiển nổi |
| Chiếu cạnh | `sketch.projectEdges` | Chiếu các cạnh đồng phẳng |
| Chuyển tham chiếu ngoài | `sketch.toggleExternal` | Tham chiếu ↔ Biên dạng |
| Chuyển đường dựng hình | `sketch.toggleConstruction` | Đường nét liền thông thường ↔ Đường dựng hình |
| Thoát phác thảo | `sketch.exit` | Kết thúc phiên làm việc phác thảo |

## A.4 Tài liệu và Hệ thống

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Tạo tài liệu mới | `doc.new` | Tài liệu mới (dấu `+` trên thanh tiêu đề) |
| Mở tài liệu | `doc.open` | Đọc tệp `.cd` |
| Lưu tài liệu | `doc.save` | Lưu vào IndexedDB |
| Lưu thành tệp | `doc.saveToFile` | Tải về tệp `.cd` |
| Hoàn tác | `edit.undo` | Ctrl+Z |
| Làm lại | `edit.redo` | Ctrl+Y / Ctrl+Shift+Z |
| Thư mục | `create.folder` | Tạo thư mục trong cây dự án |
| Lặp lại lệnh trước | `special.last` | Space / Enter |
| Kiểm thử hiệu năng | `test.performance` | Bài kiểm thử benchmark 8000 hình hộp |

### Các lệnh đã đăng ký nhưng chưa có nút trên Ribbon

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Làm dày thân đặc | `create.thickSolid` | Làm dày mặt/vỏ thành khối đặc |
| Đoạn thẳng tham chiếu | `create.refSegment` | Đoạn thẳng nét đứt tham chiếu giữa hai điểm (chú thích) |
| Khâu tham số | `feature.sew` | Khâu các mặt/vỏ của thân tham số theo dung sai |
| Chọn lại | `feature.reselect` | Truy cập từ menu hàng tính năng |

## A.5 Thẻ Chỉnh sửa Pro

Chỉ có trên **Chili3D Pro**. Chỉ hiển thị thẻ ngữ cảnh này sau khi nhấp đúp vào mô hình để vào chế độ chỉnh sửa trực tiếp; các lệnh chỉ xử lý node có thể chỉnh sửa hiện tại. Các bước thao tác và ảnh hưởng chuyển đổi xem tại [Chương 13](13-pro-direct-editing.md).

### Phân tách

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Đoạn thẳng | `edit.lineSplit` | Điểm bắt đầu + Điểm kết thúc; vẽ liên tục và phân tách |
| Cung tròn | `edit.arcSplit` | Tâm tròn + Điểm bắt đầu + Điểm góc |
| Cung tròn 2 điểm | `edit.arc2PointSplit` | Điểm bắt đầu + Điểm kết thúc + Điểm chiều cao cung |
| Cung tròn 3 điểm | `edit.arc3PointSplit` | Điểm bắt đầu + Điểm trên cung + Điểm kết thúc |
| Cung tiếp tuyến - tiếp tuyến - bán kính | `edit.arcTTRSplit` | Hai cạnh + Bán kính |
| Đường tròn | `edit.circleSplit` | Tâm tròn + Điểm bán kính |
| Elip | `edit.ellipseSplit` | Tâm + Điểm mút trục lớn + Điểm mút trục nhỏ |
| Hình chữ nhật | `edit.rectSplit` | Hai điểm góc đối diện; có thể đặt hình chữ nhật tâm |
| Đa giác | `edit.polygonSplit` | Tâm + Điểm bán kính + Số cạnh |
| Dời song song (Offset) | `edit.offsetSplit` | Vòng ngoài của mặt + Khoảng cách offset; có thể đặt kiểu nối |

Ngoại trừ lệnh `Dời song song (Offset)`, tùy chọn `Đường hỗ trợ` trong các lệnh vẽ trên sẽ lưu kết quả dưới dạng cạnh tham chiếu nét đứt không cắt gọt thân đặc.

### Sửa đổi

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Di chuyển | `edit.move` | Các mặt hoặc cạnh cùng loại + Điểm cơ sở + Điểm đích; tái dựng lại các mặt lân cận |
| Sao chép | `edit.copySplit` | Chọn cạnh + Hai điểm; sao chép đường phân tách, giữ nguyên cạnh gốc |
| Xoay | `edit.rotateSplit` | Chọn cạnh + Tâm xoay + Điểm tham chiếu + Điểm góc |
| Đối xứng | `edit.mirrorSplit` | Chọn cạnh + Hai điểm trên đường đối xứng |
| Mảng | `edit.arraySplit` | Chọn cạnh và sao chép đường phân tách theo mảng; mảng chữ nhật chỉ có X/Y |

### Công cụ và Quản lý

| Lệnh | Phím lệnh | Giải thích |
| --- | --- | --- |
| Đẩy-Kéo | `edit.pushpull` | Mặt phẳng + Điểm đích trên pháp tuyến; Alt chuyển đổi chế độ mặt mới |
| Dời mặt song song | `edit.offsetFace` | Một hoặc nhiều mặt + Khoảng cách có dấu; có thể giữ bán kính bo góc |
| Đơn giản hóa | `edit.simplify` | Dọn dẹp các mặt nhỏ và hình học đồng phẳng/cùng đường thẳng có thể đơn giản hóa |
| Sửa chữa | `edit.fix` | Khâu, sửa chữa hình dạng và dọn dẹp mặt nhỏ |
| Bo góc | `edit.fillet` | Cạnh của node hiện tại + Bán kính |
| Vát mép | `edit.chamfer` | Cạnh của node hiện tại + Chiều dài |
| Xóa tính năng | `edit.removeFeature` | Chọn mặt tính năng cục bộ và cố gắng hàn lành các mặt lân cận |
| Cài đặt chỉnh sửa | `edit.settings` | Chế độ cách ly, Kéo chỉnh sửa bo góc |
| Thoát | `edit.exit` | Thoát chỉnh sửa trực tiếp, không hoàn tác cũng không tự động lưu |

---

Quay lại [Mục lục sổ tay](README.md) · Tra cứu [Phụ lục B Phím tắt](appendix-shortcuts.md) · [Phụ lục C Bảng thuật ngữ](appendix-glossary.md)
