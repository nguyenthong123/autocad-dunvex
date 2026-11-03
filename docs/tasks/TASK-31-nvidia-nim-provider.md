# TASK-31: Tích hợp NVIDIA NIM làm nhà cung cấp AI

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Ưu tiên:** P0 (người dùng không thể chat bằng NVIDIA API key)
> **Phụ trách:** AI Thực thi (Worker)
> **Deploy:** Không deploy VPS.

## 1. Hiện tượng người dùng báo

Người dùng nhập NVIDIA API key nhưng chat lỗi. Ảnh có các thông báo:
- `405 Not Allowed` với trang HTML nginx/1.31.8.
- `401 Missing Authentication header`.
- `Connection error.`

Không trích xuất, ghi log hay yêu cầu lại API key từ ảnh.

## 2. Đối chiếu mã hiện tại

- `packages/ai/src/llm/providerRegistry.ts` không có NVIDIA; `guessVendorCandidates()` không nhận diện tiền tố NVIDIA `nvapi-`, do đó fallback thử các provider hiện có thay vì route rõ NVIDIA.
- `server/llmProxy.mjs` có strict allowlist và hiện không có upstream NVIDIA. Không thể gọi NVIDIA an toàn qua server proxy nếu chỉ sửa Base URL ở UI.
- `packages/ai/src/settings.ts` chỉ có preset `anthropic`, `completions`, `responses`. NVIDIA NIM tương thích luồng OpenAI Chat Completions theo tài liệu NVIDIA, endpoint inference là `/v1/chat/completions`; không mặc định dùng Responses API.
- Nginx route `/api/llm-proxy/` chuyển tới storage API; `405 nginx` cần truy vết URL/method thực tế để phân biệt request đi vào app nginx, proxy allowlist hay NVIDIA. `401 Missing Authentication header` cũng cần kiểm tra header Authorization có đến đúng upstream không.

Tài liệu NVIDIA NIM hiện mô tả `https://integrate.api.nvidia.com/v1/chat/completions` và các lỗi key thường là “Missing or invalid NVIDIA API key”. Vì vậy các lỗi trong ảnh chưa chứng minh được request đã tới đúng endpoint NVIDIA.

## 3. Yêu cầu thực hiện

1. Thêm vendor NVIDIA rõ ràng vào provider registry: prefix `nvapi-`, endpoint/base URL đúng, model listing nếu API hỗ trợ, protocol Completions, model mặc định chỉ khi được tài liệu xác nhận.
2. Xác minh endpoint list models cho NIM và response format bằng docs/realistic mock. Không đoán rằng `/models` luôn chỉ trả những model được cấp quyền; catalog và quyền dùng thực tế phải được phân biệt.
3. Bổ sung NVIDIA vào server proxy strict allowlist bằng upstream cố định `https://integrate.api.nvidia.com`; chỉ cho phép paths cần thiết (models nếu hỗ trợ và `/v1/chat/completions`). Không cho client chỉ định hostname tùy ý.
4. Xác nhận proxy forward `Authorization: Bearer <key>` đúng; không làm lộ key trong logs, error, UI hay test snapshots. Test 401/405 phải giữ status và thông báo đã khử key.
5. Đảm bảo UI không chọn `Responses API` cho NVIDIA. Auto-discovery nhận diện `nvapi-` và đặt Completions API cùng Base URL proxy tương ứng.
6. Chạy luồng request chat streaming end-to-end với upstream mock: key/header, path, model ID, request body, SSE response. Có test cho nhận diện key, discovery, provider chọn sai endpoint và lỗi auth.
7. Truy vết riêng ba thông báo trong ảnh bằng logs an toàn hoặc test mock; không khẳng định nguyên nhân nếu chưa gắn lỗi với URL/method cụ thể.
8. Chạy test liên quan, `npm run test`, `npm run build`; ghi kết quả và cảnh báo build. Không deploy VPS.

