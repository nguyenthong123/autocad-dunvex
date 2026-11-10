#!/usr/bin/env bash
# Part of the Chili3d Project, under the AGPL-3.0 License.
# Script tự động đóng gói tại máy Local và triển khai lên VPS 1GB RAM (Zero-Compile trên VPS).
# Hỗ trợ:
#   - Đóng gói tách biệt vào thư mục releases/${RELEASE_ID} trên VPS
#   - Giữ lại chunk hash cũ từ phiên bản trước để tab cũ không 404 khi tải async
#   - Hậu kiểm tính toàn vẹn gói build trước và sau khi kích hoạt
#   - Hỗ trợ rollback nhanh chóng: bash scripts/deploy-vps.sh --rollback
#   - Kiểm tra trạng thái: bash scripts/deploy-vps.sh --status
#   - Chế độ dry-run: bash scripts/deploy-vps.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
ROLLBACK=0
STATUS_ONLY=0

for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=1
            ;;
        --rollback)
            ROLLBACK=1
            ;;
        --status)
            STATUS_ONLY=1
            ;;
    esac
done

if [ ! -f ".env" ]; then
    echo "❌ Không tìm thấy file .env! Hãy sao chép từ .env.example và kiểm tra thông số."
    exit 1
fi

set -a
source ".env"
set +a

SSH_OPTS="-i ${VPS_SSH_KEY_PATH} -p ${VPS_PORT:-22} -o StrictHostKeyChecking=accept-new"

# -------------------------------------------------------------
# Chế độ: --status (Kiểm tra trạng thái bản phục vụ và rollback)
# -------------------------------------------------------------
if [ "$STATUS_ONLY" -eq 1 ]; then
    echo "============================================================"
    echo "🔍 KIỂM TRA TRẠNG THÁI TRIỂN KHAI TRÊN VPS: ${VPS_HOST}"
    echo "============================================================"
    ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
cd "${VPS_DEPLOY_DIR}"
echo "Current Release: \$(cat current_release 2>/dev/null || echo 'Chưa ghi nhận')"
echo "Rollback Release: \$(cat rollback_release 2>/dev/null || echo 'Chưa ghi nhận')"
echo ""
echo "Version endpoint (version.json):"
curl -s http://127.0.0.1/version.json || echo "Không thể kết nối"
echo ""
echo "Deploy version endpoint (deploy-version.json):"
curl -s http://127.0.0.1/deploy-version.json || echo "Không thể kết nối"
echo ""
echo "Danh sách các bản phát hành đã lưu trong releases/:"
ls -la releases/ 2>/dev/null || echo "Chưa có thư mục releases/"
EOF
    exit 0
fi

# -------------------------------------------------------------
# Chế độ: --rollback (Quay lui tức thì về bản phát hành trước đó)
# -------------------------------------------------------------
if [ "$ROLLBACK" -eq 1 ]; then
    echo "============================================================"
    echo "⏪ BẮT ĐẦU QUAY LUI (ROLLBACK) TRÊN VPS: ${VPS_HOST}"
    echo "============================================================"
    ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
cd "${VPS_DEPLOY_DIR}"

if [ ! -f "rollback_release" ]; then
    echo "❌ Không tìm thấy file rollback_release! Không thể xác định bản để quay lui."
    exit 1
fi

ROLLBACK_TARGET=\$(cat rollback_release | tr -d '[:space:]')
if [ -z "\$ROLLBACK_TARGET" ] || [ ! -d "releases/\$ROLLBACK_TARGET/dist" ]; then
    echo "❌ Thư mục releases/\$ROLLBACK_TARGET/dist không tồn tại hoặc không hợp lệ!"
    exit 1
fi

CURRENT=\$(cat current_release 2>/dev/null || echo "unknown")
echo "   -> Đang chuyển từ \$CURRENT sang \$ROLLBACK_TARGET..."

