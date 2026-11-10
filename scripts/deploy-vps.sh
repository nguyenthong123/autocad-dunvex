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
    echo "❌ LỖI QUAY LUI: Không tìm thấy file rollback_release! Không thể xác định bản để quay lui." >&2
    exit 10
fi

ROLLBACK_TARGET=\$(cat rollback_release | tr -d '[:space:]')
if [ -z "\$ROLLBACK_TARGET" ] || [ ! -d "releases/\$ROLLBACK_TARGET" ] || [ ! -d "releases/\$ROLLBACK_TARGET/dist" ]; then
    echo "❌ LỖI QUAY LUI: Thư mục releases/\$ROLLBACK_TARGET không tồn tại hoặc thiếu dist/!" >&2
    exit 11
fi

CURRENT=\$(cat current_release 2>/dev/null || echo "unknown")
echo "   -> Đang chuẩn bị hoàn trả từ \$CURRENT sang \$ROLLBACK_TARGET..."

# [Bước 1/6] Hoàn trả dist
echo "   -> [Bước 1/6] Hoàn trả thư mục dist từ releases/\$ROLLBACK_TARGET/dist..."
rm -rf dist.rollback.tmp
cp -r "releases/\$ROLLBACK_TARGET/dist" dist.rollback.tmp
rm -rf dist
mv dist.rollback.tmp dist

# [Bước 2/6] Hoàn trả cấu hình đi kèm
echo "   -> [Bước 2/6] Hoàn trả cấu hình và server từ releases/\$ROLLBACK_TARGET..."
[ -f "releases/\$ROLLBACK_TARGET/nginx.conf" ] && cp "releases/\$ROLLBACK_TARGET/nginx.conf" nginx.conf
[ -f "releases/\$ROLLBACK_TARGET/compose.yml" ] && cp "releases/\$ROLLBACK_TARGET/compose.yml" compose.yml
[ -f "releases/\$ROLLBACK_TARGET/Dockerfile" ] && cp "releases/\$ROLLBACK_TARGET/Dockerfile" Dockerfile
[ -d "releases/\$ROLLBACK_TARGET/server" ] && cp -r "releases/\$ROLLBACK_TARGET/server" .

# [Bước 3/6] Build lại container chili3d
echo "   -> [Bước 3/6] Build lại container chili3d từ cấu hình bản \$ROLLBACK_TARGET..."
if ! sudo docker compose build --no-cache chili3d >/tmp/docker_build_manual_rb.log 2>&1; then
    echo "❌ LỖI QUAY LUI [Bước 3/6]: docker compose build thất bại!" >&2
    cat /tmp/docker_build_manual_rb.log >&2
    exit 12
fi

# [Bước 4/6] Khởi động container chili3d
echo "   -> [Bước 4/6] Khởi động container chili3d..."
if ! sudo docker compose up -d --remove-orphans chili3d >/tmp/docker_up_manual_rb.log 2>&1; then
    echo "❌ LỖI QUAY LUI [Bước 4/6]: docker compose up thất bại!" >&2
    cat /tmp/docker_up_manual_rb.log >&2
    exit 13
fi

# [Bước 5/6] Khởi động lại container storage-api
echo "   -> [Bước 5/6] Khởi động lại container storage-api (volume chili3d-data giữ nguyên)..."
if ! sudo docker compose restart storage-api >/tmp/docker_storage_manual_rb.log 2>&1; then
    echo "❌ LỖI QUAY LUI [Bước 5/6]: restart storage-api thất bại!" >&2
    cat /tmp/docker_storage_manual_rb.log >&2
    exit 14
fi
sleep 2

# [Bước 6/6] Xác minh bản cũ thực sự phục vụ trên HTTP
echo "   -> [Bước 6/6] Xác minh bản quay lui thực sự phục vụ..."

