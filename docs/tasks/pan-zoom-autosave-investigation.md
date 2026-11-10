# Điều tra CAD chậm dần sau khi chỉnh sửa trên Chrome

Trạng thái **Chờ thực hiện**. Mốc đã ghi nhận lỗi là VPS `157c91ab`. Người dùng báo zoom bằng trackpad và kéo chậm sau một thời gian thêm chi tiết. Tải lại trang thì mượt hơn. Có lúc hình còn zoom sau khi nhấc tay. Bản tối ưu Raycaster trước đó chưa giải quyết triệu chứng này.

## 1. Tái hiện trên đúng phiên

- Đọc quy tắc repo, xác nhận SHA đang phục vụ và tên bản vẽ thực tế. Ưu tiên tab Chrome thường đang đăng nhập, giữ nguyên tab, cache và dữ liệu trang. Nếu phiên đang chậm còn mở, ghi Chrome Performance trước khi tải lại. Dùng Record, ghi một lượt vuốt rồi nhấc tay và một lượt kéo vùng nhìn bằng H.
- Ghi chế độ desktop hay giả lập thiết bị, kích thước vùng vẽ, tỷ lệ điểm ảnh, camera và đối tượng đang hiện. Sau khi xác nhận bản vẽ đã lưu đủ, tải lại rồi đo cùng thao tác và điều kiện. Ghi rõ nếu lượt tải lại thiếu chi tiết hoặc đổi góc nhìn.
- Trên bản sao, lặp chuỗi thêm, nhân bản, sửa, xóa và Undo như lúc sử dụng thật. Thử cả khi số chi tiết tăng và khi lặp chỉnh sửa nhưng cuối mỗi vòng hình học trở về cùng trạng thái. Nếu không lấy được trace phiên lỗi, báo rõ giới hạn của mẫu thử.

## 2. Đo tự lưu và ảnh thu nhỏ

- Rà `Document.save()` và timer tự lưu trong `packages/app/src/document.ts`, đường chụp ảnh trong `packages/three/src/threeView.ts` và hàng đợi lưu trữ trong `packages/storage/src/apiCloudStorage.ts`.
- Đánh dấu riêng thời gian serialize, ghi IndexedDB, xếp hàng và gửi đồng bộ, tạo ảnh thu nhỏ (render và mã hóa canvas). Đối chiếu với khung hình chậm và sự kiện wheel. Phân biệt sự kiện wheel vẫn đến sau khi nhấc tay với trường hợp khung hình hiển thị muộn.
- Trên bản thử, giữ tự lưu và đồng bộ rồi so sánh hai lượt có và bỏ tạo ảnh thu nhỏ. Giữ cùng bản vẽ, thao tác và điều kiện. Nếu ảnh là điểm nghẽn, thử hoãn ảnh đến khi ngừng tương tác. Việc lưu nội dung phải hoàn tất độc lập với việc tạo ảnh.
- Nếu khựng vẫn xảy ra giữa các lần lưu, đo tiếp số lượt vẽ, tam giác, geometry, texture, bộ nhớ JS/WASM nếu có và lịch sử Undo. Kiểm tra tài nguyên được giải phóng khi hình bị thay hoặc xóa. Ghi rõ bộ đếm nào đo số lượng, bộ đếm nào đo dung lượng. Có thể thử đóng rồi mở lại riêng bản vẽ trong cùng tab để tách trạng thái tài liệu khỏi trạng thái cả phiên.

## 3. Kiểm tra riêng tính đúng của tự lưu

- Điều kiện hiện tại so sánh số bước Undo, trong khi lịch sử mặc định giới hạn 50. Tạo ca đã lưu ở mốc 50 rồi sửa thêm mà số đếm vẫn giữ nguyên. Xác nhận thay đổi mới được tự lưu và mở lại đúng. Kiểm thêm Undo/Redo, chỉnh sửa trong lúc đang lưu và lỗi ghi cục bộ. Chỉ đánh dấu phiên bản đã lưu sau khi ghi thành công. Phân biệt lưu cục bộ với máy chủ đã xác nhận đồng bộ.
- Bàn giao lỗi tự lưu riêng với kết luận hiệu năng. Giữ nguyên bản vẽ thật và dữ liệu người dùng. Dùng bản sao để thử lỗi hoặc thay đổi cách lưu. Giữ trace và snapshot riêng tư ngoài Git.

## 4. Nghiệm thu

- Bàn giao SHA, bước tái hiện, trace và bảng số liệu trước/sau với thời gian khung hình p95, số khung vượt 33 ms, khung chậm nhất và thời gian từng bước lưu. Ghi điều kiện và số lần lặp. Chỉ kết luận đã sửa khựng nếu tái hiện được trên bản nền và giảm rõ trong phép đo tương đương.
- Kiểm lại zoom trackpad, Pan H, kéo đối tượng, bắt điểm, Undo/Redo và mở lại bản vẽ. Sửa theo bằng chứng đã đo, giữ trạng thái WAITING_REVIEW trước khi triển khai VPS.
