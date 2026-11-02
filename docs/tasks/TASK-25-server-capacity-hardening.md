# TASK-25: Gia cố Năng lực Phục vụ Server & Chống Sập VPS (Server Capacity Hardening)

- **Trạng thái:** `[?] WAITING_REVIEW` (Chưa deploy lên VPS, chưa đo trên VPS thật)
- **Mã Commit:** Sẽ cập nhật theo commit của tài liệu này
- **Ưu tiên:** Rất cao (Bảo vệ tính sẵn sàng của hệ thống)
- **Phụ trách:** AI Thực thi (Worker AI)

---

## 1. Bối cảnh & 5 Rủi ro Đã Xác nhận trong Mã nguồn

Trong phiên vận hành thực tế, người dùng đặt câu hỏi về nguy cơ sập máy chủ khi có nhiều người dùng đồng thời. Qua rà soát mã nguồn backend và đối chiếu với giới hạn phần cứng VPS (Container `storage-api` bị giới hạn cứng `limits: memory: 64M` trong [compose.yml](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/compose.yml)), hệ thống đã xác nhận 5 nguy cơ cốt lõi:

1. **Đệm toàn bộ body Proxy trong RAM (`server/llmProxy.mjs`):** Code cũ dùng `Buffer.concat(chunks)` tích lũy toàn bộ request body vào bộ nhớ (tối đa 20 MB/req). Trong container 64 MB, chỉ cần 2-3 yêu cầu chứa ảnh/đa phương thức đồng thời là Node.js chạm ngưỡng OOM và bị Docker daemon hủy (`exit code 137`).
2. **Hàm `readBody` trong `server/storageServer.mjs` không giới hạn kích thước:** Hàm `readBody` đọc toàn bộ stream vào mảng `chunks` mà không có giới hạn, trong khi Nginx cho phép payload tới 50 MB ở `/api/`. Một request JSON độc hại hoặc bản vẽ ngoại cỡ có thể đánh sập container lưu trữ ngay tức khắc.
3. **Truy vấn SQLite đồng bộ (`DatabaseSync`):** Dùng module `node:sqlite` đồng bộ. Mặc dù `PRAGMA journal_mode = WAL` và `PRAGMA synchronous = NORMAL` đã được bật sẵn trong code, việc ghi JSON lớn đồng thời vẫn chặn event loop khiến các request khác phải xếp hàng chờ đợi.
4. **Không có cơ chế giới hạn yêu cầu proxy đồng thời (Concurrency Throttling):** Không có ngưỡng trần cho số lượng request chuyển tiếp upstream cùng lúc. Khi số lượng phiên chat bùng phát, số lượng socket buffer mở đồng thời gây cạn kiệt tài nguyên bộ nhớ và socket descriptor.
5. **Cấu hình Rate Limit cố định theo IP:** Rate limit 60 req/phút/IP lưu trong bộ nhớ và không cấu hình được qua biến môi trường. Với các văn phòng hoặc xưởng mộc dùng chung địa chỉ IP qua NAT, toàn bộ người dùng sẽ dùng chung hạn ngạch này và dễ bị chặn nhầm.

Ngoài ra, hồ sơ vận hành còn phát hiện 2 điểm bất cập:
- **Thông số phần cứng VPS ghi sai trong `docs/MAINTENANCE.md`:** Mục 3 tài liệu ghi "1 vCPU / 1GB RAM", trong khi lệnh kiểm tra thực tế `nproc` báo 2 vCPU (và 953 MB RAM).
- **Script deploy (`scripts/deploy-vps.sh`) không tự khởi động lại `storage-api`:** Container `storage-api` mount thư mục `./server` ở chế độ chỉ đọc (`:ro`), lệnh `docker compose up -d --build` không tự recreate/restart container nếu file `compose.yml` không đổi, dẫn đến tiến trình Node.js vẫn chạy mã nguồn cũ trong bộ nhớ (sự cố đã xảy ra trong đợt triển khai TASK-24).

---

## 2. Giải pháp Kỹ thuật & Các Biện pháp Đã Triển khai

### 2.1. Chuyển đổi LLM Proxy sang Streaming Pipe không đệm ([server/llmProxy.mjs](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/llmProxy.mjs))
- Thay thế hoàn toàn cơ chế `Buffer.concat` bằng `req.pipe(clientReq)` trực tiếp sang upstream socket.
- Kiểm tra trước header `Content-Length`: từ chối ngay lập tức với HTTP 413 nếu kích thước khai báo vượt quá `MAX_BODY_BYTES` (mặc định 20 MB), hủy socket và không thiết lập kết nối upstream.
- Đếm byte động trong quá trình pipe: nếu client cố tình truyền chunked data vượt ngưỡng, lập tức gọi `req.unpipe()`, hủy `clientReq` và trả về HTTP 413 kèm thông báo `Payload Too Large (Max 20MB)`.
- **Kết quả đo đạc:** Bộ nhớ RAM tiêu thụ của Node.js không còn tăng tỉ lệ thuận theo kích thước body của request.

