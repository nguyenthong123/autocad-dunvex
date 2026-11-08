#!/usr/bin/env bash
# Part of the Chili3d Project, under the AGPL-3.0 License.
# Script tự động đóng gói tại máy Local và triển khai lên VPS 1GB RAM (Zero-Compile trên VPS).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=1
    fi
done

if [ ! -f ".env" ]; then
    echo "❌ Không tìm thấy file .env! Hãy sao chép từ .env.example và kiểm tra thông số."
    exit 1
fi

set -a
source ".env"
set +a

if [ "$DRY_RUN" -eq 1 ]; then
    echo "============================================================"
    echo "🔍 CHẾ ĐỘ KIỂM TRA LỆNH (--dry-run) KHÔNG THAY ĐỔI MÁY CHỦ"
    echo "============================================================"
    echo "Mục tiêu VPS: ${VPS_USER}@${VPS_HOST}:${VPS_PORT:-22}"
    echo "Thư mục đích: ${VPS_DEPLOY_DIR}"
    echo ""
    echo "Các lệnh sẽ được chạy:"
    echo "1. Build local: SKIP_TYPECHECK=true NODE_ENV=production npm run build"
echo "1.5. scripts/version-sync.sh: kiểm SHA BÊN TRONG version.json + deploy-version.json so với .build-meta.json; lệch/thiếu → sinh lại cả hai TỪ metadata build đã xác minh; thiếu bằng chứng → DỪNG. Kịch bản: bash scripts/version-sync.test.sh"
    echo "2. SSH kiểm tra Swap 2GB & Docker trên VPS: ssh -i ${VPS_SSH_KEY_PATH} -p ${VPS_PORT:-22} ${VPS_USER}@${VPS_HOST} '...'"
    echo "3. Đồng bộ gói tài nguyên: tar -czf - dist server Dockerfile nginx.conf compose.yml .env.example | ssh ... 'tar -xzf - -C ${VPS_DEPLOY_DIR}'"
    echo "4. Khởi chạy Docker Compose: ssh ... 'cd ${VPS_DEPLOY_DIR} && sudo docker compose up -d --build --remove-orphans && sudo docker compose ps'"
    echo "5. Khởi động lại container storage-api để nạp mã nguồn server mới: ssh ... 'cd ${VPS_DEPLOY_DIR} && sudo docker compose restart storage-api && sudo docker compose ps'"
    echo "6. Kiểm tra phản hồi Proxy LLM: ssh ... 'curl -s -o /dev/null -w \"%{http_code}\" http://127.0.0.1/api/llm-proxy/anthropic/v1/models' (kỳ vọng 401)"
    echo "============================================================"
    exit 0
fi

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

# Version hygiene (Reviewer 08/11 điểm 1): hai file phải ghi ĐÚNG SHA của bundle —
# kiểm nội dung BÊN TRONG từng file so với .build-meta.json, không chỉ so hai file với nhau;
# lệch → sinh lại CẢ HAI từ metadata build đã xác minh; thiếu bằng chứng build → DỪNG.
echo "🏷️  Kiểm bằng chứng build + đồng bộ version metadata (scripts/version-sync.sh)..."
TIP_SHA="$(git rev-parse HEAD)"
BRANCH_NAME="$(git symbolic-ref -q --short HEAD || echo "detached@${TIP_SHA:0:8}")"
source "$ROOT_DIR/scripts/version-sync.sh"
sync_version_files "dist" "$ROOT_DIR" "$TIP_SHA" "$BRANCH_NAME" || exit 1

SSH_OPTS="-i ${VPS_SSH_KEY_PATH} -p ${VPS_PORT:-22} -o StrictHostKeyChecking=accept-new"

echo "🛠️  [2/5] Kiểm tra môi trường VPS (Swap 2GB, Docker & Thư mục ${VPS_DEPLOY_DIR})..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
# Tạo 2GB Swap nếu VPS chưa có Swap để chống tràn bộ nhớ (OOM)
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

# Cài đặt Docker & Docker Compose nếu chưa có
if ! command -v docker >/dev/null 2>&1; then
    echo "   -> Cài đặt Docker Engine & Docker Compose plugin..."
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "\$(whoami)" || true
fi

sudo mkdir -p "${VPS_DEPLOY_DIR}"
sudo chown -R "\$(whoami)":"\$(whoami)" "${VPS_DEPLOY_DIR}"
EOF

echo "📤 [3/5] Đang đồng bộ gói dist/, server/, Dockerfile, nginx.conf, compose.yml lên VPS..."
tar -czf - dist server Dockerfile nginx.conf compose.yml .env.example | \
    ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "tar -xzf - -C ${VPS_DEPLOY_DIR}"

echo "🐳 [4/5] Khởi chạy dịch vụ Docker Compose trên VPS..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "cd ${VPS_DEPLOY_DIR} && sudo docker compose up -d --build --remove-orphans && sudo docker compose ps"

echo "🔄 [5/5] Khởi động lại container storage-api để nạp mã server mới & kiểm tra endpoint..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
cd "${VPS_DEPLOY_DIR}"
sudo docker compose restart storage-api
sleep 2
sudo docker compose ps

echo "Kiểm tra endpoint proxy LLM:"
STATUS_CODE=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/llm-proxy/anthropic/v1/models || true)
echo "HTTP Status Code: \$STATUS_CODE"
if [ "\$STATUS_CODE" = "401" ]; then
    echo "✅ Proxy LLM hoạt động bình thường (upstream trả 401 như kỳ vọng vì chưa có key)"
else
    echo "⚠️ Cảnh báo: Proxy LLM trả về mã \$STATUS_CODE (kỳ vọng 401)"
    exit 1
fi
EOF

echo "============================================================"
echo "✅ TRIỂN KHAI THÀNH CÔNG!"
echo "🌐 Truy cập ứng dụng tại: http://${VPS_HOST} (hoặc http://${VPS_HOST}:${APP_FALLBACK_PORT})"
echo "============================================================"
