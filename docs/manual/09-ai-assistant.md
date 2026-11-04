# 9. Trợ lý AI

Trợ lý AI của Chili3D không phải là một khung chat gắn ngoài: nó trực tiếp đọc và ghi vào cùng một tài liệu, cùng một vùng chọn, cùng một cây dự án, và các thay đổi do nó thực hiện cũng đi vào cùng một ngăn xếp hoàn tác. Yêu cầu gửi tới mô hình được trình duyệt gửi **trực tiếp** tới API endpoint mà bạn cấu hình, không thông qua bất kỳ máy chủ trung gian nào của Chili3D; điều này không có nghĩa là dữ liệu không rời khỏi máy tính, nội dung gửi đi cụ thể xem tại [Mục 9.6](#96-隐私).

## 9.1 Mở và bố cục giao diện

- Nhấp **Cơ bản/Tham số → Khác → Trợ lý AI**, hoặc nhấp vào biểu tượng trên thanh tiêu đề của bảng bên phải để bật/tắt hiển thị.
- Bảng điều khiển mặc định neo ở bên phải; kéo thanh tiêu đề có thể tách thành cửa sổ nổi, trên thanh tiêu đề của cửa sổ nổi có nút "Neo" để gắn lại vị trí cũ.
- Các nút trên thanh tiêu đề: Cài đặt (bánh răng), Lịch sử hội thoại, Tạo hội thoại mới, Neo/Đóng.

![Trợ lý AI](images/13-ai-panel.png)

<a id="92-配置模型"></a>
## 9.2 Cấu hình mô hình

Lần đầu mở (hoặc khi chưa có API Key hợp lệ), trang cài đặt sẽ hiển thị:
Trang cài đặt cũng có thể mở bất kỳ lúc nào bằng cách nhấp vào biểu tượng bánh răng trên thanh tiêu đề.

![Cài đặt Trợ lý AI](images/14-ai-settings.png)

| Mục | Giải thích |
| --- | --- |
| Nhà cung cấp | Anthropic API / Completions API (Tương thích OpenAI) / Responses API |
| Base URL | Địa chỉ gốc của API; khi chuyển đổi nhà cung cấp sẽ tự điền giá trị preset, bạn cũng có thể tự sửa để dùng proxy/gateway tương thích |
| Mô hình | Mã định danh mô hình, ví dụ `claude-opus-5`, `gpt-5.5` |
| Độ sâu suy nghĩ | Mặc định / low / medium / high / xhigh / max; Mặc định nghĩa là không gửi trường độ sâu suy nghĩ, để endpoint tự quyết định |
| Cửa sổ ngữ cảnh | 200K / 256K / 400K / 512K / 1M; dùng để hiển thị mức dung lượng đã dùng, đồng thời dùng để cắt tỉa lịch sử gửi lại theo ngân sách khoảng 80% |
| API Key | Chỉ lưu trong bộ nhớ của phiên làm việc hiện tại; có thể chọn giao cho trình quản lý mật khẩu của trình duyệt lưu giữ |

Lưu ý:

- Base URL không tự ý thêm các phần đuôi như `/chat/completions` hoặc `/responses`, client sẽ tự động cấu trúc yêu cầu cụ thể theo nhà cung cấp đã chọn. Ví dụ địa chỉ gốc preset cho cả hai loại API chính thức của OpenAI đều là `https://api.openai.com/v1`.
- Các endpoint từ xa thông thường yêu cầu **HTTPS**; địa chỉ phát triển cục bộ có thể dùng HTTP theo quy định của trình duyệt. Endpoint cũng cần hỗ trợ **CORS, phản hồi dạng luồng (streaming) và gọi công cụ (tool calling)**, đồng thời cho phép yêu cầu cross-origin từ domain của Chili3D hiện tại. Việc endpoint chỉ hỗ trợ chat văn bản thông thường không đồng nghĩa với việc tương thích với trợ lý dựng hình CAD; khả năng hiểu hình ảnh tham khảo và ảnh chụp màn hình khung nhìn còn phụ thuộc vào năng lực thị giác (vision) của mô hình được dùng.
- Độ sâu suy nghĩ "Mặc định" **không đảm bảo tương thích với các gateway cũ**: nó chỉ đơn giản là không gửi một trường tùy chọn, gateway vẫn phải hỗ trợ các trường khác và giao thức streaming mà nhà cung cấp đó yêu cầu.
- API Key không được ghi vào bộ nhớ lưu trữ trình duyệt của ứng dụng. Sau khi làm mới (F5) trang web bạn cần nhập lại, trừ khi bạn chọn để trình quản lý mật khẩu của trình duyệt lưu và tự động điền.
- Nếu mô hình của bạn dành hết dung lượng token đầu ra cho việc suy luận (thinking) khiến câu trả lời chính bị ngắt quãng, hãy giảm bớt "Độ sâu suy nghĩ".

Nhấp `Lưu` để vào giao diện hội thoại.

<a id="93-对话"></a>
## 9.3 Hội thoại

- Nhập yêu cầu bằng ngôn ngữ tự nhiên vào ô nhập liệu dưới đáy, nhấn `Enter` để gửi, `Shift+Enter` để xuống dòng.
- Nút `+` bên trái ô nhập liệu dùng để đính kèm hình ảnh tham khảo; cũng có thể dán ảnh trực tiếp từ clipboard.
- Sau khi gửi, nút gửi chuyển thành "Dừng", có thể bấm vào để ngắt lượt trả lời hiện tại.
- Trợ lý có thể hỏi bạn câu hỏi làm rõ trước (ví dụ chọn mặt nào), bạn chỉ cần trả lời trực tiếp trong ô nhập liệu.
- Khi trợ lý thực thi các công cụ, trong luồng tin nhắn sẽ hiển thị các thao tác như "Đã tạo...", "Đã xóa...", một số thao tác có thể nhấp chuột vào để định vị đối tượng trên khung nhìn.
- Mỗi tin nhắn của người dùng đều có thể "Cuộn lại (Rollback)": khôi phục cả tài liệu và hội thoại về thời điểm trước tin nhắn đó, đồng thời đưa nội dung tin nhắn đó trở lại ô nhập liệu. Rất tiện cho tình huống "bước này không đúng, làm lại".

### Mẫu câu lệnh (Prompt Template) bằng ngôn ngữ tự nhiên

Mô tả rõ ràng mục tiêu, ràng buộc và điều kiện nghiệm thu trong một lần gửi sẽ đáng tin cậy hơn nhiều so với việc chỉ nói chung chung "làm một cái mặt bích". Bạn có thể cấu trúc yêu cầu theo mẫu dưới đây, các mục không liên quan có thể bỏ qua:

```text
Đối tượng: [Tạo mới cái gì, hoặc sửa node nào; có thể chọn trước mục tiêu và ghi rõ tên node]
Kích thước: [Dài, rộng, cao, đường kính, độ dày, góc bo... ghi rõ đơn vị mm]
Vị trí/Chuẩn: [Tọa độ, gốc tọa độ, mặt phẳng chuẩn, mặt/cạnh tham chiếu, và phương hướng]
Thao tác: [Tạo mới, đùn, tạo lỗ, boolean, di chuyển, đổi thuộc tính...]
Có tham số hóa không: [Giữ lại cây tính năng có thể tiếp tục chỉnh sửa / chỉ cần hình dạng trực tiếp]
Giữ lại: [Những node hiện có, tính năng, đối tượng công cụ hoặc vật liệu nào không được xóa hay thay thế]
Nghiệm thu: [Kích thước, số lượng, vị trí và góc nhìn cần kiểm tra đối chiếu]
Nếu mục tiêu hoặc kích thước có điểm mơ hồ, vui lòng hỏi lại trước, không tự ý giả định.
```

Với các chi tiết phức tạp, có thể chia thành nhiều lượt trao đổi, ví dụ kiểm tra kích thước thân chính trước, sau đó mới thêm lỗ và góc bo; mỗi lượt đều nêu rõ kết quả cần giữ lại của bước trước.

### Hình ảnh tham khảo

Sau khi dán hoặc tải ảnh lên, trợ lý sẽ "đọc ảnh" trước (đối chiếu kích thước, đặc điểm hình học), trước khi hoàn tất đối chiếu sẽ không được phép chạy các công cụ làm thay đổi hình học. Khi đọc ảnh thất bại sẽ có thông báo "Không thể đối chiếu ảnh tham khảo — sẽ tiếp tục mà không phụ thuộc vào ảnh". Khả năng hiểu ảnh phụ thuộc vào mô hình, và ảnh tham khảo cũng không thể thay thế cho việc nhập rõ ràng các kích thước quan trọng.

### Lịch sử và ngữ cảnh

- Hội thoại được ghi vào `document.userData` của tài liệu hiện tại. Nhấp "Lịch sử hội thoại" để chuyển đổi, xóa; việc tạo hội thoại mới không xóa hội thoại cũ.
- Mỗi lượt kết thúc sẽ cập nhật hội thoại trong bộ nhớ RAM, nhưng chỉ khi **lưu tài liệu** thì mới được lưu cố định vào IndexedDB; `Lưu thành tệp` cũng sẽ ghi hội thoại vào tệp `.cd`. Hội thoại và các sửa đổi mới chưa lưu sẽ bị mất khi đóng tab hoặc làm mới trang, cách xử lý riêng tư trước khi chia sẻ xem tại [Mục 9.6](#96-隐私).
- "Cửa sổ ngữ cảnh" không chỉ quyết định thanh hiển thị dung lượng, mà còn quyết định ngân sách gửi lại lịch sử: khi ước tính vượt quá khoảng **80%** cửa sổ, các lượt hội thoại đầy đủ trước đó sẽ bị cắt bớt khỏi nội dung gửi đi, ý đồ chính, thao tác và bản ghi lỗi sẽ được cô đọng thành tóm tắt ngắn gọn cho mô hình tham khảo. Toàn bộ hội thoại đầy đủ trên giao diện vẫn được giữ nguyên vẹn.
- Khi cắt tỉa cũng có thể loại bỏ nội dung suy luận cũ và ảnh chụp màn hình khung nhìn đã hết hạn; khi xuất hiện dòng "Các tin nhắn sớm hơn ở trên không còn được gửi tới mô hình nữa", điều đó biểu thị ngữ cảnh mà mô hình nhìn thấy đã khác với toàn bộ bản ghi hiển thị trên màn hình.
- Thanh ngữ cảnh cạnh ô nhập liệu hiển thị dung lượng hiện tại / kích thước cửa sổ. Giá trị kích thước cửa sổ nên phù hợp với năng lực thực tế của endpoint và mô hình, không phải điền càng lớn càng tốt.

## 9.4 Trợ lý có thể làm những gì

- **Dựng hình từ mô tả**: Ví dụ "Tạo một hộp 10×20×5, sau đó bo góc 2mm".
- **Chỉnh sửa mô hình hiện có**: Đổi kích thước, thêm góc bo, tạo lỗ, Boolean, di chuyển, đổi vật liệu.
- **Đọc thông tin tài liệu**: Cây dự án, hình học, vùng chọn hiện tại, ảnh chụp màn hình khung nhìn, nhờ đó lệnh "Làm dày mặt bích này lên" có thể định vị chính xác đối tượng.
- **Đo đạc và truy vấn**: Chiều dài, diện tích, thể tích; kiểu mặt cong/đường cong.
- **Tổ chức tài liệu**: Tạo thư mục, di chuyển node, đổi tên, thiết lập thuộc tính.
- **Biến số tài liệu**: Đọc/ghi bảng biến số.
- **Thao tác khung nhìn**: Khớp khung nhìn (Fit view), chuyển góc nhìn, chụp ảnh màn hình.
- **Xuất tệp**: Xuất đối tượng được chọn ra tệp tin.

![Bàn sắt nghệ thuật do Trợ lý AI tạo cùng toàn bộ hội thoại (giao diện tiếng Anh)](images/18-ai-modeling-result.png)

*AI hoàn thành dựng hình bàn sắt nghệ thuật theo hội thoại và điều chỉnh vật liệu mặt bàn; bên phải lưu giữ hướng dẫn sửa đổi của lượt này (giao diện tiếng Anh).*

### Hai luồng dựng hình

| Luồng | Kết quả | Phù hợp cho |
| --- | --- | --- |
| `run_program` | Hình dạng dựng trực tiếp (`EditableShapeNode`), một lần gọi là một bước hoàn tác | Hình dạng dùng một lần, đo lường, truy vấn, chỉnh sửa nhanh |
| `run_parametric` | Cây tính năng tham số, sau đó vẫn có thể tiếp tục chỉnh sửa trong bảng thuộc tính | Các chi tiết cần giữ lại ý đồ thiết kế lâu dài |

Lưu ý:

- Các thao tác chỉnh sửa của `run_program` (Boolean, bo góc, đẩy-kéo...) sẽ **tiêu thụ** node đầu vào, và tiếp tục bằng node mới trả về.
- Không đưa thân tham số vào các thao tác chỉnh sửa của `run_program` — việc đó sẽ phá vỡ chuỗi tính năng. Muốn kết hợp nhiều thân tham số, hãy yêu cầu trợ lý dùng thao tác Boolean của `run_parametric`.
- Bất kỳ bước nào thất bại, toàn bộ chương trình sẽ hoàn tác lại, không để lại sản phẩm dở dang; trợ lý sẽ đọc lỗi, tự sửa chữa rồi thử lại.
- Đơn vị chiều dài và góc được ấn định cố định là milimét (mm) và độ (°).

### Danh mục kiểm tra đối chiếu kết quả

Không chỉ dựa vào việc trợ lý trả lời "Đã hoàn thành" để lưu hoặc bàn giao ngay, tối thiểu hãy kiểm tra:

- **Cây dự án**: Node mục tiêu có đúng không, có vô tình xóa, tiêu thụ hay thay thế nhầm đối tượng đầu vào nào không; khi yêu cầu tham số hóa, chuỗi tính năng có được giữ lại và tiếp tục chỉnh sửa được không.
- **Kích thước quan trọng**: Dùng công cụ đo hoặc truy vấn hình học để kiểm tra dài rộng, độ dày, đường kính lỗ, số lượng, vị trí và thể tích, đơn vị có đúng là mm không.
- **Quan hệ không gian**: Khớp toàn cảnh và kiểm tra từ nhiều góc nhìn về chuẩn, phương hướng, căn gióng, khe hở và sự giao nhau, xác nhận không có khối hình thừa hoặc chọn nhầm mặt.
- **Yêu cầu bảo toàn**: Các node, tính năng, vật liệu, biến số và hình học tham chiếu ban đầu có được giữ lại theo đúng câu lệnh nhắc không.
- **Kết quả cuối cùng**: Hoàn tác hoặc "Cuộn lại" lượt chưa đúng rồi tạo lại; sau khi kiểm tra không còn sai sót mới lưu, xuất tệp hoặc chia sẻ.

## 9.5 Khi không có API Key

Khi không cấu hình API Key, bạn vẫn có thể sử dụng bình thường toàn bộ các tính năng không liên quan đến AI của ứng dụng. Bảng điều khiển AI sẽ ở trạng thái chưa cấu hình (không hiển thị ô nhập liệu và các ví dụ), cho đến khi bạn điền Key trong phần Cài đặt.

<a id="96-隐私"></a>
## 9.6 Quyền riêng tư

Yêu cầu được gửi trực tiếp tới Base URL mà bạn điền, không qua máy chủ trung gian của Chili3D; khi dùng endpoint từ xa, dữ liệu sẽ rời khỏi máy tính để tới endpoint đó cùng dịch vụ mô hình thực tế của nó. Mỗi lượt gửi đi không chỉ có phần văn bản trong ô nhập liệu:

- **Tóm tắt tài liệu và vùng chọn**: Tên tài liệu hiện tại, số lượng node, cùng ID, kiểu, tên, cấp bậc phân tầng và danh mục hình dạng của các node; các node đang được chọn cũng sẽ được gửi kèm.
- **Hội thoại và ảnh tham khảo**: Các tin nhắn lịch sử còn lưu trong ngữ cảnh của lượt này, cùng hình ảnh bạn dán hoặc tải lên.
- **Nội dung do công cụ sinh ra**: Khi trợ lý gọi công cụ, còn có thể gửi kết quả truy vấn hình học, thuộc tính node, vật liệu, biến số tài liệu, tham số và kết quả công cụ, cùng ảnh chụp màn hình khung nhìn. Không phải lượt nào cũng gửi toàn bộ nội dung, mà tùy thuộc vào nhiệm vụ và các lệnh gọi công cụ thực tế.

Khi dùng gateway tự dựng hoặc endpoint tương thích của bên thứ ba, bạn cần tự đánh giá chính sách ghi log, lưu giữ và quyền riêng tư của bên tiếp nhận thực tế. "Không qua trung gian" không đồng nghĩa với "hoàn toàn cục bộ" hay "chỉ gửi câu lệnh nhắc".

### Lưu trữ và chia sẻ hội thoại

- Hội thoại thuộc `document.userData` của tài liệu hiện tại, khi lưu tài liệu sẽ được ghi vào IndexedDB, khi thực hiện `Lưu thành tệp` cũng sẽ đi vào tệp `.cd`. Trong đó có thể chứa hình ảnh tham khảo của người dùng, tham số công cụ và kết quả công cụ; việc cắt tỉa ngữ cảnh không tự động xóa lịch sử đầy đủ trong tài liệu cho bạn.
- Trước khi chia sẻ tài liệu, hãy vào "Lịch sử hội thoại" để xóa các hội thoại liên quan, xác nhận không còn chứa văn bản, hình ảnh hoặc bản ghi công cụ nhạy cảm, rồi mới lưu tài liệu hoặc xuất lại tệp `.cd`. Chỉ tạo hội thoại mới hoặc chỉ để mô hình quên ngữ cảnh cũ là chưa đủ.
- Các tệp `.cd` đã tải về hoặc chia sẻ ra ngoài trước đó sẽ không tự động cập nhật khi bạn xóa lịch sử sau này, bạn cần phải xuất lại và thay thế tệp cũ.

API Key chỉ lưu trong bộ nhớ tạm của phiên làm việc hiện tại, không lưu cùng tài liệu và không đi vào tệp `.cd`. Bạn có thể chọn để trình quản lý mật khẩu của trình duyệt lưu giữ nó; lúc này hành vi lưu trữ và đồng bộ hóa do trình duyệt và cài đặt trình quản lý mật khẩu của bạn quyết định.

Microsoft Clarity là **kênh thống kê trên trang web độc lập hoàn toàn với các yêu cầu AI**, không liên quan gì đến dịch vụ mô hình mà Base URL trỏ tới. Khi triển khai tự lưu trữ (self-hosted), bạn có thể gỡ bỏ script thống kê Clarity khỏi trang web chính, hoặc chặn các yêu cầu thống kê trong trình duyệt hay chính sách mạng; các cài đặt này không ảnh hưởng lẫn nhau với cấu hình endpoint AI.

---

Bước tiếp theo: [Chương 10 Cài đặt, plugin và phím tắt](10-settings-plugins.md)