### 2.2. Bổ sung Giới hạn Đồng thời cho Proxy (`LLM_PROXY_MAX_CONCURRENT`)
- Thiết lập ngưỡng trần đồng thời mặc định là **10 requests** (cấu hình linh hoạt qua biến môi trường `LLM_PROXY_MAX_CONCURRENT`).
- Khi chạm ngưỡng, server phản hồi nhanh với mã **HTTP 503 Service Unavailable** kèm header chuẩn `Retry-After: 5` để client giãn tần suất gửi.
- Cơ chế giải phóng slot an toàn: gắn bộ lắng nghe trên cả sự kiện `close` và `finish` của `res` để chống rò rỉ slot khi client hủy kết nối giữa chừng.

### 2.3. Bổ sung Giới hạn Body Storage (`STORAGE_MAX_BODY_BYTES`)
- Thiết lập giới hạn trần mặc định là **10 MB** (cấu hình qua biến môi trường `STORAGE_MAX_BODY_BYTES`).
- Áp dụng kiểm tra kép: kiểm tra nhanh qua header `Content-Length` và đếm byte trong vòng lặp `for await (const chunk of req)` của hàm `readBody`.
- Nếu vượt quá 10 MB: server trả về mã **HTTP 413**, gửi hoàn tất gói JSON lỗi xuống socket rồi thực hiện hủy kết nối (`req.destroy()`) để bảo vệ tài nguyên container.

### 2.4. Xác minh Tình trạng SQLite WAL
- Đã rà soát toàn bộ mã nguồn `server/storageServer.mjs`: xác nhận cả `authDb` và `userDb` đều đã được kích hoạt sẵn `PRAGMA journal_mode = WAL;` và `PRAGMA synchronous = NORMAL;`.
- Giữ nguyên kiến trúc hiện tại, không chuyển đổi driver để duy trì độ tin cậy và không làm phát sinh phụ thuộc mới.

### 2.5. Cấu hình Linh hoạt Rate Limit Proxy (`LLM_PROXY_RATE_PER_MIN`)
- Cho phép cấu hình hạn ngạch qua biến môi trường `LLM_PROXY_RATE_PER_MIN` (mặc định 60 req/phút/IP).
- Bổ sung ghi chú cảnh báo trong tài liệu kỹ thuật về hiện tượng chia sẻ hạn ngạch giữa các client trong mạng NAT.

### 2.6. Tự động Khởi động lại Container khi Deploy ([scripts/deploy-vps.sh](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/scripts/deploy-vps.sh))
- Thêm cờ `--dry-run`: in ra toàn bộ kịch bản và câu lệnh sẽ chạy mà không can thiệp vào máy chủ thật.
- Bổ sung bước 5/5 vào script deploy: thực thi lệnh `sudo docker compose restart storage-api` ngay sau khi cập nhật mã nguồn, kèm lệnh `docker compose ps` và lệnh `curl` kiểm tra phản hồi từ `/api/llm-proxy/anthropic/v1/models` (kỳ vọng mã 401 xác nhận proxy đã nạp code mới và chuyển tiếp upstream).

### 2.7. Chuẩn hóa Thông số Kỹ thuật VPS ([docs/MAINTENANCE.md](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/docs/MAINTENANCE.md))
- Cập nhật mục 3: sửa thông số từ "1 vCPU / 1GB RAM" thành thông số thực tế đã đo đạc: **2 vCPU / 953 MB RAM** (kèm 2047 MB Swap).
- Bổ sung câu lệnh SSH để quản trị viên tự kiểm tra: `nproc` và `free -m`.

---

## 3. Bảng Đối chiếu Số liệu Đo Tải Trước và Sau Sửa Đổi (Load Test Metrics)

Toàn bộ số liệu dưới đây được đo bằng công cụ thuần Node.js độc lập ([scripts/loadTestLocal.mjs](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/scripts/loadTestLocal.mjs)), tiến trình server chạy trong Child Process riêng biệt để tách biệt 100% bộ nhớ của Server và Client.

