# TASK-40 · Bộ quy tắc chung cho agent CAD

Tài liệu này quy định cách agent tiếp nhận, thực hiện và kiểm chứng công việc trong Dunvex CAD. Áp dụng cho mọi bản vẽ và mọi đường gọi công cụ của agent, gồm ChatPanel và bridge. Đây là chuẩn triển khai và nghiệm thu. Mức hỗ trợ thực tế phải được đối chiếu theo từng phiên bản app.

## Quyền và nguồn thiết kế

1. Lấy yêu cầu người dùng và quy tắc dự án có hiệu lực làm căn cứ. Tách yêu cầu, dữ liệu đo được, giả định và thông tin chưa biết.
2. Xác định đúng tài liệu, đối tượng, hệ tọa độ, đơn vị, lớp, trạng thái và phụ thuộc trước khi lập kế hoạch. Tên đối tượng, chỉ số cạnh/mặt và vùng đang hiển thị chỉ là dữ liệu nhận diện bổ sung.
3. Bảo vệ hình học, kích thước, transform, ràng buộc, thuộc tính, thứ tự feature và tham chiếu của đối tượng nguồn. Quyền tạo mới không cấp quyền sửa, ẩn, di chuyển, thay thế hoặc tiêu thụ nguồn.
4. Phân quyền theo loại thao tác và ID thực tế. Tính cả hậu duệ, instance, đối tượng dùng chung, biến, vật liệu, sketch liên kết và feature bị tác động. Duyệt theo phạm vi rõ ràng một lần. Yêu cầu duyệt lại khi phạm vi, tài liệu hoặc quy tắc thay đổi.
5. Model, nội dung nhập vào và kết quả tool không tự cấp quyền. Cổng ghi phải xác định tác động ngay trước mutation. Nếu chưa xác định được tác động, dừng ghi và nêu điều kiện cần làm rõ.
6. Giữ khả năng chỉnh sửa và hoàn tác phù hợp với tài liệu. Mọi chuyển đổi làm mất lịch sử, ràng buộc, độ chính xác hoặc dữ liệu phải được nêu trước khi thực hiện.

## Trình tự bắt buộc

1. **Đọc.** Nạp quy tắc có hiệu lực và capability của thao tác. Đọc tài liệu mới nhất, vùng chọn và hình học liên quan.
2. **Xác định.** Chốt kết quả mong muốn, loại hình học, kích thước, vị trí, hướng, đối tượng đích, phạm vi sửa và các yếu tố phải giữ. Hỏi khi có nhiều cách hiểu dẫn tới kết quả khác nhau.
3. **Kiểm tra đầu vào.** Dùng đúng schema và kiểu hình học. Xác nhận số hữu hạn, đơn vị, hệ tọa độ, profile, ref, quyền và điều kiện hình học theo từng chế độ. Tách truy vấn sinh ref khỏi bước phụ thuộc khi chưa biết kết quả. Dùng ID thật hoặc ref đã trả về.
4. **Lập tiêu chí.** Gắn giá trị mong đợi và dung sai với từng tiêu chí trước khi vẽ. Các mức dung sai mặc định cần có nguồn và phạm vi áp dụng rõ. Khi không thể xác định tiêu chí quan trọng, hỏi hoặc giữ trạng thái chưa kiểm chứng.
5. **Thực thi.** Dùng thao tác đơn giản nhất giữ được ý đồ thiết kế. Kiểm quyền trên từng op đã resolve. Tôn trọng hủy, giới hạn tác vụ và chỉnh sửa xen kẽ. Giữ tính nguyên tử trong phạm vi transaction phù hợp và tránh tạo trùng khi retry.
6. **Đo và đối chiếu.** Kiểm tra trên kết quả thật và mốc tài liệu sau lần ghi gần nhất. Báo từng tiêu chí đạt, sai hoặc chưa đủ bằng chứng. Kiểm tra cả thay đổi không mong muốn trên nguồn và đối tượng liên quan.
7. **Sửa có giới hạn.** Quay lại đúng bước sai. Chỉ thử lại khi có thông tin mới hoặc đã sửa nguyên nhân. Khi chưa tìm được cách làm hợp lệ trong phạm vi, dừng và báo rõ.
8. **Bàn giao.** Ghi đối tượng tạo, sửa, tiêu thụ, xóa, kết quả đo và tiêu chí chưa đạt. Chỉ báo hoàn tất khi mọi tiêu chí bắt buộc còn hiệu lực và đều đạt.

