# TASK-06: Chuyển đổi cơ chế lưu trữ từ IndexedDB (Trình duyệt) sang Backend API / Cloud Storage trên VPS

- **ID:** `TASK-06`
- **Tiêu đề:** Chuyển đổi cơ chế lưu trữ từ IndexedDB (Trình duyệt) sang Backend API / Cloud Storage trên VPS
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Trung bình - Cao (P2)
- **Độ khó:** Khó (Hard)

---

## 1. Mục tiêu (Objective)

Mặc định, Chili3D lưu trữ toàn bộ bản vẽ và danh sách mở gần đây vào **IndexedDB của trình duyệt** thông qua lớp `IndexedDBStorage` (`packages/storage/src/indexedDBStorage.ts`) được khởi tạo tại `AppBuilder.useIndexedDB()` (`packages/builder/src/appBuilder.ts`). Cơ chế này khiến dữ liệu bị bó buộc vào một máy tính/trình duyệt duy nhất và có nguy cơ mất trắng khi người dùng xóa bộ nhớ đệm trình duyệt.

Mục tiêu của Task này là:
1. Xây dựng lớp **`ApiCloudStorage`** thực thi đúng chuẩn giao diện `IStorage` (`packages/core/src/foundation/storage.ts`) với 5 phương thức: `createDBIfNeeded`, `get`, `put`, `delete`, `page`, kèm cơ chế dự phòng ngoại tuyến (Offline Fallback về `IndexedDBStorage` khi mất kết nối mạng).
2. Bổ sung phương thức `.useCloudStorage(apiBaseUrl?: string)` vào `AppBuilder` (`packages/builder/src/appBuilder.ts`) và kích hoạt tại `packages/web/src/index.ts`.
3. Triển khai một dịch vụ **Backend API siêu nhẹ** (sử dụng Node.js + SQLite / File System, tiêu thụ dưới `40MB RAM`) chạy cùng Nginx trên VPS 1GB RAM để lưu trữ dữ liệu JSON bản vẽ (`DocumentTable`) và ảnh thu nhỏ (`RecentTable`).

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `packages/core/src/foundation/storage.ts` | Tham chiếu | Định nghĩa hợp đồng giao diện `IStorage` (`createDBIfNeeded`, `get`, `put`, `delete`, `page`). |
| `packages/storage/src/apiCloudStorage.ts` | Tạo mới | Triển khai `IStorage` giao tiếp qua HTTP REST API (`fetch`) tới Backend trên VPS, tích hợp cache/fallback với `IndexedDBStorage`. |
| `packages/storage/src/index.ts` | Chỉnh sửa | Export thêm `ApiCloudStorage` và `CloudStorageOptions` bên cạnh `IndexedDBStorage`. |
| `packages/storage/test/apiCloudStorage.test.ts` | Tạo mới | Unit test kiểm thử `ApiCloudStorage` (HTTP `GET`, `PUT`, `DELETE`, `page` và cơ chế Offline Fallback về `IndexedDBStorage`). |
| `packages/builder/src/appBuilder.ts` | Chỉnh sửa | Bổ sung phương thức `useCloudStorage(baseUrl?: string)` vào chuỗi khởi tạo `AppBuilder`. |
| `packages/builder/test/appBuilder.test.ts` | Chỉnh sửa | Bổ sung kiểm thử cho `useCloudStorage` trong `AppBuilder`. |
| `packages/web/src/index.ts` | Chỉnh sửa | Chuyển `.useIndexedDB()` sang `.useCloudStorage("/api/storage")`. |
| `server/storageServer.mjs` | Tạo mới | Dịch vụ Backend REST API siêu nhẹ bằng Node.js thuần (`node:http`, `node:fs/promises`) lưu trữ bản vẽ JSON trên ổ cứng VPS, tiêu thụ `< 35MB RAM`. |
| `nginx.conf` & `compose.yml` | Chỉnh sửa | Cấu hình Reverse Proxy `/api/` sang container `storage-api` và khai báo volume lưu trữ bền vững `chili3d-data`. |
| `packages/app/src/document.ts` | Tham chiếu | Hàm `save()` (dòng 94-112) và `Document.open()` (dòng 130-145) gọi trực tiếp `this.application.storage.put(...)` và `get(...)`. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Phân tích giao diện `IStorage` và luồng dữ liệu của `Document`

Trong `packages/core/src/foundation/storage.ts` và `packages/core/src/constants.ts`:
- `Constants.DBName` = `"chili3d"`
- `Constants.DocumentTable` = `"documents"` (lưu đối tượng `Serialized` của bản vẽ gồm `version`, `id`, `name`, `models`, `variables`, `acts`, `userData`).
- `Constants.RecentTable` = `"recents"` (lưu đối tượng `RecentDocumentDTO` gồm `id`, `name`, `date`, `image` dạng DataURL Base64).

Mọi thao tác trong `Document.save()`, `Document.open()` (`packages/app/src/document.ts`) và `Home.getDocuments()`, `Home.deleteIcon()` (`packages/ui/src/home/home.ts`) đều chỉ gọi thông qua `app.storage` (kiểu `IStorage`). Nhờ thiết kế tách biệt giao diện (Interface-driven) của Chili3D, ta **không cần sửa bất kỳ dòng code nào trong `Document` hay `Home`** khi chuyển sang Cloud Storage.

