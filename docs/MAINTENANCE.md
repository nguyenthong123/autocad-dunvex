# SỔ TAY VẬN HÀNH, TRIỂN KHAI & BẢO TRÌ DỰ ÁN DUNVEX CAD (CHILI3D)

Tài liệu này là **Hồ sơ kỹ thuật & Bảo trì trung tâm (Operations & Maintenance Handbook)** cho dự án **Dunvex CAD**. Mọi thông tin kết nối máy chủ VPS, khóa SSH, cấu hình biến môi trường (`.env`), quy trình đóng gói, sao lưu dữ liệu và khắc phục sự cố đều được quy chuẩn tại đây để phục vụ công tác vận hành lâu dài.

---

## 1. Cấu trúc File Cấu hình Môi trường (`.env` & `.env.example`)

Toàn bộ thông tin nhạy cảm và thông số hạ tầng được lưu trong file **`.env`** tại thư mục gốc của dự án (`/Volumes/DATA_SSD/Projects/autocad-dunvex/.env`).
- **Tuyệt đối không commit file `.env` lên GitHub** (đã được chặn trong `.gitignore`).
- File **`.env.example`** được lưu trên Git làm khuôn mẫu khai báo cho các lần cài đặt hoặc chuyển máy sau này.

### Bảng kê khai các biến trong `.env`

| Tên biến | Giá trị mẫu / Mặc định | Ý nghĩa & Vai trò trong dự án |
| :--- | :--- | :--- |
| `PROJECT_NAME` | `autocad-dunvex` | Tên định danh dự án và dịch vụ Docker Compose. |
| `GITHUB_USER` | `nguyenthong123` | Tài khoản GitHub sở hữu mã nguồn dự án. |
| `GITHUB_REPO` | `autocad-dunvex` | Tên Repository trên GitHub. |
| `GITHUB_REMOTE_URL` | `https://github.com/nguyenthong123/autocad-dunvex.git` | Đường dẫn Git Remote `origin` để đồng bộ mã nguồn. |
| `GITHUB_TOKEN` | `ghp_xxxxxxxxxxxxxxxxxxxx` | *(Tùy chọn)* Personal Access Token dùng để tạo repo / push tự động qua API. |
| `VPS_PROVIDER` | `Google_Cloud_Compute_Engine` | Nhà cung cấp hạ tầng máy chủ đám mây. |
| `VPS_PROJECT_ID` | `dunvex-cad` | Project ID trên Google Cloud. |
| `VPS_INSTANCE_NAME` | `cad-server` | Tên máy ảo (VM Instance) trên Compute Engine. |
| `VPS_ZONE` | `us-west1-a` | Vùng (Zone) đặt máy chủ VPS. |
| `VPS_INTERNAL_IP` | `10.138.0.2` | Địa chỉ IP nội bộ (Internal IP) của VPS trong mạng VPC. |
| `VPS_HOST` | `136.66.95.155` | Địa chỉ External IP (IPv4 Public) của máy chủ VPS. |
| `VPS_PORT` | `22` | Cổng kết nối SSH của máy chủ VPS. |
| `VPS_USER` | `zomby` | Tài khoản người dùng SSH trên máy chủ VPS. |
| `VPS_SSH_KEY_PATH` | `/Users/zomby/.ssh/id_ed25519_autocad_dunvex` | Đường dẫn tuyệt đối tới khóa Private SSH riêng biệt của dự án trên máy Mac. |
| `VPS_DEPLOY_DIR` | `/opt/autocad-dunvex` | Thư mục chứa bản triển khai trên máy chủ VPS. |
| `APP_PUBLIC_PORT` | `80` | Cổng HTTP công khai chính trên VPS ánh xạ vào container Nginx (`chili3d`). |
| `APP_FALLBACK_PORT` | `8080` | Cổng HTTP dự phòng trên VPS ánh xạ vào container Nginx (`chili3d`). |
| `STORAGE_API_PORT` | `3000` | Cổng nội bộ của dịch vụ Backend `storage-api` (`server/storageServer.mjs`). |
| `STORAGE_DATA_DIR` | `/data/storage` | Đường dẫn lưu trữ dữ liệu bản vẽ JSON bên trong Docker Volume `chili3d-data`. |
| `APP_DOMAIN` | *(Trống hoặc `cad.dunvex.com`)* | Tên miền truy cập ứng dụng (nếu có cấu hình DNS). |