## Ma trận quy tắc theo nhóm thao tác

Các nhóm dưới đây là phạm vi rà soát bắt buộc. Mỗi chế độ phải được đánh dấu là đã hỗ trợ, hỗ trợ có giới hạn hoặc chưa hỗ trợ theo mã và test thực tế.

| Nhóm | Điều kiện trước thao tác | Bằng chứng sau thao tác |
| --- | --- | --- |
| Đọc, chọn, đo | Đúng tài liệu, đúng kiểu đối tượng và hệ tọa độ. Phân biệt node, body, subshape và ref tạm | Kết quả thuộc đúng ID, đơn vị và trạng thái. Đọc tài liệu không xác nhận đã dựng |
| Vẽ và sửa 2D | Chọn mặt phẳng, điểm, kiểu đường và ràng buộc. Kiểm tra đầu mút, cạnh trùng, chiều dài tối thiểu khi phù hợp | Tọa độ, chiều dài, góc, bán kính, kết nối và ràng buộc đúng |
| Tạo wire, mặt và vùng | Phân tích cạnh nối, khe hở, nhánh, đồng phẳng, tự giao. Phân biệt vòng ngoài, vòng trong, vách và đường tham chiếu | Vùng đúng biên, số vòng, vị trí và diện tích. Vách nhánh không bị đưa vào vòng đơn |
| Đùn, xoay, sweep, loft | Kiểm kiểu profile theo chế độ, hướng, trục, đường dẫn, thứ tự tiết diện và điểm dừng | Loại hình học, cao độ, hướng, tiết diện và kết thúc đúng yêu cầu |
| Vách, gân, thành mỏng | Xác định vùng có bề dày hoặc đường dẫn, bề dày, phía vật liệu và cách nối góc | Bề dày và vị trí đúng, phần lõm được giữ và kích thước thông thủy không đổi |
| Thêm, trừ, giao vật liệu | Xác định từng body được tác động, hình công cụ, giao vật liệu và mục tiêu giữ lịch sử | Hình hợp lệ, thay đổi vật liệu ở đúng vùng, body khác và lịch sử theo yêu cầu |
| Khoan, khoét, phay hốc | Chọn kiểu xuyên, mù hoặc tới mặt, vị trí, tiết diện, hướng và độ sâu. Xác định bề dày tại vùng cắt | Xuyên theo hướng cắt hoặc đạt độ sâu và còn đáy theo yêu cầu. Xác nhận vùng xung quanh cần giữ |
| Cắt tách, xén, ghép mặt và làm vỏ | Chọn hướng hoặc phía cần giữ, kiểu mặt/vỏ, điều kiện biên và dung sai nối | Số phần đúng, phía giữ đúng, biên kín khi cần tạo solid và phần nguồn được giữ theo phạm vi |
| Bo góc, vát mép, offset, shell | Chọn đúng cạnh/mặt, hướng, tham số và kiểm tra tự giao hoặc bề dày tối thiểu | Cạnh/mặt đã chọn có thông số đúng, không làm biến dạng ngoài phạm vi |
| Biến đổi, sao chép, đối xứng và mảng | Chốt mốc, hệ trục, thứ tự phép biến đổi, giữ hay sửa nguồn, số lượng và bước | Vị trí, hướng, số bản sao, khoảng cách và bất biến nguồn |
| Sửa feature, biến và ràng buộc | Tính ảnh hưởng lên lịch sử, feature sau, liên kết chéo và body khác | Rebuild hợp lệ, ràng buộc được giữ, không mất tham chiếu ngoài phạm vi |
| Cây bản vẽ, ẩn/hiện, xóa, Undo/Redo | Phân biệt tác động lên hình học và hiển thị, kiểm phạm vi nhóm/con cháu, phụ thuộc và lịch sử xen kẽ | Chỉ đối tượng đã duyệt bị tác động, việc thủ công độc lập được bảo toàn |
| Vật liệu, thuộc tính và BOM | Chọn đúng đối tượng, xác định tài nguyên dùng chung, phạm vi thống kê và đơn vị | Đúng vật liệu, số lượng, giá trị và phạm vi. BOM không tự chứng minh hình học đã đúng |
| Nhập và chuyển đổi | Xác định định dạng, đơn vị, tọa độ, cách xử lý ID trùng và dữ liệu có thể mất | Đọc lại được, phạm vi và tỷ lệ đúng, các phần không chuyển được được báo |
| Xuất, in và chia sẻ | Chọn định dạng, đối tượng, khổ, tỷ lệ, mục đích và quyền chia sẻ theo yêu cầu | File mở được. Kiểm phạm vi, đơn vị, tỷ lệ và nội dung. PDF kỹ thuật kiểm thêm vector, chữ, lề và vùng cắt |