# Đồng bộ thư mục dist sang bản rollback mà không xóa dữ liệu lưu trữ
rm -rf dist.rollback.tmp
cp -r "releases/\$ROLLBACK_TARGET/dist" dist.rollback.tmp
rm -rf dist
mv dist.rollback.tmp dist

# Sao chép lại cấu hình đi kèm nếu có trong bản rollback
if [ -f "releases/\$ROLLBACK_TARGET/nginx.conf" ]; then
    cp "releases/\$ROLLBACK_TARGET/nginx.conf" nginx.conf
fi
if [ -f "releases/\$ROLLBACK_TARGET/compose.yml" ]; then
    cp "releases/\$ROLLBACK_TARGET/compose.yml" compose.yml
fi

echo "🐳 Khởi động lại container chili3d..."
sudo docker compose build --no-cache chili3d
sudo docker compose up -d --no-deps chili3d

echo "🩺 Kiểm tra sức khỏe sau khi rollback..."
sleep 2
STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/version.json || echo "000")
if [ "\$STATUS" = "200" ]; then
    echo "✅ Rollback thành công về bản \$ROLLBACK_TARGET (HTTP 200)"
    echo "\$ROLLBACK_TARGET" > current_release
    echo "\$CURRENT" > rollback_release
else
    echo "❌ Rollback thất bại! HTTP Status Code: \$STATUS"
    exit 1
fi
EOF
    echo "============================================================"
    echo "✅ ĐÃ HOÀN TẤT QUAY LUI VPS VỀ BẢN DỰ PHÒNG!"
    echo "============================================================"
    exit 0
fi

# -------------------------------------------------------------
# Chế độ: --dry-run
# -------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
    echo "============================================================"
    echo "🔍 CHẾ ĐỘ KIỂM TRA LỆNH (--dry-run) KHÔNG THAY ĐỔI MÁY CHỦ"
    echo "============================================================"
    echo "Mục tiêu VPS: ${VPS_USER}@${VPS_HOST}:${VPS_PORT:-22}"
    echo "Thư mục đích: ${VPS_DEPLOY_DIR}"
    echo ""
    echo "Các bước sẽ thực hiện:"
    echo "1. Build local có hash nội dung: SKIP_TYPECHECK=true NODE_ENV=production npm run build"
    echo "2. Đồng bộ version.json + deploy-version.json (scripts/version-sync.sh)"
    echo "3. Kiểm tra tính toàn vẹn gói dist/ tại local (validate_dist)"
    echo "4. Đóng gói release độc lập vào releases/\${RELEASE_ID}"
    echo "5. Đồng bộ chunk hash cũ vào bản mới để tránh 404 cho tab cũ"
    echo "6. Chuyển đổi bản phục vụ nguyên tử và kích hoạt container Docker"
    echo "7. Hậu kiểm tự động các endpoint (tự rollback nếu lỗi)"
    echo "============================================================"
    exit 0
fi