---

## 2. Thông tin Khóa SSH Riêng biệt của Dự án

Dự án sử dụng một cặp khóa SSH Ed25519 độc lập để không trùng lặp với bất kỳ máy chủ nào khác:

- **Private Key (trên máy Local):** `/Users/zomby/.ssh/id_ed25519_autocad_dunvex`
- **Public Key (đăng ký trên Google Cloud VM):** `/Users/zomby/.ssh/id_ed25519_autocad_dunvex.pub`
- **Nội dung Public Key:**
  ```text
  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMPxon2lokSlu/KB1bRUH7cMWBdmJeSxCGk7QKnQVnJe zomby
  ```
- **Câu lệnh kết nối SSH trực tiếp vào VPS:**
  ```bash
  source .env
  ssh -i "$VPS_SSH_KEY_PATH" -p "${VPS_PORT:-22}" "$VPS_USER@$VPS_HOST"
  ```

---

## 3. Kiến trúc Triển khai trên VPS 1GB RAM (Zero-Compile Deployment)

Do máy chủ VPS có cấu hình thực tế (**2 vCPU / 953 MB RAM**, kiểm tra bằng lệnh `nproc` và `free -m`), toàn bộ quá trình biên dịch nặng (Rspack, SWC, TypeScript, WebAssembly ~30MB) **bắt buộc thực hiện trên máy Local**. Máy chủ VPS chỉ nhận gói tài sản tĩnh đã đóng gói (`dist/`), dịch vụ lưu trữ siêu nhẹ (`server/storageServer.mjs`) và chạy qua Docker Compose:

> **Lệnh tự kiểm tra cấu hình phần cứng VPS:**
> ```bash
> # Kiểm tra số lượng vCPU (kết quả đo thực tế trên VPS: 2 vCPU):
> nproc
> # Kiểm tra dung lượng RAM và Swap (kết quả đo thực tế: 953 MB RAM, 2047 MB Swap):
> free -m
> ```