### Bước 3.2: Tạo lớp `ApiCloudStorage` tại `packages/storage/src/apiCloudStorage.ts`

Tạo file `packages/storage/src/apiCloudStorage.ts` thực thi `IStorage` kết hợp đồng bộ hai chiều với `IndexedDBStorage` để đảm bảo tốc độ phản hồi nhanh và không bao giờ mất dữ liệu nếu rớt mạng:

```ts
// File: packages/storage/src/apiCloudStorage.ts
// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IStorage, Logger } from "@chili3d/core";
import { IndexedDBStorage } from "./indexedDBStorage";

export interface CloudStorageOptions {
    baseUrl?: string;
    getAuthToken?: () => string | undefined;
    enableLocalFallback?: boolean;
}

export class ApiCloudStorage implements IStorage {
    private readonly _baseUrl: string;
    private readonly _getAuthToken?: () => string | undefined;
    private readonly _fallback?: IndexedDBStorage;

    constructor(options: CloudStorageOptions = {}) {
        this._baseUrl = (options.baseUrl ?? "/api/storage").replace(/\/+$/, "");
        this._getAuthToken = options.getAuthToken;
        if (options.enableLocalFallback !== false && typeof window !== "undefined" && window.indexedDB) {
            this._fallback = new IndexedDBStorage();
        }
    }

    private headers(): HeadersInit {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        const token = this._getAuthToken?.();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    }

    async createDBIfNeeded(database: string, tables: string[]): Promise<void> {
        if (this._fallback) {
            await this._fallback.createDBIfNeeded(database, tables);
        }
    }

    async get(database: string, table: string, id: string): Promise<any> {
        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.headers(),
            });
            if (response.ok) {
                const data = await response.json();
                // Cập nhật bản sao cục bộ
                await this._fallback?.put(database, table, id, data);
                return data;
            }
            if (response.status === 404) {
                return undefined;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        } catch (err) {
            Logger.warn(`CloudStorage get failed, falling back to IndexedDB: ${String(err)}`);
            return this._fallback?.get(database, table, id);
        }
    }

    async put(database: string, table: string, id: string, value: any): Promise<boolean> {
        // Lưu bản sao cục bộ trước để đảm bảo an toàn dữ liệu tức thì
        if (this._fallback) {
            await this._fallback.put(database, table, id, value);
        }

        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        try {
            const response = await fetch(url, {
                method: "PUT",
                headers: this.headers(),
                body: JSON.stringify(value),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return true;
        } catch (err) {
            Logger.error(`CloudStorage put failed (saved locally in IndexedDB): ${String(err)}`);
            return this._fallback !== undefined;
        }
    }

    async delete(database: string, table: string, id: string): Promise<boolean> {
        if (this._fallback) {
            await this._fallback.delete(database, table, id);
        }

        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        try {
            const response = await fetch(url, {
                method: "DELETE",
                headers: this.headers(),
            });
            return response.ok;
        } catch (err) {
            Logger.warn(`CloudStorage delete failed: ${String(err)}`);
            return false;
        }
    }

    async page(database: string, table: string, page: number): Promise<any[]> {
        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}?page=${page}&count=20`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.headers(),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const items = (await response.json()) as any[];
            return items;
        } catch (err) {
            Logger.warn(`CloudStorage page failed, falling back to IndexedDB: ${String(err)}`);
            return (await this._fallback?.page(database, table, page)) ?? [];
        }
    }
}
```

### Bước 3.3: Export `ApiCloudStorage` và đăng ký vào `AppBuilder`

1. Mở `packages/storage/src/index.ts` và export thêm `ApiCloudStorage`:
   ```ts
   // File: packages/storage/src/index.ts
   export * from "./indexedDBStorage";
   export * from "./apiCloudStorage";
   ```

2. Mở `packages/builder/src/appBuilder.ts` và thêm phương thức `useCloudStorage()` ngay dưới `useIndexedDB()` (dòng 66-78):
   ```ts
   // File: packages/builder/src/appBuilder.ts
   useCloudStorage(baseUrl: string = "/api/storage") {
       this._inits.push(async () => {
           Logger.info(`initializing ApiCloudStorage (${baseUrl})`);

           const db = await import("@chili3d/storage");
           this._storage = new db.ApiCloudStorage({ baseUrl });
           await this._storage.createDBIfNeeded(Constants.DBName, [
               Constants.DocumentTable,
               Constants.RecentTable,
           ]);
       });
       return this;
   }
   ```

3. Mở `packages/web/src/index.ts` (dòng 61-67) và thay `.useIndexedDB()` bằng `.useCloudStorage()`:
   ```ts
   // File: packages/web/src/index.ts
   new AppBuilder()
       .useCloudStorage("/api/storage")
       .useWasmOcc()
       .useParametric()
       .useThree()
       .useUI()
       .build()
       .then(handleApplicaionBuilt)
   ```

### Bước 3.4: Tạo dịch vụ Backend API siêu nhẹ (`server/storageServer.mjs`) và tích hợp Docker / Nginx

Để tiết kiệm tối đa bộ nhớ trên VPS 1GB RAM mà không cần cài thêm bất kỳ thư viện ngoài nào (`0 dependencies`), tạo file `server/storageServer.mjs` sử dụng `node:http` và `node:fs/promises` tích hợp sẵn trong Node.js 22:

```js
// File: server/storageServer.mjs
// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data/storage");