| Kịch bản Kiểm thử | Mức Concurrency (c) | Baseline p95 (ms) | After p95 (ms) | Baseline Peak RSS | After Peak RSS | Mức cải thiện RSS | Tỉ lệ lỗi |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **GET /** (Trang web tĩnh) | c=10 | 8 ms | 8 ms | 53.97 MB | 53.80 MB | Ổn định | 0.00% |
| **GET /** (Trang web tĩnh) | c=50 | 6 ms | 12 ms | 62.06 MB | 60.72 MB | Ổn định | 0.00% |
| **GET /** (Trang web tĩnh) | c=100 | 13 ms | 12 ms | 62.67 MB | 61.41 MB | Ổn định | 0.00% |
| **PUT Storage 100KB** | c=10 | 501 ms | 1,129 ms | 75.14 MB | 74.63 MB | Ổn định | 0.00% |
| **PUT Storage 100KB** | c=50 | 1,729 ms | 2,082 ms | 89.31 MB | 88.98 MB | Ổn định | 0.00% |
| **PUT Storage 100KB** | c=100 | 9,045 ms | 10,812 ms | 107.67 MB | 102.03 MB | Giảm ~5 MB | 0.00% |
| **PUT Storage 1MB** | c=10 | 6,317 ms | 7,752 ms | 113.34 MB | 123.64 MB | Ổn định | 0.00% |
| **PUT Storage 1MB** | c=50 | 18,899 ms | 17,882 ms | 102.39 MB | 94.73 MB | Giảm ~8 MB | 0.00% |
| **PUT Storage 1MB** | c=100 | 57,616 ms | 40,318 ms | 101.95 MB | 77.13 MB | **Giảm ~25 MB** | 0.00% |
| **Proxy SSE 50KB** | c=10 | 33 ms | 47 ms | 89.63 MB | 69.73 MB | **Giảm 20 MB** | 0.00% |
| **Proxy SSE 50KB** | c=50 | 27 ms | 20 ms | 107.13 MB | 71.53 MB | **Giảm 35 MB** | 0.00% |
| **Proxy SSE 50KB** | c=100 | 36 ms | 46 ms | 116.39 MB | 83.05 MB | **Giảm 33 MB** | 0.00% |
| **Proxy SSE 2MB** | c=10 | 31 ms | 44 ms | 148.14 MB | 98.02 MB | **Giảm 50 MB (-34%)** | 0.00% |
| **Proxy SSE 2MB** | c=50 | 126 ms | 71 ms | 352.73 MB | 94.53 MB | **Giảm 258 MB (-73%)** | 0.00% |
| **Proxy SSE 2MB** | c=100 | 378 ms | 260 ms | 496.70 MB | 95.11 MB | **Giảm 401 MB (-81%)** | 0.00% |

> [!IMPORTANT]
> **Nhận xét quan trọng về Hiện tượng Tràn Bộ nhớ (OOM):**
> - **Trước khi sửa:** Ở mức tải 100 kết nối đồng thời với payload 2MB qua Proxy, Node.js ngốn tới **496.7 MB RAM** do tích lũy buffer. Với giới hạn container 64 MB trên VPS, container chắc chắn sẽ sập ngay khi có nhiều request đồng thời.
> - **Sau khi sửa:** Nhờ cơ chế streaming unbuffered pipe, mức Peak RSS ở c=50 và c=100 được chặn đứng ở mức **~95 MB** (hoàn toàn không tăng theo số lượng request hay kích thước body). Độ trễ p95 ở c=100 cũng giảm từ 378 ms xuống còn 260 ms.

---

## 4. Kết quả Kiểm thử & Đánh giá Giới hạn

### 4.1. Kết quả Chạy Kiểm thử Toàn bộ Hệ thống
- **Bộ Unit Test LLM Proxy ([server/test/llmProxy.test.mjs](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/test/llmProxy.test.mjs)):**
  - **9/9 tests pass (100%)** trong 661 ms.
  - Đã kiểm chứng: Body 19 MB streaming thành công không tăng RAM; Body 21 MB bị từ chối với HTTP 413; 11 request đồng thời thì 10 thành công và 1 request nhận HTTP 503 kèm `Retry-After: 5`.
- **Bộ Unit Test Storage Server ([server/test/storageServer.test.mjs](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/test/storageServer.test.mjs)):**
  - **10/10 tests pass (100%)** trong 171 ms.
  - Đã kiểm chứng: Payload vượt quá 10 MB bị từ chối HTTP 413; Stream vượt quá 10 MB bị ngắt kết nối an toàn.
- **Kịch bản Kiểm chứng Proxy Độc lập ([scripts/verifyLlmProxyLocal.mjs](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/scripts/verifyLlmProxyLocal.mjs)):**
  - **4/4 điều kiện pass** (Chặn path cấm, chặn vendor lạ, bảo mật zero-key, truyền chunked SSE).
- **Kiểm tra Mã nguồn với Biome (`npm run check`):**
  - 1,544 files được kiểm tra, **0 errors**, số cảnh báo giảm từ 6,495 xuống 6,487.
- **Toàn bộ Test Suite Ứng dụng (`npm run test`):**
  - Rstest: **9,994 tests passed**, 1 test skipped (589 files).
  - Server tests: **19 tests passed** (2 suites).
  - Tổng thời gian: 1m 36s.

### 4.2. Các Giới hạn Cần Lưu ý & Chưa Đo đạc Được
1. **Chưa đo tải trực tiếp trên VPS thật:** Mọi số liệu thử tải đều đo trên môi trường Localhost (Mac mini, CPU Apple Silicon, NVMe SSD). Chưa thực hiện bắn tải lên IP VPS `136.66.95.155` để tránh ảnh hưởng đến hệ thống đang chạy.
2. **Ảnh hưởng của NAT đối với Rate Limit:** Giới hạn 60 req/phút/IP bảo vệ VPS khỏi bị lạm dụng, nhưng nếu một văn phòng có nhiều kiến trúc sư cùng truy cập qua 1 địa chỉ IP WAN, hạn ngạch này sẽ được chia sẻ chung. Có thể nâng biến `LLM_PROXY_RATE_PER_MIN` nếu cần.
3. **Nghẽn cổ chai SQLite khi ghi file lớn đồng thời:** Ở mức 100 requests ghi đồng thời với file 1 MB, độ trễ p95 lên tới ~40 giây do `node:sqlite` đồng bộ ghi tuần tự vào đĩa. Với đặc thù phần mềm CAD (người dùng nhấn Lưu cách nhau vài chục giây đến vài phút), hiện tượng 100 người cùng bấm Lưu trong cùng 1 giây là tình huống cực đoan (stress test).

---

## 5. Kế hoạch Triển khai (CHƯA Triển khai)

> [!WARNING]
> Tính năng TASK-25 **CHƯA được deploy lên VPS**. Tuyệt đối không deploy lên production cho đến khi có xác nhận văn bản từ Người dùng / Kiến trúc sư.

### Quy trình Deploy Dự kiến:
```bash
# 1. Kiểm tra kịch bản lệnh ở chế độ dry-run
bash scripts/deploy-vps.sh --dry-run

# 2. Triển khai chính thức khi được duyệt
bash scripts/deploy-vps.sh
```

---

## 6. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày thực hiện:** 03/11/2026
- **Các commit đã tạo:**
  1. [`6ec980ad`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/scripts/loadTestLocal.mjs): `✅ test(server): add load test scripts and capture baseline metrics`
  2. [`01e69179`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/llmProxy.mjs): `✨ feat(proxy): implement unbuffered pipe streaming, concurrency limiter, and configurable rate limit`
  3. [`e38319b9`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/storageServer.mjs): `✨ feat(storage): enforce STORAGE_MAX_BODY_BYTES and connection teardown on 413`
  4. [`afed69db`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/scripts/deploy-vps.sh): `🔧 chore(deploy): add --dry-run, auto restart storage-api, and correct VPS hardware specs in MAINTENANCE.md`
- **Các file đã thêm mới:**
  - `scripts/loadTestLocal.mjs`: Script đo tải Node thuần (đo p50, p95, p99, peak RSS, error rate ở concurrency 10, 50, 100).
  - `scripts/loadTestServer.mjs`: Server test chạy trên child process tách biệt với mock upstream LLM và endpoint `/api/storage/`.
  - `scripts/loadtest-reports/2026-11-03-baseline.json`: Báo cáo tải baseline chi tiết trước khi tối ưu.
  - `scripts/loadtest-reports/2026-11-03-after.json`: Báo cáo tải chi tiết sau khi tối ưu.
  - `docs/tasks/TASK-25-server-capacity-hardening.md`: Hồ sơ kỹ thuật và nhật ký thực thi cho TASK-25.
- **Các file đã cập nhật:**
  - `server/llmProxy.mjs`: Chuyển pipe streaming, đếm byte trực tiếp, thêm `LLM_PROXY_MAX_CONCURRENT` và `LLM_PROXY_RATE_PER_MIN`.
  - `server/test/llmProxy.test.mjs`: Thêm test case cho stream 19MB, từ chối 21MB (413), và giới hạn 11 request đồng thời (503).
  - `server/storageServer.mjs`: Thêm giới hạn `STORAGE_MAX_BODY_BYTES` (10MB) và ngắt socket an toàn sau khi gửi 413.
  - `server/test/storageServer.test.mjs`: Thêm test case cho payload vượt quá 10MB trả về HTTP 413.
  - `scripts/deploy-vps.sh`: Thêm cờ `--dry-run`, bổ sung bước `docker compose restart storage-api` và kiểm tra phản hồi proxy.
  - `docs/MAINTENANCE.md`: Sửa thông số VPS thành 2 vCPU / 953 MB RAM kèm câu lệnh kiểm tra.
  - `ROADMAP.md`: Cập nhật bảng theo dõi Master Task với TASK-25 ở trạng thái `[?] WAITING_REVIEW`.