# -------------------------------------------------------------
# Hàm kiểm tra tính toàn vẹn dist/ tại local
# -------------------------------------------------------------
validate_dist() {
    local DIST_DIR="$1"
    local WANT_SHA="$2"

    echo "🔍 Đang kiểm tra tính toàn vẹn của bundle trước khi đóng gói..."

    node -e "
    const fs = require('fs');
    const path = require('path');

    const distDir = process.argv[1];
    const wantSha = process.argv[2];

    const indexPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
        console.error('❌ Thiếu file index.html!');
        process.exit(1);
    }
    const html = fs.readFileSync(indexPath, 'utf8');

    // Kiểm tra main JS có hash nội dung
    const match = html.match(/src=[\"'](main\.[0-9a-fA-F]{8}\.js)[\"']/);
    if (!match) {
        console.error('❌ index.html không tham chiếu main.[contenthash:8].js!');
        process.exit(1);
    }
    const mainJs = match[1];
    if (!fs.existsSync(path.join(distDir, mainJs))) {
        console.error('❌ File entry ' + mainJs + ' không tồn tại trên đĩa!');
        process.exit(1);
    }

    // Kiểm tra WASM
    const wasmFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.wasm'));
    if (wasmFiles.length < 2) {
        console.error('❌ Cần tối thiểu 2 file WASM (OCCT và Garlic), tìm thấy: ' + wasmFiles.length);
        process.exit(1);
    }
    for (const w of wasmFiles) {
        const sz = fs.statSync(path.join(distDir, w)).size;
        if (sz < 500000) {
            console.error('❌ File WASM ' + w + ' dung lượng bất thường: ' + sz + ' bytes');
            process.exit(1);
        }
    }

    // Kiểm tra version.json
    const verPath = path.join(distDir, 'version.json');
    if (!fs.existsSync(verPath)) {
        console.error('❌ Thiếu file version.json!');
        process.exit(1);
    }
    const ver = JSON.parse(fs.readFileSync(verPath, 'utf8'));
    if (wantSha && ver.codeSha !== wantSha) {
        console.error('❌ version.json ghi sai SHA: ' + ver.codeSha + ' !== ' + wantSha);
        process.exit(1);
    }

    console.log('   ✅ Đã kiểm tra tính toàn vẹn gói build: ' + mainJs + ', ' + wasmFiles.length + ' wasm, SHA ' + ver.codeShort);
    " "$DIST_DIR" "$WANT_SHA"
}

# -------------------------------------------------------------
# TIẾN TRÌNH TRIỂN KHAI CHÍNH THỨC
# -------------------------------------------------------------
echo "============================================================"
echo "🚀 BẮT ĐẦU TRIỂN KHAI DUNVEX CAD LÊN VPS: ${VPS_USER}@${VPS_HOST}"
echo "============================================================"

if [ ! -d "dist" ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
    echo "📦 [1/5] Đang đóng gói bản Production tại máy Local..."
    SKIP_TYPECHECK=true NODE_ENV=production npm run build
    rm -rf dist/.build-meta.json
    node -e "require('fs').writeFileSync('dist/.build-meta.json', JSON.stringify({sha: require('child_process').execSync('git rev-parse HEAD').toString().trim(), builtAt: new Date().toISOString()}, null, 2))"
    echo "   -> bằng chứng build: $(node -p "JSON.parse(require('fs').readFileSync('dist/.build-meta.json','utf8')).sha.slice(0,8)")"
else
    echo "📦 [1/5] Đã có sẵn thư mục dist/ (Đặt FORCE_BUILD=1 nếu muốn build lại)."
fi

# Đồng bộ version metadata
echo "🏷️  Kiểm bằng chứng build + đồng bộ version metadata (scripts/version-sync.sh)..."
TIP_SHA="$(git rev-parse HEAD)"
BRANCH_NAME="$(git symbolic-ref -q --short HEAD || echo "detached@${TIP_SHA:0:8}")"
source "$ROOT_DIR/scripts/version-sync.sh"
sync_version_files "dist" "$ROOT_DIR" "$TIP_SHA" "$BRANCH_NAME" || exit 1

# Hậu kiểm bundle cục bộ
validate_dist "dist" "$TIP_SHA"

RELEASE_ID="$(date -u +%Y%m%d_%H%M%S)_${TIP_SHA:0:8}"
echo "🏷️  Release ID: ${RELEASE_ID}"

echo "🛠️  [2/5] Kiểm tra môi trường VPS (Swap 2GB, Docker & Thư mục ${VPS_DEPLOY_DIR})..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
if [ "\$(swapon --show | wc -l)" -eq 0 ]; then
    echo "   -> Khởi tạo 2GB Swapfile cho VPS..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    fi
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "   -> Cài đặt Docker Engine & Docker Compose plugin..."
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "\$(whoami)" || true
fi

sudo mkdir -p "${VPS_DEPLOY_DIR}/releases"
sudo chown -R "\$(whoami)":"\$(whoami)" "${VPS_DEPLOY_DIR}"
EOF

echo "📤 [3/5] Đang đồng bộ gói độc lập vào releases/${RELEASE_ID} trên VPS..."
# Đóng gói và giải nén vào thư mục release độc lập (không xóa hay ghi đè dist đang chạy)
COPYFILE_DISABLE=1 tar --exclude="._*" -czf - dist server Dockerfile nginx.conf compose.yml .env.example | \
    ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
mkdir -p "${VPS_DEPLOY_DIR}/releases/${RELEASE_ID}"
tar -xzf - -C "${VPS_DEPLOY_DIR}/releases/${RELEASE_ID}"
EOF

echo "🔄 [4/5] Kích hoạt bản phát hành mới và Docker Container..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
cd "${VPS_DEPLOY_DIR}"

NEW_RELEASE_DIR="${VPS_DEPLOY_DIR}/releases/${RELEASE_ID}"

# 1. Bảo toàn chunk hash cũ từ phiên bản trước để tab đang mở không bị lỗi 404
if [ -d "dist" ]; then
    echo "   -> Sao chép các chunk hash và wasm từ bản cũ sang bản mới để chống lỗi 404 cho tab cũ..."
    cp -n dist/*.js "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
    cp -n dist/*.css "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
    cp -n dist/*.wasm "\${NEW_RELEASE_DIR}/dist/" 2>/dev/null || true
fi

# 2. Lưu lại bản đang chạy làm rollback target (Hỗ trợ cả trường hợp lần đầu chưa có current_release)
if [ -f "current_release" ]; then
    CURRENT=\$(cat current_release | tr -d '[:space:]')
    echo "   -> Ghi nhận rollback target: \$CURRENT"
    echo "\$CURRENT" > rollback_release
elif [ -d "dist" ] && [ -f "dist/version.json" ]; then
    OLD_SHA=\$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync("dist/version.json","utf8")).codeShort||"legacy")}catch{process.stdout.write("legacy")}' 2>/dev/null || echo "legacy")
    BASELINE="baseline_\${OLD_SHA}_\$(date -u +%Y%m%d_%H%M%S)"
    echo "   -> Phát hiện VPS chưa có current_release nhưng đang phục vụ dist (\${OLD_SHA})."
    echo "   -> Đang tạo bản sao lưu an toàn tại releases/\${BASELINE}..."
    mkdir -p "releases/\${BASELINE}"
    cp -r dist "releases/\${BASELINE}/dist"
    [ -f "nginx.conf" ] && cp nginx.conf "releases/\${BASELINE}/"
    [ -f "compose.yml" ] && cp compose.yml "releases/\${BASELINE}/"
    [ -f "Dockerfile" ] && cp Dockerfile "releases/\${BASELINE}/"
    echo "\${BASELINE}" > rollback_release
    echo "\${BASELINE}" > current_release
fi

# 3. Đồng bộ cấu hình mới ra thư mục gốc VPS
cp "\${NEW_RELEASE_DIR}/nginx.conf" nginx.conf
cp "\${NEW_RELEASE_DIR}/compose.yml" compose.yml
cp "\${NEW_RELEASE_DIR}/Dockerfile" Dockerfile
cp -r "\${NEW_RELEASE_DIR}/server" .

# 4. Chuyển đổi thư mục dist một cách an toàn
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# 5. Build lại image Docker cho chili3d (không cache để nạp đúng bundle mới)
echo "🐳 Build lại container chili3d..."
sudo docker compose build --no-cache chili3d
sudo docker compose up -d --remove-orphans chili3d

# 6. Khởi động lại container storage-api để nạp mã server mới (volume chili3d-data giữ nguyên 100%)
echo "🔄 Khởi động lại storage-api..."
sudo docker compose restart storage-api
sleep 2
EOF

echo "🩺 [5/5] Kiểm tra sức khỏe dịch vụ trên VPS (Chỉ chốt current_release khi vượt qua hậu kiểm)..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
cd "${VPS_DEPLOY_DIR}"

do_rollback() {
    echo "🚨 HẬU KIỂM THẤT BÀI! Tự động kích hoạt cơ chế quay lui (Rollback)..."
    if [ -f "rollback_release" ]; then
        TARGET=\$(cat rollback_release | tr -d '[:space:]')
        if [ -n "\$TARGET" ] && [ -d "releases/\$TARGET/dist" ]; then
            echo "   -> Đang khôi phục về bản dự phòng \$TARGET..."
            rm -rf dist.rollback.tmp
            cp -r "releases/\$TARGET/dist" dist.rollback.tmp
            rm -rf dist
            mv dist.rollback.tmp dist
            [ -f "releases/\$TARGET/nginx.conf" ] && cp "releases/\$TARGET/nginx.conf" nginx.conf
            [ -f "releases/\$TARGET/compose.yml" ] && cp "releases/\$TARGET/compose.yml" compose.yml
            [ -f "releases/\$TARGET/Dockerfile" ] && cp "releases/\$TARGET/Dockerfile" Dockerfile
            sudo docker compose build --no-cache chili3d
            sudo docker compose up -d --no-deps chili3d
            echo "\$TARGET" > current_release
            echo "   ✅ Đã khôi phục an toàn về bản \$TARGET."
        fi
    fi
    exit 1
}

echo "1. Kiểm tra endpoint version.json:"
VER_JSON=\$(curl -s http://127.0.0.1/version.json || echo "")
echo "   Nội dung: \$VER_JSON"
if ! echo "\$VER_JSON" | grep -q "${TIP_SHA:0:8}"; then
    echo "❌ Lỗi: version.json không chứa SHA mong muốn ${TIP_SHA:0:8}!"
    do_rollback
fi

echo "2. Kiểm tra endpoint trang chủ index.html:"
INDEX_HTML=\$(curl -s http://127.0.0.1/ || echo "")
if ! echo "\$INDEX_HTML" | grep -q "main\."; then
    echo "❌ Lỗi: index.html không chứa tham chiếu main.*.js!"
    do_rollback
fi

echo "3. Kiểm tra endpoint dữ liệu lưu trữ bản vẽ:"
RECENTS=\$(curl -s http://127.0.0.1/api/storage/chili3d-db/recents || echo "")
if [ -z "\$RECENTS" ] || [ "\$RECENTS" = "[]" ]; then
    echo "⚠️ Cảnh báo: Danh sách recents rỗng hoặc không phản hồi!"
    do_rollback
else
    echo "   ✅ Dữ liệu bản vẽ lưu trữ hoàn toàn nguyên vẹn."
fi

echo "4. Kiểm tra endpoint LLM proxy:"
STATUS_CODE=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/llm-proxy/anthropic/v1/models || true)
echo "   HTTP Status Code: \$STATUS_CODE (kỳ vọng 401)"
if [ "\$STATUS_CODE" != "401" ]; then
    echo "⚠️ Cảnh báo: Proxy LLM trả về mã \$STATUS_CODE (kỳ vọng 401)"
    do_rollback
fi

# CHỈ CHỐT current_release KHI TẤT CẢ BƯỚC HẬU KIỂM QUA THÀNH CÔNG!
echo "${RELEASE_ID}" > current_release
echo "   ✅ ĐÃ CHỐT current_release: ${RELEASE_ID}"

# Dọn dẹp các release cũ (chỉ giữ lại 5 release gần nhất)
echo "🧹 Dọn dẹp các bản release cũ, giữ lại 5 bản gần nhất..."
cd "${VPS_DEPLOY_DIR}/releases"
ls -dt */ 2>/dev/null | tail -n +6 | xargs -I {} rm -rf "{}" 2>/dev/null || true
EOF

echo "============================================================"
echo "✅ TRIỂN KHAI THÀNH CÔNG BẢN PHÁT HÀNH: ${RELEASE_ID}"
echo "🌐 Truy cập ứng dụng tại: http://${VPS_HOST} (hoặc http://${VPS_HOST}:${APP_FALLBACK_PORT})"
echo "============================================================"
