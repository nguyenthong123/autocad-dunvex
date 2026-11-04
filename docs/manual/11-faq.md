# 11. Các câu hỏi thường gặp (FAQ)

## 11.1 Khung nhìn và lựa chọn

### Mô hình không nhìn thấy được, hoặc nhỏ như một dấu chấm

Nhấp vào biểu tượng "Khớp nội dung (Fit content)" ở bên phải khung nhìn, hoặc **nhấp đúp chuột giữa (MMB)**. Khi tạo tài liệu mới còn trống, camera thường ở rất xa, đặc biệt là khi lần đầu tiên vẽ ra một mô hình có kích thước nhỏ. Nếu sau khi khớp nội dung mà vật thể chính vẫn nhỏ bất thường, hãy kiểm tra xem có node nào nằm rất xa vật thể chính hay không, hoặc chỉ chọn đối tượng mục tiêu rồi khớp nội dung lại; chi tiết xem tại [Mục 3.2](03-view-navigation-selection.md#32-投影与显示).

### Bảng lệnh biến mất, hoặc nhấp vào đâu cũng không có phản hồi

- Có thể đang có một hộp thoại phương thức (modal dialog) đang chờ bạn trả lời (nhập/xuất, đổi tên, nhập giá trị số). Hãy trả lời hoặc hủy hộp thoại đó trước.
- Nhấn phím `Esc` để hủy lệnh hiện tại.
- Nếu các tay cầm kéo rê vẫn "dính" vào chuột, hãy nhả nút chuột ra rồi thử lại.

Cách hiển thị bình thường của bảng lệnh xem tại [Mục 2.7](02-interface.md#27-命令面板).

### Thông báo lỗi lướt qua quá nhanh, xem lại nội dung đầy đủ ở đâu

Nhấp vào mục `Lỗi: n` ở bên phải thanh trạng thái để mở "Bản ghi lỗi". Hộp thoại sẽ liệt kê các lỗi gần đây theo thứ tự thời gian đảo ngược, lưu tối đa 100 bản ghi kèm theo toàn văn thông báo lỗi; bạn có thể sao chép nội dung này khi cần thử lại hoặc báo cáo sự cố. Nút `Xóa sạch lỗi` chỉ xóa nhật ký log, không hoàn tác thao tác gây ra lỗi và không sửa chữa hình học.

### Nhấp chuột phải không hiện menu ngữ cảnh

Chili3D không có menu chuột phải. Các thao tác xóa, đổi tên, chỉnh sửa đều nằm trên thanh Ribbon, bảng thuộc tính và cây dự án; trong phác thảo, chuột phải dùng để hủy thao tác chọn điểm hiện tại. Các thao tác khung nhìn và lựa chọn xem tại [Chương 3](03-view-navigation-selection.md).

## 11.2 Phác thảo (Sketch)

### Sửa phác thảo xong nhưng thân đặc không thay đổi

- Xác nhận bạn đã **thoát phác thảo** (các sửa đổi trong phiên làm việc phác thảo chỉ được xác nhận/giải khi thoát ra), xem tại [Mục 7.9](07-sketch.md#79-草图的退出与清理).
- Nếu hàng tính năng hiển thị lỗi, thân đặc sẽ giữ lại hình dạng của lần tái dựng thành công gần nhất; hãy sửa lỗi trước.
- Kiểm tra xem phác thảo đó có thực sự được tính năng nào sử dụng hay không.

### Trong phác thảo không thể xoay góc nhìn

Phiên làm việc phác thảo sẽ khóa góc nhìn vuông góc chính diện với mặt phẳng phác thảo và vô hiệu hóa tính năng xoay camera, đây là hành vi có chủ đích theo thiết kế. Nhấp `Thoát phác thảo` là có thể xoay tự do, xem tại [Mục 7.1](07-sketch.md#71-新建与编辑草图).

### Xung đột ràng buộc / Ràng buộc dư thừa

Mở **Danh sách ràng buộc**, rê chuột qua từng hàng để định vị; dùng công cụ **Tìm thủ phạm** để thử định vị các ràng buộc xung đột. Ưu tiên hoàn tác hoặc xóa bỏ các ràng buộc trùng lặp vừa mới thêm hoặc tự động sinh ra; chỉ khi chẩn đoán yêu cầu rõ ràng mới xóa theo nhóm như gợi ý. Trường hợp sụp đổ hình học thì cần sửa lại kích thước gây sụp đổ, xem chi tiết tại [Mục 7.4](07-sketch.md#74-约束).

## 11.3 Tham số và dựng hình

### Sửa một tính năng thì các tính năng hạ nguồn báo lỗi

Thường là do thay đổi ở thượng nguồn đã xóa mất hoặc gộp các mặt/cạnh mà hạ nguồn đang tham chiếu. Mở rộng hàng tính năng báo lỗi, nếu tham chiếu đó hỗ trợ chọn lại thì dùng `⋯ → Chọn lại` để chọn lại đối tượng; hoặc điều chỉnh tham số thượng nguồn để cấu trúc liên kết giữ ổn định. Quy tắc tái dựng và tham chiếu xem tại [Mục 6.1](06-parametric-modeling.md#61-参数化体和特征链).

### Sau khi tính năng báo lỗi, tại sao hình dạng cũ vẫn hiển thị

Đây là hành vi bảo vệ: khi tái dựng thất bại, hệ thống sẽ giữ lại hình dạng của **lần tái dựng thành công toàn bộ chuỗi tính năng gần nhất**, và hàng bị lỗi sẽ hiển thị thông báo lỗi. Hình dạng cũ vẫn nằm trong khung nhìn không có nghĩa là lần sửa này thành công, và cũng không nên dùng nó để xuất tệp mới. Hãy sửa tham số hoặc tham chiếu trước; sau khi xác nhận tính năng thực sự không còn cần thiết nữa thì mới cân nhắc ẩn hoặc xóa. Xem chi tiết tại [Mục 6.1](06-parametric-modeling.md#61-参数化体和特征链).

### Đặt tên biến số bằng tiếng Việt có dấu/tiếng Trung bị báo đỏ "Invalid variable name"

Tên biến số bắt buộc phải là mã định danh ASCII: `[A-Za-z_][A-Za-z0-9_]*`. Chữ có dấu, khoảng trắng, dấu gạch nối đều không được phép, và cũng không được trùng tên với hằng số `pi`, `e`. Quy tắc đầy đủ xem tại [Mục 6.6](06-parametric-modeling.md#66-文档变量).

### Một biến số bị lỗi, tại sao các biến số hạ nguồn, phác thảo và tính năng cũng báo lỗi theo

Biến số được tính toán tuần tự theo thứ tự trong bảng, hàng phân giải thất bại sẽ không cung cấp giá trị cho các hàng phía sau tham chiếu. Vì vậy các biến hạ nguồn, kích thước phác thảo hoặc tham số tính năng tham chiếu đến nó cũng sẽ xuất hiện lỗi phân giải hoặc tái dựng, trong khi các biến độc lập khác vẫn tính toán bình thường. Hãy sửa lỗi đầu tiên ở phía trên cùng trước, rồi kiểm tra lại các lỗi hạ nguồn còn lại; việc tái dựng thất bại sau khi cập nhật biến số cũng sẽ giữ lại hình dạng cũ. Xem [Mục 6.6](06-parametric-modeling.md#66-文档变量).

### Sau phép toán Boolean các chi tiết ban đầu bị biến mất

Phép toán Boolean trong dựng hình trực tiếp mặc định sẽ dùng node kết quả để **thay thế** cả mục tiêu lẫn công cụ. Nếu muốn giữ lại công cụ, trên bảng lệnh hãy tích chọn "Giữ lại đối tượng thao tác". Còn phép toán Boolean tham số sẽ ẩn công cụ đi và gắn dưới danh sách tính năng của thân, không xóa bỏ. Thứ tự thao tác trong dựng hình trực tiếp xem tại [Mục 4.3](04-direct-modeling.md#43-布尔运算组).

### Lệnh Di chuyển/Xoay báo "Node này là hình học đầu vào, không thể di chuyển"

Các hình học tham chiếu như phác thảo, mặt phẳng chuẩn được định nghĩa trong hệ tọa độ thế giới, không thể di chuyển như một thân đặc. Hãy di chuyển thân tham số đang sử dụng chúng, hoặc sửa đổi mặt phẳng phác thảo/tham số tính năng, xem [Mục 6.5](06-parametric-modeling.md#65-体与节点操作).

### Mảng/Sao chép thân tham số khi sửa nguồn làm tất cả các bản sao đổi theo

Mảng và sao chép mặc định sẽ tạo ra các **thực thể (instance)**, chia sẻ chung hình học nguồn. Khi cần chỉnh sửa độc lập, hãy chọn instance đó rồi thực hiện lệnh `Tách độc lập`, xem [Mục 6.5](06-parametric-modeling.md#65-体与节点操作).

## 11.4 Tài liệu và tệp tin

### Tài liệu tạo mới có tên là `undefined 1`

Đây là vấn đề đã biết ở phiên bản v0.8.0. Bạn chỉ cần chọn node gốc trong cây dự án, rồi trên bảng thuộc tính đổi "Tên" thành tên có ý nghĩa; sau khi lưu, danh sách dự án gần đây ở trang chủ sẽ hiển thị tên mới. Đổi tên chỉ thay đổi tên hiển thị, không làm đổi ID tài liệu và không tạo ra bản sao độc lập.

### Khi đóng tài liệu lỡ làm mất các chỉnh sửa chưa lưu, phải làm sao

Biểu tượng `×` trên tab tài liệu luôn luôn hỏi xác nhận, và cả hai nút đều sẽ đóng tài liệu: nút "OK" của trình duyệt sẽ lưu vào IndexedDB trước rồi mới đóng, còn nút "Cancel" thì **không lưu nhưng vẫn đóng**, không có tùy chọn ở lại tài liệu. Nếu trước đó từng lưu, bạn có thể mở lại từ dự án gần đây hoặc bản sao lưu `.cd` để lấy lại nội dung của lần lưu trước; còn với tài liệu mới chưa từng lưu hoặc các sửa đổi chưa lưu thì không thể lấy lại bằng hoàn tác. Thao tác chuẩn trước khi đóng xem tại [Mục 8.1](08-document-files.md#81-文档与标签).

### Lỡ xóa mất dự án gần đây, có khôi phục được không

Biểu tượng `×` trên thẻ dự án gần đây sau khi xác nhận sẽ đồng thời xóa dữ liệu tài liệu trong IndexedDB và bản ghi gần đây, hoàn toàn không có thùng rác để khôi phục. Nếu bạn có bản sao lưu `.cd`, hãy mở nó ra và nhấn `Ctrl+S` để ghi lại vào tài liệu và danh sách gần đây; tệp STEP chỉ khôi phục được hình học, không khôi phục được tài liệu trọn vẹn. Phòng ngừa và bản sao lưu cần thiết xem tại [Mục 8.2](08-document-files.md#82-保存版本与备份).

### Sau khi lưu rồi làm mới trang web, tài liệu bị biến mất

- Xác nhận bạn đã dùng lệnh `Lưu` (Ctrl+S) chứ không chỉ đơn thuần là xuất tệp; lệnh Lưu mới ghi dữ liệu vào IndexedDB của trình duyệt.
- Khi trình duyệt ở chế độ ẩn danh (Incognito/Private) hoặc đã dọn dẹp dữ liệu trang web, IndexedDB sẽ bị xóa sạch.
- Xác nhận bạn vẫn đang dùng đúng nguồn trình duyệt (origin) ban đầu: trang web chính thức, trang mirror, các giao thức hoặc cổng khác nhau sẽ không tự động đồng bộ tài liệu và cài đặt, xem [Mục 8.8](08-document-files.md#88-数据存放位置).
- Đối với các tài liệu quan trọng, vui lòng dùng `Lưu thành tệp` (`.cd`) và xuất thêm STEP để dự phòng hình học.

### Tệp `.cd` không mở được

Phiên bản ứng dụng hiện tại là **0.8.0**, và phiên bản định dạng tài liệu `documentVersion` là **0.7.1**; khi mở tệp hệ thống đối chiếu nghiêm ngặt số hiệu định dạng tài liệu, **khác phiên bản định dạng chắc chắn bị từ chối**, không có chuyển đổi tự động. Hãy mở bằng phiên bản ứng dụng có cùng định dạng tài liệu, trường hợp khác phiên bản hãy dùng tệp STEP đã xuất trước đó để khôi phục hình học. Chiến lược phiên bản và sao lưu xem tại [Mục 8.2](08-document-files.md#82-保存版本与备份).

### Mở tệp `.cd` sau đó đổi tên rồi lưu, tại sao lại ghi đè lên dự án gần đây ban đầu

Tệp `.cd` giữ nguyên ID tài liệu gốc, phím tắt `Ctrl+S` sẽ ghi đè lên bản ghi có cùng ID trong cùng nguồn trình duyệt; việc đổi tên không làm đổi ID và không tạo ra bản sao độc lập. Khi cần giữ lại trạng thái trước khi chỉnh sửa, bạn nên tải về và cất giữ một bản sao lưu `.cd` độc lập khác trước khi sửa, xem [Mục 8.2](08-document-files.md#82-保存版本与备份).

### Tải mô hình qua `?url=` / `?model=` bị thất bại

Hãy dùng liên kết tải trực tiếp có tên tệp kết thúc bằng phần mở rộng được hỗ trợ, và đảm bảo máy chủ cho phép CORS. Các URL có chữ ký chứa tham số truy vấn có thể khiến việc nhận diện phần mở rộng bị lỗi, bạn có thể tải về trước rồi mở thủ công. Khi gặp sự cố về HTTP, CORS hay phần mở rộng, hãy mở Console trong Developer Tools của trình duyệt để kiểm tra, chi tiết xem tại [Mục 8.6](08-document-files.md#86-url-参数).

### Tại sao nhập tệp STL vào toàn là lưới tam giác, có khôi phục được mặt cong trơn CAD không

Không thể khôi phục bằng cách nhập lại. STL sẽ trở thành hình dạng OCCT cấu thành từ các mặt tam giác, không thể hoàn nguyên lại mặt giải tích ban đầu hay lịch sử tham số; khi cần mặt cong CAD trơn mượt hãy sử dụng STEP, IGES hoặc BREP, xem [Mục 8.3](08-document-files.md#83-导入).

### Xuất tệp nhưng không thấy tệp tải về

- Trước tiên hãy chọn mô hình cần xuất. Chỉ khi **chọn nhiều đối tượng và không tích hợp nhất** thì mới đóng gói thành `.zip`; với một đối tượng đơn lẻ dù không tích hợp nhất hệ thống vẫn tải về tệp định dạng thông thường.
- Cả tệp thông thường và tệp ZIP đều đặt tên theo node được chọn đầu tiên, hãy kiểm tra danh sách tải về theo tên này.
- Trình duyệt có thể đã chặn tải xuống tự động, hãy kiểm tra biểu tượng thông báo tải về ở bên phải thanh địa chỉ. Quy tắc xuất tệp xem tại [Mục 8.4](08-document-files.md#84-导出).

## 11.5 AI và plugin

### Trả lời của AI bị ngắt quãng, hoặc luôn ở trạng thái "Đang suy nghĩ"

- Trong phần Cài đặt AI, hãy giảm bớt "Độ sâu suy nghĩ" để nhường hạn mức token đầu ra cho phần nội dung chính.
- Kiểm tra xem thiết lập kích thước cửa sổ ngữ cảnh có phù hợp với mô hình thực tế hay không; khi chiếm dụng quá lớn, các lượt hội thoại sớm hơn sẽ bị cắt tỉa và cô đọng thành bản tóm tắt.
- Khi điền sai Endpoint, Model ID hoặc Key hệ thống sẽ báo lỗi chứ không im lặng thất bại; đồng thời cần kiểm tra xem endpoint có hỗ trợ streaming và tool calling hay không.
- Khi cần dừng lại, hãy bấm nút "Dừng". Cấu hình và quy tắc ngữ cảnh xem tại [Mục 9.2](09-ai-assistant.md#92-配置模型) và [Mục 9.3](09-ai-assistant.md#93-对话).

### Đã điền AI Endpoint, tại sao vẫn không kết nối được hoặc không xem được ảnh

Base URL chỉ nên điền địa chỉ gốc của API, không tự thêm `/chat/completions` hay `/responses`. Endpoint từ xa thường yêu cầu HTTPS, địa chỉ cục bộ có thể dùng HTTP theo quy định trình duyệt; endpoint cần hỗ trợ CORS, streaming và tool calling, khả năng nhận ảnh phụ thuộc vào mô hình. Độ sâu suy nghĩ "Mặc định" không đảm bảo tương thích với các gateway cũ, danh mục kiểm tra xem tại [Mục 9.2](09-ai-assistant.md#92-配置模型).

### Hội thoại AI có bị chia sẻ cùng tệp `.cd` không

Có. Các cuộc hội thoại lưu vào `.cd` có thể chứa văn bản, hình ảnh tham khảo, tham số và kết quả công cụ. Trước khi chia sẻ, hãy vào "Lịch sử hội thoại" để xóa nội dung liên quan, rồi mới lưu tài liệu hoặc xuất lại tệp; chỉ tạo hội thoại mới là chưa đủ. Nội dung gửi đi và quy trình dọn dẹp xem tại [Mục 9.6](09-ai-assistant.md#96-隐私).

### Plugin từ nguồn lạ có đáng tin cậy không

Plugin thực thi mã JavaScript và có thể gọi các API của ứng dụng, vì vậy bạn chỉ nên cài đặt các gói từ tác giả và nguồn đáng tin cậy. Hộp thoại xác nhận tên miền lạ không phải là quét mã độc; kéo thả tệp cục bộ sẽ không qua hộp thoại này và cũng không có nghĩa là an toàn tuyệt đối. Khi không thể xác nhận nguồn gốc thì không nên tải, xem [Mục 10.4](10-settings-plugins.md#104-插件).

### Plugin từ xa tải thất bại, hoặc Console báo lỗi CORS

Xác nhận địa chỉ là thư mục plugin chứa `manifest.json`, hoặc trực tiếp là địa chỉ gói `.chiliplugin`, chứ không phải là script `extension.js` đơn lẻ bất kỳ. Bản kê khai, gói plugin, script và tài nguyên từ xa bắt buộc phải được máy chủ cho phép CORS; sau đó kiểm tra lỗi mạng trong Console. Hai ví dụ chuẩn xác xem tại [Mục 10.4](10-settings-plugins.md#104-插件).

<a id="116-pro-直接编辑"></a>
## 11.6 Chỉnh sửa trực tiếp Pro (Pro Direct Editing)

### Nhấp đúp vào mô hình tại sao lại yêu cầu "Chuyển đổi thành node có thể chỉnh sửa"

Node này không phải là hình dạng có thể chỉnh sửa trực tiếp, ví dụ thân tham số vẫn do danh sách tính năng điều khiển. Chuyển đổi sẽ giữ lại hình học hiện tại, nhưng **xóa bỏ danh sách tính năng tham số và lịch sử chỉnh sửa ban đầu**. Khi vẫn cần sửa tham số tính năng, hãy nhấp `Hủy` để quay lại luồng làm việc tham số; nếu sau khi xác nhận chuyển đổi phát hiện thao tác nhầm, hãy nhấn ngay `Ctrl+Z`. Chi tiết xem tại [Mục 13.2](13-pro-direct-editing.md#132-进入转换与退出).

### Chỉ nhấp đúp vào một instance, tại sao các instance khác cũng bị đổi theo

Bản Pro sẽ chuyển đến node nguồn của instance để chuyển đổi và chỉnh sửa, do đó mọi instance dùng chung nguồn này đều sẽ cập nhật theo. Khi chỉ muốn sửa một instance riêng lẻ, trước tiên hãy thực hiện `Tách độc lập` trên instance đó, rồi mới vào chỉnh sửa trực tiếp.

### Trong khi chỉnh sửa không thể nhấp chọn được các mô hình khác

Đây là hành vi cách ly có chủ đích, không phải lỗi lựa chọn. Trong `Cài đặt chỉnh sửa → Chế độ cách ly`, tùy chọn `Khóa` giúp các đối tượng khác vẫn hiển thị nhưng không thể thao tác như đối tượng chỉnh sửa thông thường, còn tùy chọn `Ẩn` thì chỉ hiển thị node hiện tại. Các lệnh chỉnh sửa trực tiếp chỉ tác động lên node hiện tại; khi cần thao tác trên node khác hãy thoát phiên chỉnh sửa trước.

### Chọn mặt hoặc cạnh xong không thấy xuất hiện tay cầm kéo màu vàng

Hãy kiểm tra xem hình học được chọn có được hỗ trợ hay không: Kéo mặt phẳng yêu cầu mặt phẳng rõ ràng, khi chọn nhiều mặt phẳng thì các pháp tuyến phải song song; kéo cạnh yêu cầu cạnh đó nối hai mặt không song song; việc kéo mặt bo góc hiện có còn cần bật `Kéo chỉnh sửa bo góc` trong `Cài đặt chỉnh sửa`. Khi cần điều chỉnh hình trụ hoặc thành lỗ, hãy chuyển sang dùng `Dời mặt song song (Offset face)`, đừng chờ đợi tay cầm kéo không được hỗ trợ.

### Dời mặt song song thất bại hoặc báo không thể giữ bán kính bo góc

Trước tiên hãy giảm bớt khoảng cách và kiểm tra các mặt đã chọn, sau đó thử dùng `Đơn giản hóa`. Yêu cầu về khối solid, khoang rỗng khép kín và cấu trúc liên kết không thể dời đều sẽ hạn chế lệnh này; khi bật `Giữ bán kính bo góc`, nếu không thể tái dựng lại góc bo liền kề theo bán kính cũ thì lệnh sẽ từ chối xác nhận. Đừng cố gắng ép lệnh bằng cách tăng khoảng cách liên tục, bạn có thể chuyển sang dùng đẩy-kéo hoặc gỡ bỏ góc bo trước rồi tạo lại sau. Các kiểu thông báo xem tại [Mục 13.5](13-pro-direct-editing.md#135-工具推拉偏移面圆角与倒角).

### Sau khi xóa một mặt thì mô hình bị hở lỗ, chức năng sửa chữa có tự động vá lại được không

Không thể. Phím `Delete` trong chế độ chỉnh sửa là xóa hình dạng con (sub-shape), việc xóa mặt có thể biến một vỏ kín thành vỏ hở ngay lập tức; lệnh `Sửa chữa` chỉ có thể khâu và vá các hình học hiện có, không đảm bảo tái dựng lại mặt bị mất. Hãy nhấn ngay `Ctrl+Z`, hoặc chuyển sang dùng `Xóa tính năng` để thử loại bỏ hình học cục bộ và hàn lành các mặt lân cận.

---

Bước tiếp theo: [Chương 12 Quy trình làm việc điển hình](12-workflows.md) · Quay lại [Mục lục sổ tay](README.md)