```
[ Người dùng (Trình duyệt) ]
         │
         ▼  HTTP (Cổng 80 / 8080)
┌──────────────────────────────────────────────────────────┐
│ Máy chủ VPS (2 vCPU / 953 MB RAM) - /opt/autocad-dunvex  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Container 1: chili3d (nginx:alpine - Max 128MB)    │  │
│  │  ├─ Phục vụ tĩnh: /usr/share/nginx/html (dist/)    │  │
│  │  │   + Bật nén Gzip cho chili-wasm.wasm (~30MB)    │  │
│  │  │   + Cache immutable 365 ngày cho .wasm          │  │
│  │  └─ Reverse Proxy: /api/* ──────────────────────┐  │  │
│  └─────────────────────────────────────────────────┼──┘  │
│                                                    ▼     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Container 2: storage-api (node:22-alpine - Max 64M)│  │
│  │  ├─ Chạy: node server/storageServer.mjs (Port 3000)│  │
│  │  └─ Lưu trữ bền vững: Volume chili3d-data          │  │
│  │      (/data/storage/chili3d/documents/*.json)      │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Quy trình Cập nhật & Deploy Phiên bản Mới (1-Click Deploy)

Mỗi khi chỉnh sửa tính năng tại máy Local và muốn cập nhật lên VPS:

### Bước 1: Kiểm thử và Build tại máy Local
```bash
npm run test
SKIP_TYPECHECK=true NODE_ENV=production npm run build
```

### Bước 2: Đẩy mã nguồn lên GitHub
```bash
git add -A
git commit -m "✨ feat: cập nhật tính năng Dunvex CAD"
git push origin dev
```

### Bước 3: Chạy Script Deploy lên VPS
```bash
bash scripts/deploy-vps.sh
```
*(Script `scripts/deploy-vps.sh` sẽ tự động đọc thông số từ `.env`, nén thư mục `dist/`, `server/`, `Dockerfile`, `nginx.conf`, `compose.yml`, chuyển qua SSH lên `$VPS_DEPLOY_DIR` và khởi động lại Docker Compose).*

---

## 5. Các Lệnh Bảo trì & Xử lý Sự cố Thường gặp trên VPS

Sau khi SSH vào máy chủ VPS (`cd /opt/autocad-dunvex`):

1. **Kiểm tra trạng thái các Container và mức tiêu thụ RAM:**
   ```bash
   docker compose ps
   docker stats --no-stream
   ```
2. **Xem nhật ký hoạt động (Logs) của Web Server và Cloud Storage API:**
   ```bash
   docker compose logs -f --tail=100
   ```
3. **Khởi động lại dịch vụ:**
   ```bash
   docker compose up -d --build --force-recreate
   ```
4. **Sao lưu (Backup) toàn bộ bản vẽ của người dùng trên VPS về máy Mac:**
   ```bash
   source .env
   ssh -i "$VPS_SSH_KEY_PATH" "$VPS_USER@$VPS_HOST" \
     "docker run --rm -v autocad-dunvex_chili3d-data:/data alpine tar -czf - -C /data ." \
     > backup-drawings-$(date +%Y%m%d).tar.gz
   ```
5. **Khôi phục (Restore) dữ liệu bản vẽ từ file Backup:**
   ```bash
   source .env
   cat backup-drawings-YYYYMMDD.tar.gz | ssh -i "$VPS_SSH_KEY_PATH" "$VPS_USER@$VPS_HOST" \
     "docker run --rm -i -v autocad-dunvex_chili3d-data:/data alpine tar -xzf - -C /data"
   ```

---

## 6. Nhật ký Triển khai Thực tế (Deployment Record)

- **Thời gian hoàn tất:** 31/10/2026 20:05 (GMT+7)
- **Hạ tầng máy chủ:** Google Cloud Compute Engine (Instance: `cad-server`, Zone: `us-west1-a`, RAM: 1GB)
- **Địa chỉ IP Public:** `136.66.95.155`
- **Đường link truy cập Web:** [http://136.66.95.155](http://136.66.95.155)
- **Bộ nhớ đệm chống OOM (Swap):** 2.0 GB active tại `/swapfile`
- **Trạng thái Dịch vụ Container:**
  - `autocad-dunvex-chili3d-1` (Nginx WebAssembly + Static assets): `Up` (Cổng `80`, RAM tiêu thụ: `~11.0 MiB / 128 MiB`)
  - `autocad-dunvex-storage-api-1` (Node.js REST API Cloud Storage): `Up` (RAM tiêu thụ: `~26.0 MiB / 64 MiB`)
  - **Tổng RAM tiêu thụ của cả hệ thống container:** `~37.0 MiB` (tiết kiệm tối đa tài nguyên trên VPS 1GB RAM)
- **Kiểm thử nghiệm thu trực tiếp:**
  - `curl -I http://136.66.95.155` -> `HTTP/1.1 200 OK`
  - Ghi bản vẽ (`PUT /api/storage/chili3d/recents/...`) -> `{"ok":true}`
  - Đọc danh sách bản vẽ (`GET /api/storage/chili3d/recents?page=0&count=20`) -> Trả về mảng JSON chính xác
  - Xóa bản vẽ (`DELETE /api/storage/chili3d/recents/...`) -> `{"ok":true}`

