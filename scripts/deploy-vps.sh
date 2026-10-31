#!/usr/bin/env bash
# Part of the Chili3d Project, under the AGPL-3.0 License.
# Script tự động đóng gói tại máy Local và triển khai lên VPS 1GB RAM (Zero-Compile trên VPS).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
    echo "❌ Không tìm thấy file .env! Hãy sao chép từ .env.example và kiểm tra thông số."
    exit 1
fi

set -a
source ".env"
set +a

echo "============================================================"
echo "🚀 BẮT ĐẦU TRIỂN KHAI DUNVEX CAD LÊN VPS: ${VPS_USER}@${VPS_HOST}"
echo "============================================================"

if [ ! -d "dist" ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
    echo "📦 [1/4] Đang đóng gói bản Production tại máy Local..."
    SKIP_TYPECHECK=true NODE_ENV=production npm run build
else
    echo "📦 [1/4] Đã có sẵn thư mục dist/ (Đặt FORCE_BUILD=1 nếu muốn build lại)."
fi

SSH_OPTS="-i ${VPS_SSH_KEY_PATH} -p ${VPS_PORT:-22} -o StrictHostKeyChecking=accept-new"

echo "🛠️  [2/4] Kiểm tra môi trường VPS (Swap 2GB, Docker & Thư mục ${VPS_DEPLOY_DIR})..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "bash -s" <<EOF
set -euo pipefail
# Tạo 2GB Swap nếu VPS 1GB RAM chưa có Swap để chống tràn bộ nhớ (OOM)
if [ "\$(swapon --show | wc -l)" -eq 0 ]; then
    echo "   -> Khởi tạo 2GB Swapfile cho VPS 1GB RAM..."
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

echo "📤 [3/4] Đang đồng bộ gói dist/, server/, Dockerfile, nginx.conf, compose.yml lên VPS..."
tar -czf - dist server Dockerfile nginx.conf compose.yml .env.example | \
    ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "tar -xzf - -C ${VPS_DEPLOY_DIR}"

echo "🐳 [4/4] Khởi chạy dịch vụ Docker Compose trên VPS..."
ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "cd ${VPS_DEPLOY_DIR} && sudo docker compose up -d --build --remove-orphans && sudo docker compose ps"

echo "============================================================"
echo "✅ TRIỂN KHAI THÀNH CÔNG!"
echo "🌐 Truy cập ứng dụng tại: http://${VPS_HOST} (hoặc http://${VPS_HOST}:${APP_FALLBACK_PORT})"
echo "============================================================"