# 6.1. Trạng thái storage-api (chờ container sẵn sàng)
STATUS_RECENTS="000"
for i in \$(seq 1 15); do
    STATUS_RECENTS=\$(curl -s -o /tmp/rb_recents.json -w "%{http_code}" http://127.0.0.1/api/storage/chili3d-db/recents || echo "000")
    if [ "\$STATUS_RECENTS" = "200" ]; then
        break
    fi
    sleep 1
done

if [ "\$STATUS_RECENTS" != "200" ]; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: storage-api không phản hồi HTTP 200 (mã nhận: \$STATUS_RECENTS)!" >&2
    exit 15
fi
if ! node -e "const r = JSON.parse(require('fs').readFileSync('/tmp/rb_recents.json','utf8')); if(!Array.isArray(r)) process.exit(1);" 2>/dev/null; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: Dữ liệu storage-api không hợp lệ!" >&2
    exit 16
fi
echo "      ✅ storage-api phản hồi HTTP 200, dữ liệu bảo toàn."

# 6.2. Đọc SHA mong muốn
TARGET_WANT_SHA=\$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('releases/\$ROLLBACK_TARGET/dist/version.json','utf8')).codeSha||'')}catch{}" 2>/dev/null || echo "")
if [ -z "\$TARGET_WANT_SHA" ]; then
    TARGET_WANT_SHA=\$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('dist/version.json','utf8')).codeSha||'')}catch{}" 2>/dev/null || echo "")
fi

