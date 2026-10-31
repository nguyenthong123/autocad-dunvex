# TASK-01: Thiết lập môi trường Local, cấu hình Build & tối ưu Deploy cho VPS 1GB RAM

- **ID:** `TASK-01`
- **Tiêu đề:** Thiết lập môi trường Local, cấu hình Build & tối ưu Deploy cho VPS 1GB RAM
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Cao nhất (P0 - Blocker)
- **Độ khó:** Trung bình

---

## 1. Mục tiêu (Objective)

Thiết lập quy trình phát triển tại máy trạm cá nhân (Local Development) và tối ưu hóa cấu hình đóng gói Rspack (`rspack.config.ts`), cấu hình Docker (`Dockerfile`, `compose.yml`) và máy chủ web Nginx để ứng dụng **Chili3D** có thể:
1. Chạy mượt mà ở môi trường Local mà không cần biên dịch lại lõi C++ WebAssembly (`packages/wasm/lib/chili-wasm.wasm` đã có sẵn bản prebuilt).
2. Đóng gói bản Production (`npm run build`) trên máy chủ VPS giới hạn chỉ **1GB RAM** mà không bị lỗi tràn bộ nhớ (`JavaScript heap out of memory` hoặc `OOM Killer` từ tiến trình kiểm tra kiểu `TsCheckerRspackPlugin`).
3. Phục vụ các tài sản tĩnh dung lượng lớn (đặc biệt là file `.wasm` của OCCT và Garlic) với cơ chế nén Gzip/Brotli, đúng MIME type `application/wasm` và bộ nhớ đệm (Cache-Control) tối ưu.

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `package.json` | Chỉnh sửa | Quản lý scripts (`dev`, `build`, `check`, `test`) và khai báo workspaces (`packages/*`, `plugins/*`). |
| `rspack.config.ts` | Chỉnh sửa | Cấu hình bundler Rspack: điểm vào `./packages/web/src/index.ts`, xử lý `.wasm`, `.css`, `TsCheckerRspackPlugin`, `SwcJsMinimizerRspackPlugin`. |
| `Dockerfile` | Chỉnh sửa | Cấu hình đóng gói Docker multi-stage (`node:alpine` sang `nginx:alpine`). |
| `compose.yml` | Chỉnh sửa | Cấu hình khởi chạy dịch vụ Docker Compose và giới hạn tài nguyên container. |
| `nginx.conf` | Tạo mới | Cấu hình máy chủ Nginx tối ưu cho tệp WebAssembly (`.wasm`), nén Gzip và định tuyến SPA. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Thiết lập môi trường Local Development

Lõi hình học C++ OpenCascade đã được biên dịch sẵn tại `packages/wasm/lib/chili-wasm.wasm` và bộ giải ràng buộc Sketch 2D tại `packages/parametric/lib/garlic_bg.wasm`. Do đó, ở môi trường Local, không cần chạy `npm run build:wasm` trừ khi sửa mã nguồn C++ trong `cpp/src/`.

1. Cài đặt phụ thuộc (yêu cầu Node.js >= 22.x):
   ```bash
   npm ci
   ```
2. Khởi chạy máy chủ phát triển Rspack Dev Server (mặc định tại `http://localhost:8080`):
   ```bash
   npm run dev
   ```

### Bước 3.2: Tối ưu `rspack.config.ts` cho môi trường ít RAM (VPS 1GB RAM)

Trong file `rspack.config.ts` hiện tại (dòng 63), `new TsCheckerRspackPlugin()` luôn được khởi chạy bất kể môi trường nào. Khi chạy `npm run build` trên VPS 1GB RAM, tiến trình kiểm tra kiểu TypeScript song song cùng Rspack và `CircularDependencyRspackPlugin` sẽ tiêu tốn hơn 900MB RAM và gây sập tiến trình (OOM).

Cập nhật `rspack.config.ts` để cho phép tắt `TsCheckerRspackPlugin` thông qua biến môi trường `SKIP_TYPECHECK=true` khi build trên VPS, đồng thời tách chunk hợp lý:

```ts
// File: rspack.config.ts
import { resolve } from "node:path";
import { defineConfig } from "@rspack/cli";
import rspack from "@rspack/core";
import { TsCheckerRspackPlugin } from "ts-checker-rspack-plugin";
import packages from "./package.json" with { type: "json" };

const isProduction = process.env.NODE_ENV === "production";
const skipTypeCheck = process.env.SKIP_TYPECHECK === "true";
const configDir = import.meta.dirname;

export default defineConfig({
    devtool: isProduction ? false : "source-map",
    entry: {
        main: "./packages/web/src/index.ts",
    },
    experiments: {
        css: true,
    },
    // ... giữ nguyên phần module.rules và resolve ...
    plugins: [
        ...(!skipTypeCheck ? [new TsCheckerRspackPlugin()] : []),
        new rspack.CircularDependencyRspackPlugin({
            failOnError: true,
            exclude: /node_modules/,
        }),
        new rspack.CopyRspackPlugin({
            patterns: [
                {
                    from: resolve(configDir, "public"),
                    globOptions: {
                        ignore: ["**/**/index.html"],
                    },
                },
            ],
        }),
        new rspack.DefinePlugin({
            __APP_VERSION__: JSON.stringify(packages.version),
            __DOCUMENT_VERSION__: JSON.stringify(packages.documentVersion),
            __IS_PRODUCTION__: JSON.stringify(isProduction),
        }),
        new rspack.HtmlRspackPlugin({
            template: resolve(configDir, "public/index.html"),
            inject: "body",
        }),
    ],
    optimization: {
        splitChunks: isProduction
            ? {
                  chunks: "all",
                  cacheGroups: {
                      three: {
                          test: /[\\/]node_modules[\\/]three[\\/]/,
                          name: "vendor-three",
                          priority: 20,
                      },
                  },
              }
            : false,
        minimizer: [
            new rspack.SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                    mangle: {
                        keep_classnames: true,
                        keep_fnames: true,
                    },
                },
            }),
            new rspack.LightningCssMinimizerRspackPlugin(),
        ],
    },
    output: {
        clean: true,
    },
});
```