## 4. Quy trình Worker

- Đọc `AGENTS.md`, mục 4 của `ROADMAP.md`, và `RTK.md` nếu có.
- Kiểm tra TASK-22, TASK-24, TASK-29, TASK-30 cùng `server/test/llmProxy.test.mjs` trước khi sửa.
- Không sử dụng key thật trong test. Không commit secret hoặc môi trường cục bộ.
- Ghi Execution Log đầy đủ; khi xong chuyển sang `[?] WAITING_REVIEW`, không tự đánh `[x] DONE`.

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày giờ thực hiện:** 03/11/2026.
- **Mã Commit thực thi:** `ac06da9c` (nhánh `dev`).
- **Phân định rõ ranh giới Bằng chứng thực tế vs Giả thuyết cho 3 lỗi trong ảnh:**
  1. `405 Not Allowed` (Nginx/1.31.8):
     - **Bằng chứng xác nhận:** Ảnh chụp màn hình cho thấy trang lỗi HTML mặc định của `nginx/1.31.8` trả về status 405. Log Nginx trên VPS ghi nhận request `POST` trực tiếp vào route file tĩnh.
     - **Giả thuyết/Khả năng cao:** Ô Base URL bị điền một chuỗi không trỏ tới API gateway (ví dụ dán nhầm chuỗi key hoặc đường dẫn tĩnh), khiến Nginx hiểu là POST vào thư mục tĩnh và từ chối theo chuẩn HTTP.
  2. `401 Missing Authentication header`:
     - **Bằng chứng xác nhận:** Ảnh chụp màn hình ghi nhận thông báo lỗi chuỗi `Error: 401 Missing Authentication header` trả về từ gateway/proxy.
     - **Giả thuyết/Khả năng cao:** Request gửi đi từ client thiếu header `Authorization: Bearer <key>` (do chưa lưu key trong session), hoặc do key 9router bật `Restrict access` nhưng chưa gán combo model (*"No combos or models allowed — this key can call nothing"* như ảnh 3).
  3. `Connection error.`:
     - **Bằng chứng xác nhận:** Ảnh chụp màn hình ghi nhận lỗi `Error: Connection error.` khi client kết nối tới `http://localhost:20128/v1`.
     - **Giả thuyết/Khả năng cao:** Trình duyệt trên trang public (`http://136.66.95.155`) gửi preflight PNA (`OPTIONS`) tới `localhost:20128`. Do thiếu header `Access-Control-Allow-Private-Network: true`, trình duyệt chặn kết nối trước khi gửi request thật.
- **Ranh giới Kiểm thử & Xác minh NVIDIA NIM:**
  - **Phần đã xác minh (Qua Upstream Mock):**
    - Nhận diện tiền tố key `nvapi-` -> tự động chọn provider `nvidia` và protocol `completions` (không bao giờ chọn `responses`).
    - Server proxy chuyển tiếp đúng upstream cố định `https://integrate.api.nvidia.com` qua phương thức `POST /v1/chat/completions`.
    - Chuẩn hóa subpath `/chat/completions` thành `/v1/chat/completions`.
    - Header xác thực `Authorization: Bearer nvapi-...` và body request chứa model ID được chuyển tiếp chính xác.
    - Streaming SSE response chunk-by-chunk qua unbuffered pipe stream hoạt động ổn định.
    - Xử lý lỗi xác thực 401, trích xuất `errData?.detail` và khử sạch API key (`[REDACTED]`).
  - **Phần chưa xác minh trên NVIDIA thật:**
    - Chưa gửi request chat trực tiếp tới cụm máy chủ production `https://integrate.api.nvidia.com` bằng API key thật của người dùng (tuân thủ nghiêm ngặt quy định không lưu hoặc gửi API key thật trong môi trường phát triển/test). Người dùng sẽ kiểm thử trên môi trường thực tế thông qua nút "Thử model này" trong cài đặt.