# 6.3. Kiểm tra version.json
STATUS_VER="000"
for i in \$(seq 1 10); do
    STATUS_VER=\$(curl -s -o /tmp/rb_ver.json -w "%{http_code}" http://127.0.0.1/version.json || echo "000")
    if [ "\$STATUS_VER" = "200" ]; then
        break
    fi
    sleep 1
done

if [ "\$STATUS_VER" != "200" ]; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: version.json không trả về HTTP 200 (mã nhận: \$STATUS_VER)!" >&2
    exit 17
fi
if ! node -e "
    const v = JSON.parse(require('fs').readFileSync('/tmp/rb_ver.json','utf8'));
    const want = '\$TARGET_WANT_SHA';
    if (want && v.codeSha !== want && v.tipSha !== want) process.exit(1);
" 2>/dev/null; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: version.json không khớp SHA bản cũ (\$TARGET_WANT_SHA)!" >&2
    exit 18
fi

# 6.4. Kiểm tra deploy-version.json
STATUS_DEP="000"
for i in \$(seq 1 10); do
    STATUS_DEP=\$(curl -s -o /tmp/rb_dep.json -w "%{http_code}" http://127.0.0.1/deploy-version.json || echo "000")
    if [ "\$STATUS_DEP" = "200" ]; then
        break
    fi
    sleep 1
done

if [ "\$STATUS_DEP" != "200" ]; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: deploy-version.json không trả về HTTP 200 (mã nhận: \$STATUS_DEP)!" >&2
    exit 19
fi
if ! node -e "
    const d = JSON.parse(require('fs').readFileSync('/tmp/rb_dep.json','utf8'));
    const want = '\$TARGET_WANT_SHA';
    if (want && d.codeSha !== want && d.tipSha !== want) process.exit(1);
" 2>/dev/null; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: deploy-version.json không khớp SHA bản cũ (\$TARGET_WANT_SHA)!" >&2
    exit 20
fi
echo "      ✅ Cả 2 endpoint phiên bản đều trả HTTP 200 và khớp SHA \$TARGET_WANT_SHA."

# 6.5. Kiểm tra file JS tham chiếu trong HTML
STATUS_HTML="000"
for i in \$(seq 1 10); do
    STATUS_HTML=\$(curl -s -o /tmp/rb_index.html -w "%{http_code}" http://127.0.0.1/ || echo "000")
    if [ "\$STATUS_HTML" = "200" ]; then
        break
    fi
    sleep 1
done

if [ "\$STATUS_HTML" != "200" ]; then
    echo "❌ LỖI QUAY LUI [Bước 6/6]: index.html không trả về HTTP 200 (mã nhận: \$STATUS_HTML)!" >&2
    exit 21
fi
RB_JS_ERR=0
for js_src in \$(grep -o 'src="[^"]*\.js"' /tmp/rb_index.html | cut -d'"' -f2); do
    CLEAN_JS="\${js_src#/}"
    JS_CODE=\$(curl -s -o /tmp/rb_check.js -w "%{http_code}" "http://127.0.0.1/\$CLEAN_JS" || echo "000")
    if [ "\$JS_CODE" != "200" ] || grep -q -i '<!DOCTYPE html' /tmp/rb_check.js; then
        echo "❌ LỖI QUAY LUI [Bước 6/6]: File JS tham chiếu \$CLEAN_JS không tải được hoặc trả HTML lỗi!" >&2
        RB_JS_ERR=1
        break
    fi
done
if [ "\$RB_JS_ERR" -eq 1 ]; then
    exit 22
fi
echo "      ✅ File JS tham chiếu trong HTML tải thành công và hợp lệ."

# CHỈ CHỐT current_release KHI TẤT CẢ BƯỚC HẬU KIỂM QUA THÀNH CÔNG!
echo "\$ROLLBACK_TARGET" > current_release
echo "\$CURRENT" > rollback_release
echo "   ✅ ĐÃ KHÔI PHỤC VÀ XÁC NHẬN BẢN \$ROLLBACK_TARGET ĐANG PHỤC VỤ THỰC TẾ."
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

    // Kiểm tra version.json và deploy-version.json
    const verPath = path.join(distDir, 'version.json');
    const depPath = path.join(distDir, 'deploy-version.json');
    if (!fs.existsSync(verPath) || !fs.existsSync(depPath)) {
        console.error('❌ Thiếu file version.json hoặc deploy-version.json!');
        process.exit(1);
    }
    const ver = JSON.parse(fs.readFileSync(verPath, 'utf8'));
    const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
    if (wantSha && (ver.codeSha !== wantSha || dep.codeSha !== wantSha)) {
        console.error('❌ Version metadata ghi sai SHA: ver=' + ver.codeSha + ', dep=' + dep.codeSha + ' !== ' + wantSha);
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

echo "🔄 [4/5] Kích hoạt bản phát hành mới và Docker Container (Bảo vệ bằng Rollback toàn diện)..."
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
    [ -d "server" ] && cp -r server "releases/\${BASELINE}/"
    echo "\${BASELINE}" > rollback_release
    echo "\${BASELINE}" > current_release
fi

# 3. [PRE-FLIGHT] Chuẩn bị và kiểm tra image mới trước khi đổi bản phục vụ
echo "🐳 [Pre-flight] Đang build và kiểm tra Docker image độc lập trong releases/${RELEASE_ID}..."
(
    cd "\${NEW_RELEASE_DIR}"
    sudo docker build -t "chili3d:${RELEASE_ID}" -f Dockerfile .
    sudo docker run --rm --entrypoint nginx "chili3d:${RELEASE_ID}" -t
)

# 4. Định nghĩa hàm rollback toàn diện
do_rollback() {
    local EXIT_CODE=\$?
    trap - ERR EXIT
    echo ""
    echo "🚨 SỰ CỐ XẢY RA TRONG QUÁ TRÌNH PHÁT HÀNH (Mã lỗi kích hoạt: \${EXIT_CODE})!"
    echo "🔄 Bắt đầu tiến trình quay lui (Rollback) và xác minh bản cũ..."

    if [ ! -f "rollback_release" ]; then
        echo "❌ LỖI QUAY LUI: Không tìm thấy file rollback_release! Không thể xác định bản để quay lui." >&2
        echo "   -> GIỮ NGUYÊN HIỆN TRẠNG, KHÔNG GHI NHẬN THÀNH CÔNG GIẢ."
        exit 10
    fi

    TARGET=\$(cat rollback_release | tr -d '[:space:]')
    if [ -z "\$TARGET" ] || [ ! -d "releases/\$TARGET" ] || [ ! -d "releases/\$TARGET/dist" ]; then
        echo "❌ LỖI QUAY LUI: Thư mục releases/\$TARGET không tồn tại hoặc thiếu dist/!" >&2
        echo "   -> GIỮ NGUYÊN HIỆN TRẠNG, KHÔNG GHI NHẬN THÀNH CÔNG GIẢ."
        exit 11
    fi

    # [Bước 1/6] Hoàn trả dist
    echo "   -> [Bước 1/6] Hoàn trả thư mục dist từ releases/\$TARGET/dist..."
    rm -rf dist.rollback.tmp
    cp -r "releases/\$TARGET/dist" dist.rollback.tmp
    rm -rf dist
    mv dist.rollback.tmp dist

    # [Bước 2/6] Hoàn trả cấu hình đi kèm
    echo "   -> [Bước 2/6] Hoàn trả cấu hình và server từ releases/\$TARGET..."
    [ -f "releases/\$TARGET/nginx.conf" ] && cp "releases/\$TARGET/nginx.conf" nginx.conf
    [ -f "releases/\$TARGET/compose.yml" ] && cp "releases/\$TARGET/compose.yml" compose.yml
    [ -f "releases/\$TARGET/Dockerfile" ] && cp "releases/\$TARGET/Dockerfile" Dockerfile
    [ -d "releases/\$TARGET/server" ] && cp -r "releases/\$TARGET/server" .

    # [Bước 3/6] Build lại container chili3d
    echo "   -> [Bước 3/6] Build lại container chili3d từ cấu hình bản \$TARGET..."
    if ! sudo docker compose build --no-cache chili3d >/tmp/docker_build_rollback.log 2>&1; then
        echo "❌ LỖI KHÔI PHỤC [Bước 3/6]: docker compose build thất bại khi quay lui!" >&2
        cat /tmp/docker_build_rollback.log >&2
        echo "   -> Giữ nguyên file log tại /tmp/docker_build_rollback.log để xử lý tiếp."
        echo "   -> TUYỆT ĐỐI KHÔNG CHỐT current_release. Thoát với mã lỗi 12."
        exit 12
    fi

    # [Bước 4/6] Khởi động container chili3d
    echo "   -> [Bước 4/6] Khởi động container chili3d..."
    if ! sudo docker compose up -d --remove-orphans chili3d >/tmp/docker_up_rollback.log 2>&1; then
        echo "❌ LỖI KHÔI PHỤC [Bước 4/6]: docker compose up thất bại khi quay lui!" >&2
        cat /tmp/docker_up_rollback.log >&2
        echo "   -> Giữ nguyên file log tại /tmp/docker_up_rollback.log để xử lý tiếp."
        echo "   -> TUYỆT ĐỐI KHÔNG CHỐT current_release. Thoát với mã lỗi 13."
        exit 13
    fi

    # [Bước 5/6] Khởi động lại container storage-api
    echo "   -> [Bước 5/6] Khởi động lại container storage-api (volume chili3d-data giữ nguyên)..."
    if ! sudo docker compose restart storage-api >/tmp/docker_storage_rollback.log 2>&1; then
        echo "❌ LỖI KHÔI PHỤC [Bước 5/6]: restart storage-api thất bại khi quay lui!" >&2
        cat /tmp/docker_storage_rollback.log >&2
        echo "   -> Giữ nguyên file log tại /tmp/docker_storage_rollback.log để xử lý tiếp."
        echo "   -> TUYỆT ĐỐI KHÔNG CHỐT current_release. Thoát với mã lỗi 14."
        exit 14
    fi
    sleep 2

    # [Bước 6/6] Xác minh bản cũ thực sự phục vụ trên HTTP
    echo "   -> [Bước 6/6] Xác minh bản quay lui thực sự phục vụ..."

    # 6.1. Trạng thái storage-api (chờ container sẵn sàng)
    STATUS_RECENTS="000"
    for i in \$(seq 1 15); do
        STATUS_RECENTS=\$(curl -s -o /tmp/rb_recents.json -w "%{http_code}" http://127.0.0.1/api/storage/chili3d-db/recents || echo "000")
        if [ "\$STATUS_RECENTS" = "200" ]; then
            break
        fi
        sleep 1
    done

    if [ "\$STATUS_RECENTS" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: storage-api không phản hồi HTTP 200 (mã nhận: \$STATUS_RECENTS)!" >&2
        exit 15
    fi
    if ! node -e "const r = JSON.parse(require('fs').readFileSync('/tmp/rb_recents.json','utf8')); if(!Array.isArray(r)) process.exit(1);" 2>/dev/null; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: Dữ liệu storage-api không hợp lệ!" >&2
        exit 16
    fi
    echo "      ✅ storage-api phản hồi HTTP 200, dữ liệu bảo toàn."

    # 6.2. Đọc SHA mong muốn
    TARGET_WANT_SHA=\$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('releases/\$TARGET/dist/version.json','utf8')).codeSha||'')}catch{}" 2>/dev/null || echo "")
    if [ -z "\$TARGET_WANT_SHA" ]; then
        TARGET_WANT_SHA=\$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('dist/version.json','utf8')).codeSha||'')}catch{}" 2>/dev/null || echo "")
    fi

    # 6.3. Kiểm tra version.json
    STATUS_VER="000"
    for i in \$(seq 1 10); do
        STATUS_VER=\$(curl -s -o /tmp/rb_ver.json -w "%{http_code}" http://127.0.0.1/version.json || echo "000")
        if [ "\$STATUS_VER" = "200" ]; then
            break
        fi
        sleep 1
    done

    if [ "\$STATUS_VER" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: version.json không trả về HTTP 200 (mã nhận: \$STATUS_VER)!" >&2
        exit 17
    fi
    if ! node -e "
        const v = JSON.parse(require('fs').readFileSync('/tmp/rb_ver.json','utf8'));
        const want = '\$TARGET_WANT_SHA';
        if (want && v.codeSha !== want && v.tipSha !== want) process.exit(1);
    " 2>/dev/null; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: version.json không khớp SHA bản cũ (\$TARGET_WANT_SHA)!" >&2
        exit 18
    fi

    # 6.4. Kiểm tra deploy-version.json
    STATUS_DEP="000"
    for i in \$(seq 1 10); do
        STATUS_DEP=\$(curl -s -o /tmp/rb_dep.json -w "%{http_code}" http://127.0.0.1/deploy-version.json || echo "000")
        if [ "\$STATUS_DEP" = "200" ]; then
            break
        fi
        sleep 1
    done

    if [ "\$STATUS_DEP" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: deploy-version.json không trả về HTTP 200 (mã nhận: \$STATUS_DEP)!" >&2
        exit 19
    fi
    if ! node -e "
        const d = JSON.parse(require('fs').readFileSync('/tmp/rb_dep.json','utf8'));
        const want = '\$TARGET_WANT_SHA';
        if (want && d.codeSha !== want && d.tipSha !== want) process.exit(1);
    " 2>/dev/null; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: deploy-version.json không khớp SHA bản cũ (\$TARGET_WANT_SHA)!" >&2
        exit 20
    fi
    echo "      ✅ Cả 2 endpoint phiên bản đều trả HTTP 200 và khớp SHA \$TARGET_WANT_SHA."

    # 6.5. Kiểm tra file JS tham chiếu trong HTML
    STATUS_HTML="000"
    for i in \$(seq 1 10); do
        STATUS_HTML=\$(curl -s -o /tmp/rb_index.html -w "%{http_code}" http://127.0.0.1/ || echo "000")
        if [ "\$STATUS_HTML" = "200" ]; then
            break
        fi
        sleep 1
    done

    if [ "\$STATUS_HTML" != "200" ]; then
        echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: index.html không trả về HTTP 200 (mã nhận: \$STATUS_HTML)!" >&2
        exit 21
    fi
    RB_JS_ERR=0
    for js_src in \$(grep -o 'src="[^"]*\.js"' /tmp/rb_index.html | cut -d'"' -f2); do
        CLEAN_JS="\${js_src#/}"
        JS_CODE=\$(curl -s -o /tmp/rb_check.js -w "%{http_code}" "http://127.0.0.1/\$CLEAN_JS" || echo "000")
        if [ "\$JS_CODE" != "200" ] || grep -q -i '<!DOCTYPE html' /tmp/rb_check.js; then
            echo "❌ LỖI KHÔI PHỤC [Bước 6/6]: File JS tham chiếu \$CLEAN_JS không tải được hoặc trả HTML lỗi!" >&2
            RB_JS_ERR=1
            break
        fi
    done
    if [ "\$RB_JS_ERR" -eq 1 ]; then
        exit 22
    fi
    echo "      ✅ File JS tham chiếu trong HTML tải thành công và hợp lệ."

    # CHỈ CHỐT current_release KHI TẤT CẢ BƯỚC HẬU KIỂM QUA THÀNH CÔNG!
    echo "\$TARGET" > current_release
    echo "   ✅ ĐÃ KHÔI PHỤC VÀ XÁC NHẬN BẢN \$TARGET ĐANG PHỤC VỤ THỰC TẾ (current_release: \$TARGET)."
    exit 1
}

# Đặt bẫy lỗi ERR: Bất kỳ lỗi nào phát sinh từ đây sẽ tự động kích hoạt rollback!
trap 'do_rollback' ERR

# 5. Bắt đầu thay đổi trạng thái máy chủ: Đồng bộ cấu hình mới ra thư mục gốc VPS
echo "📝 Đồng bộ cấu hình mới và server..."
cp "\${NEW_RELEASE_DIR}/nginx.conf" nginx.conf
cp "\${NEW_RELEASE_DIR}/compose.yml" compose.yml
cp "\${NEW_RELEASE_DIR}/Dockerfile" Dockerfile
cp -r "\${NEW_RELEASE_DIR}/server" .

# 6. Chuyển đổi thư mục dist một cách an toàn
echo "📂 Chuyển đổi thư mục dist..."
rm -rf dist.next.tmp
cp -r "\${NEW_RELEASE_DIR}/dist" dist.next.tmp
rm -rf dist
mv dist.next.tmp dist

# 7. Cập nhật container chili3d với image mới
echo "🐳 Kích hoạt container chili3d..."
sudo docker compose build --no-cache chili3d
sudo docker compose up -d --remove-orphans chili3d

# 8. Khởi động lại container storage-api để nạp mã server mới (volume chili3d-data giữ nguyên 100%)
echo "🔄 Khởi động lại storage-api (volume chili3d-data giữ nguyên)..."
sudo docker compose restart storage-api
sleep 2

# 9. HẬU KIỂM TOÀN DIỆN
echo "🩺 [5/5] Kiểm tra sức khỏe dịch vụ trên VPS (Chỉ chốt current_release khi vượt qua hậu kiểm)..."

echo "1. Kiểm tra endpoint version.json (HTTP 200 & Full 40-char SHA)..."
STATUS_VER=\$(curl -s -o /tmp/ver.json -w "%{http_code}" http://127.0.0.1/version.json || echo "000")
if [ "\$STATUS_VER" != "200" ]; then
    echo "❌ Lỗi: version.json trả HTTP \$STATUS_VER (kỳ vọng 200)!"
    do_rollback
fi
node -e "
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('/tmp/ver.json', 'utf8'));
const want = '${TIP_SHA}';
if (v.codeSha !== want && v.tipSha !== want) {
    console.error('❌ Mismatch SHA in version.json: ' + (v.codeSha || v.tipSha) + ' !== ' + want);
    process.exit(1);
}
console.log('   ✅ version.json khớp full SHA: ' + (v.codeSha || v.tipSha));
" || do_rollback

echo "2. Kiểm tra endpoint deploy-version.json (HTTP 200 & Full 40-char SHA)..."
STATUS_DEP=\$(curl -s -o /tmp/dep.json -w "%{http_code}" http://127.0.0.1/deploy-version.json || echo "000")
if [ "\$STATUS_DEP" != "200" ]; then
    echo "❌ Lỗi: deploy-version.json trả HTTP \$STATUS_DEP (kỳ vọng 200)!"
    do_rollback
fi
node -e "
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('/tmp/dep.json', 'utf8'));
const want = '${TIP_SHA}';
if (v.codeSha !== want && v.tipSha !== want) {
    console.error('❌ Mismatch SHA in deploy-version.json: ' + (v.codeSha || v.tipSha) + ' !== ' + want);
    process.exit(1);
}
console.log('   ✅ deploy-version.json khớp full SHA: ' + (v.codeSha || v.tipSha));
" || do_rollback

echo "3. Kiểm tra endpoint index.html và các file JS tham chiếu..."
STATUS_HTML=\$(curl -s -o /tmp/index.html -w "%{http_code}" http://127.0.0.1/ || echo "000")
if [ "\$STATUS_HTML" != "200" ]; then
    echo "❌ Lỗi: index.html trả HTTP \$STATUS_HTML (kỳ vọng 200)!"
    do_rollback
fi

node -e "
const fs = require('fs');
const html = fs.readFileSync('/tmp/index.html', 'utf8');
const scriptMatches = [...html.matchAll(/src=[\"']([^\"']+\.js)[\"']/g)].map(m => m[1]);
if (scriptMatches.length === 0) {
    console.error('❌ index.html không chứa bất kỳ thẻ script JS nào!');
    process.exit(1);
}
const mainJs = scriptMatches.find(s => s.startsWith('main.'));
if (!mainJs) {
    console.error('❌ index.html không tham chiếu script main.*.js!');
    process.exit(1);
}
console.log('   Tìm thấy ' + scriptMatches.length + ' file JS tham chiếu trong HTML (main: ' + mainJs + ').');
fs.writeFileSync('/tmp/scripts.txt', scriptMatches.join('\n'));
" || do_rollback

while IFS= read -r script_name; do
    [ -z "\$script_name" ] && continue
    CLEAN_SCRIPT="\${script_name#/}"
    JS_STATUS=\$(curl -s -o /tmp/check.js -w "%{http_code}" "http://127.0.0.1/\${CLEAN_SCRIPT}" || echo "000")
    if [ "\$JS_STATUS" != "200" ]; then
        echo "❌ Lỗi: Không thể tải file JS tham chiếu \${CLEAN_SCRIPT} (HTTP \$JS_STATUS)!"
        do_rollback
    fi
    if grep -q -i '<!DOCTYPE html' /tmp/check.js || grep -q -i '<html' /tmp/check.js; then
        echo "❌ Lỗi: File JS \${CLEAN_SCRIPT} trả về mã HTML thay vì JavaScript!"
        do_rollback
    fi
    echo "   ✅ File JS \${CLEAN_SCRIPT} tải thành công (HTTP 200, size: \$(wc -c < /tmp/check.js) bytes)."
done < /tmp/scripts.txt

echo "4. Kiểm tra endpoint dữ liệu lưu trữ bản vẽ (/api/storage/chili3d-db/recents)..."
STATUS_RECENTS=\$(curl -s -o /tmp/recents.json -w "%{http_code}" http://127.0.0.1/api/storage/chili3d-db/recents || echo "000")
if [ "\$STATUS_RECENTS" != "200" ]; then
    echo "❌ Lỗi: Endpoint recents trả HTTP \$STATUS_RECENTS (kỳ vọng 200)!"
    do_rollback
fi
node -e "
const fs = require('fs');
const recents = JSON.parse(fs.readFileSync('/tmp/recents.json', 'utf8'));
if (!Array.isArray(recents) || recents.length === 0) {
    console.error('⚠️ Cảnh báo: Danh sách recents rỗng hoặc không đúng định dạng!');
    process.exit(1);
}
console.log('   ✅ Dữ liệu bản vẽ lưu trữ hoàn toàn nguyên vẹn (' + recents.length + ' bản vẽ).');
" || do_rollback

echo "5. Kiểm tra endpoint LLM proxy:"
STATUS_CODE=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/llm-proxy/anthropic/v1/models || echo "000")
echo "   HTTP Status Code: \$STATUS_CODE (kỳ vọng 401)"
if [ "\$STATUS_CODE" != "401" ]; then
    echo "⚠️ Cảnh báo: Proxy LLM trả về mã \$STATUS_CODE (kỳ vọng 401)"
    do_rollback
fi

# TẮT BẪY LỖI: Tất cả hậu kiểm đã thành công!
trap - ERR

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