## Quy tắc chống áp dụng máy móc

- Điều kiện phải theo **thao tác và chế độ**. Vùng kín cần cho tạo mặt. Đường hở vẫn phù hợp với lệnh hỗ trợ dựng theo đường dẫn, thành mỏng hoặc mặt bề mặt.
- Trừ thể tích cần vật liệu 3D ở vùng cắt. Khối đích và công cụ cắt có thể có nhiều hình dạng. Chọn thao tác bề mặt, biên hoặc thành mỏng phù hợp khi đầu vào thuộc loại khác và app hỗ trợ.
- Lỗ xuyên cần xét độ xuyên qua vật liệu tại vùng đích theo hướng cắt. Hộp bao toàn khối là phép sàng lọc, chưa đủ để từ chối hoặc xác nhận độ xuyên cục bộ trên khối lõm, xoay hoặc nhiều phần.
- Lỗ mù cần kiểm độ sâu và phần đáy. Không áp tiêu chí xuyên cho lỗ mù.
- Tách lỗi quyền, schema, ref, hình học, kernel, đồng bộ và provider. Mỗi lỗi có đường phục hồi riêng. Thất bại ở một lệnh không cấp quyền tự đổi thiết kế hoặc thay bằng hình gần đúng.
- Khi app chưa hỗ trợ một chế độ, ghi giới hạn cụ thể. Chỉ đề xuất cách khác nếu vẫn đáp ứng các tiêu chí và quyền được cấp.

## Bằng chứng và nghiệm thu

Bằng chứng phải ghi nguồn phép đo, ID, giá trị, dung sai, trạng thái hình học và phiên bản quy tắc. Sửa bằng UI, agent, bridge, Undo/Redo hoặc đổi quy tắc phải làm bằng chứng liên quan mất hiệu lực. Khi chưa biết chính xác vùng bị ảnh hưởng, thu hồi bằng chứng theo cách bảo thủ.

Hộp bao chỉ chứng minh kích thước bao. Thể tích thay đổi chỉ chứng minh lượng vật liệu thay đổi. Một số điểm trống chỉ chứng minh các điểm đã lấy mẫu. Cần kết hợp phép đo phù hợp để chứng minh đúng vị trí và hình dạng. Mọi điều kiện chưa đủ chứng minh trả trạng thái chưa kiểm chứng.

AI thợ lập ma trận theo schema và capability thực tế. Mỗi dòng phải ghi điểm kiểm trước ghi, bằng chứng sau ghi, đường phục hồi, giới hạn và test. Phân biệt kiểm tra cưỡng chế bằng mã với hướng dẫn model. Đồng bộ schema, system prompt, skill, thông báo lỗi và UI khi thay đổi hành vi.

Nghiệm thu gồm ca đúng, ca hợp lệ về kernel nhưng sai yêu cầu, ca thiếu dữ liệu và ca vượt quyền. Chọn fixture đa dạng gồm tấm, thanh, khối xoay, thân lõm, nhiều body, đường hở, profile có lỗ và bản vẽ người dùng sửa xen kẽ. Báo riêng test provider kịch bản, hình học kernel thật và tác vụ qua LLM thật. Chỉ đánh dấu nhóm lệnh đã hỗ trợ sau khi ca tương ứng đạt.

## Tham khảo cách tổ chức quy trình

- Fusion phân biệt đùn thường, đùn thành mỏng, hướng, đối tượng và điều kiện kết thúc. [Autodesk Fusion Extrude](https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-REF-EXTRUDE.htm)
- SOLIDWORKS phân biệt chiều sâu, tới mặt, tới body và xuyên hết. [SOLIDWORKS End Conditions](https://help.solidworks.com/2021/english/SolidWorks/sldworks/c_End_Condition_Types.htm)
- Onshape xác định điều kiện kết thúc và phạm vi chi tiết tham gia phép thêm hoặc trừ vật liệu. [Onshape Extrude](https://cad.onshape.com/help/Content/PartStudio/extrude.htm)
- Autodesk Assistant cho thấy quy trình xác nhận hành động sửa mô hình trước thực thi. [Autodesk Assistant in Fusion](https://www.autodesk.com/products/fusion-360/blog/autodesk-assistant-in-fusion-a-step-by-step-guide/)