> **Lưu ý quan trọng:** Tuyệt đối giữ nguyên cấu hình `keep_classnames: true` và `keep_fnames: true` trong `SwcJsMinimizerRspackPlugin` vì hệ thống `@serializable()` trong `packages/core/src/serialize/serializer.ts` dựa vào tên class lúc runtime để lưu và đọc bản vẽ.

### Bước 3.3: Tạo cấu hình `nginx.conf` tối ưu cho WebAssembly

Tạo file `nginx.conf` ở thư mục gốc để cấu hình nén Gzip cho file `.wasm` (giúp giảm dung lượng tải `chili-wasm.wasm` từ hàng chục MB xuống ~5-7MB qua mạng) và thiết lập cache dài hạn:

```nginx
# File: nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    include /etc/nginx/mime.types;
    types {
        application/wasm wasm;
    }

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/wasm
        image/svg+xml;

    # Cache dài hạn cho file .wasm và bundle có hash
    location ~* \.(wasm|cur|woff2?)$ {
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Bước 3.4: Nâng cấp `Dockerfile` và `compose.yml` cho VPS 1GB RAM

1. Thiết lập Swap 2GB trên VPS Linux trước khi chạy Docker build:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

2. Cập nhật `Dockerfile` sử dụng `NODE_OPTIONS="--max-old-space-size=768"` và `SKIP_TYPECHECK=true`:
   ```dockerfile
   # File: Dockerfile
   FROM node:22-alpine AS builder
   WORKDIR /app

   COPY package.json package-lock.json ./
   COPY packages/ai/package.json ./packages/ai/
   COPY packages/app/package.json ./packages/app/
   COPY packages/builder/package.json ./packages/builder/
   COPY packages/core/package.json ./packages/core/
   COPY packages/element/package.json ./packages/element/
   COPY packages/i18n/package.json ./packages/i18n/
   COPY packages/mcp/package.json ./packages/mcp/
   COPY packages/parametric/package.json ./packages/parametric/
   COPY packages/storage/package.json ./packages/storage/
   COPY packages/three/package.json ./packages/three/
   COPY packages/ui/package.json ./packages/ui/
   COPY packages/wasm/package.json ./packages/wasm/
   COPY packages/web/package.json ./packages/web/

   RUN npm ci --no-audit --no-fund

   COPY . .
   ENV NODE_ENV=production
   ENV SKIP_TYPECHECK=true
   ENV NODE_OPTIONS="--max-old-space-size=768"
   RUN npm run build

   FROM nginx:alpine
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   COPY --from=builder /app/dist /usr/share/nginx/html
   EXPOSE 80
   ```

3. Cập nhật `compose.yml` để giới hạn bộ nhớ container runtime (Nginx chỉ cần ~32MB - 64MB RAM):
   ```yaml
   # File: compose.yml
   services:
     chili3d:
       build:
         context: .
         dockerfile: Dockerfile
       restart: unless-stopped
       ports:
         - "8080:80"
       deploy:
         resources:
           limits:
             memory: 128M
   ```

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] Chạy `npm run dev` tại máy Local, mở trình duyệt tại `http://localhost:8080`, màn hình `Loading` biến mất và giao diện `Home` hiển thị không có lỗi trong Console.
- [x] Chạy `SKIP_TYPECHECK=true NODE_ENV=production npm run build` thành công, thư mục `dist/` sinh ra đầy đủ `index.html`, file `.wasm`, `iconfont.js` và các gói JS/CSS.
- [x] Khởi tạo bản vẽ mới (`New Document`), tạo thử một khối `Box` và lưu bản vẽ (`Ctrl+S`), sau đó tải lại trang và mở lại bản vẽ từ danh sách `Recent` để xác nhận `SwcJsMinimizerRspackPlugin` không làm hỏng tên class `@serializable()`.
- [x] Mở tab **Network** trên Chrome DevTools khi chạy qua Docker Nginx (`http://localhost:8080`):
  - File `.wasm` trả về `Content-Type: application/wasm`.
  - Header phản hồi có `Content-Encoding: gzip` và `Cache-Control: public, max-age=31536000, immutable`.
- [x] Kiểm tra mức tiêu thụ RAM của container runtime bằng lệnh `docker stats`: mức sử dụng bộ nhớ của container `chili3d` nằm dưới ngưỡng `50MB`.