function sanitizeSegment(seg) {
    return decodeURIComponent(seg).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getTableDir(db, table) {
    return path.join(DATA_DIR, sanitizeSegment(db), sanitizeSegment(table));
}

function getRecordPath(db, table, id) {
    return path.join(getTableDir(db, table), `${sanitizeSegment(id)}.json`);
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(JSON.stringify(payload));
}

export const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const match = url.pathname.match(/^\/api\/storage\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) {
        sendJson(res, 404, { error: "Not Found" });
        return;
    }

    const [, db, table, id] = match;

    try {
        if (req.method === "GET" && !id) {
            const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10));
            const count = Math.max(1, Number.parseInt(url.searchParams.get("count") ?? "20", 10));
            const dir = getTableDir(db, table);
            await mkdir(dir, { recursive: true });
            const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
            const items = [];
            for (const f of files) {
                try {
                    const raw = await readFile(path.join(dir, f), "utf8");
                    items.push(JSON.parse(raw));
                } catch {
                    // ignore corrupted entry
                }
            }
            items.sort((a, b) => Number(b?.date ?? 0) - Number(a?.date ?? 0));
            const slice = items.slice(page * count, (page + 1) * count);
            sendJson(res, 200, slice);
            return;
        }

        if (req.method === "GET" && id) {
            const filePath = getRecordPath(db, table, id);
            try {
                const raw = await readFile(filePath, "utf8");
                sendJson(res, 200, JSON.parse(raw));
            } catch {
                sendJson(res, 404, { error: "Record not found" });
            }
            return;
        }

        if (req.method === "PUT" && id) {
            const dir = getTableDir(db, table);
            await mkdir(dir, { recursive: true });
            const body = await readBody(req);
            const parsed = JSON.parse(body);
            await writeFile(getRecordPath(db, table, id), JSON.stringify(parsed), "utf8");
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "DELETE" && id) {
            await rm(getRecordPath(db, table, id), { force: true });
            sendJson(res, 200, { ok: true });
            return;
        }

        sendJson(res, 405, { error: "Method Not Allowed" });
    } catch (err) {
        sendJson(res, 500, { error: String(err) });
    }
});

if (import.meta.url === `file://${process.argv[1]}`) {
    server.listen(PORT, () => {
        console.log(`Dunvex CAD Cloud Storage API listening on port ${PORT}`);
    });
}
```

- **Cập nhật Reverse Proxy trong `nginx.conf`:**
  ```nginx
  location /api/ {
      client_max_body_size 50M;
      proxy_pass http://storage-api:3000/api/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
  }
  ```

- **Cập nhật `compose.yml` bổ sung dịch vụ `storage-api` (giới hạn RAM `64M`):**
  ```yaml
  services:
    chili3d:
      build:
        context: .
        dockerfile: Dockerfile
      restart: unless-stopped
      ports:
        - "8080:80"
      depends_on:
        - storage-api
      deploy:
        resources:
          limits:
            memory: 128M

    storage-api:
      image: node:22-alpine
      working_dir: /app
      volumes:
        - ./server:/app/server:ro
        - chili3d-data:/data/storage
      environment:
        - PORT=3000
        - DATA_DIR=/data/storage
      command: ["node", "server/storageServer.mjs"]
      restart: unless-stopped
      deploy:
        resources:
          limits:
            memory: 64M

  volumes:
    chili3d-data:
  ```

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] Mở trình duyệt, tạo bản vẽ mới, vẽ một số hình học 2D/3D và nhấn `Ctrl+S` (`doc.save`):
  - Kiểm tra tab **Network** trong Chrome DevTools: xuất hiện 2 request `PUT /api/storage/chili3d/documents/<id>` và `PUT /api/storage/chili3d/recents/<id>` trả về mã `200 OK`.
- [x] Mở một trình duyệt khác (hoặc cửa sổ Ẩn danh - Incognito) truy cập vào địa chỉ VPS:
  - Màn hình `Home` gọi `GET /api/storage/chili3d/recents?page=0&count=20` và hiển thị đầy đủ danh sách bản vẽ cùng ảnh thu nhỏ (`thumbnail`) đã lưu trước đó.
  - Nhấp vào bản vẽ trong danh sách `Recent`: ứng dụng tải dữ liệu từ `GET /api/storage/chili3d/documents/<id>` và tái dựng chính xác toàn bộ cây mô hình (`ModelManager`).
- [x] Kiểm thử chế độ mất kết nối (Offline Fallback): tắt dịch vụ Backend API, nhấn `Ctrl+S` trên trình duyệt — ứng dụng không bị treo mà tự động ghi xuống `IndexedDBStorage` cục bộ và hiển thị cảnh báo trong Console.