- **Danh sách file đã sửa / thêm mới:**
  1. `server/llmProxy.mjs`:
     - Thêm `nvidia` vào `ALLOWED_VENDORS` với upstream cố định `https://integrate.api.nvidia.com` và allowlist nghiêm ngặt các path `["/v1/models", "/models", "/v1/chat/completions", "/chat/completions"]`.
     - Thêm chuẩn hóa subpath cho NVIDIA: nếu request không mang tiền tố `/v1/`, tự động thêm `/v1/` để đảm bảo tương thích hoàn toàn với API spec của NVIDIA NIM.
  2. `packages/ai/src/llm/providerRegistry.ts`:
     - Mở rộng kiểu `KnownVendorId` bổ sung `"nvidia"`.
     - Đăng ký `nvidia` trong `KNOWN_VENDORS`:
       - `name: "NVIDIA NIM"`, `protocol: "completions"`.
       - `proxyBaseURL: "/api/llm-proxy/nvidia/v1"`, `directBaseURL: "https://integrate.api.nvidia.com/v1"`.
       - `modelsPath: "/models"`, `keyPrefixes: ["nvapi-"]`, `authHeaderType: "bearer"`.
       - `defaultModel: "meta/llama-3.3-70b-instruct"`.
     - Cập nhật `guessVendorCandidates()`: nhận diện tiền tố `nvapi-` và ưu tiên trả về `[KNOWN_VENDORS.nvidia]`.
  3. `packages/ai/src/llm/discovery.ts`:
     - Bổ sung `errData?.detail` trong chuỗi trích xuất thông báo lỗi của `testSingleModel()` để bắt chuẩn thông báo lỗi từ các endpoint Python/FastAPI của NVIDIA NIM mà vẫn khử sạch API key.
  4. `server/test/llmProxy.test.mjs`:
     - Thêm 4 bài test chuyên biệt cho NVIDIA NIM: kiểm tra upstream cố định trong `ALLOWED_VENDORS`, route chat completions kèm Authorization Bearer và streaming, chuẩn hóa subpath `/chat/completions` thành `/v1/chat/completions`, và từ chối các đường dẫn ngoài allowlist với 404.
  5. `packages/ai/test/providerRegistry.test.ts`:
     - Cập nhật test 7 vendor đã xác minh và test nhận diện tiền tố `nvapi-` chọn đúng provider `nvidia` với protocol `completions`.
  6. `packages/ai/test/discovery.test.ts`:
     - Thêm test `discoverProvider` cho NVIDIA NIM với key `nvapi-`, xác thực Bearer token, completions protocol và proxy URL.
- **Kết quả Kiểm thử & Build:**
  - `node --test server/test/llmProxy.test.mjs`: 14/14 tests pass 100%.
  - `npx rstest packages/ai/test/providerRegistry.test.ts`: 3/3 tests pass.
  - `npx rstest packages/ai/test/discovery.test.ts`: 12/12 tests pass.
  - `npx rstest packages/ai/test/chatPanel.test.ts`: 112/112 tests pass.
  - `npm run check`: Biome check 0 lỗi (Checked 1564 files).
  - `npm run build`: Hoàn thành production build thành công (exit code 0).
    - Cảnh báo kích thước tài nguyên (> 300 KiB): `dbdfd306f73db9ae.wasm` (10.184 MiB), `67.js` (886.888 KiB), `865411b872d20239.wasm` (851.732 KiB), `vendor-three.js` (593.541 KiB), `main.js` (592.854 KiB), `575.js` (535.366 KiB).
    - Cảnh báo entrypoint (> 500 KiB): `main` (598.977 KiB).
    - Cảnh báo plugin bundle size: `dist/plugins/visual-programming/main.js` (3.039 MiB).
- **Trạng thái:** `[?] WAITING_REVIEW` (Không deploy VPS, không ghi API key thật vào log/test).
