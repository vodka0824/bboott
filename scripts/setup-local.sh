#!/bin/bash
# 聯想筆電 (Ubuntu x86_64) 本地端部署快速設定腳本

echo "🚀 開始設定本地端 Ubuntu 伺服器環境..."

# 1. 更新系統
echo "🔄 更新系統套件列表..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. 安裝必要基礎工具
sudo apt-get install -y ca-certificates curl gnupg lsb-release wget git

# 3. 安裝 Docker (使用官方快速安裝腳本，適用所有架構)
echo "📦 安裝 Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# 4. 設定 Docker 免 sudo 執行權限 (需重新登入生效)
echo "🔑 設定 Docker 使用者群組權限..."
sudo usermod -aG docker $USER

# 5. 下載並安裝 Cloudflare Tunnel (cloudflared)
echo "☁️ 下載並安裝 Cloudflare Tunnel (cloudflared)..."
cd /tmp
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
rm cloudflared-linux-amd64.deb
cd - > /dev/null

echo "=================================================="
echo "✅ 本地端 Ubuntu 基礎設定完成！"
echo "=================================================="
echo "👉 注意：請執行 'newgrp docker' 或重啟登入以套用 Docker 免 sudo 權限。"
echo "👉 下一步一：請在 Cloudflare 控制台設定 Tunnel，並取得安裝 Token。"
echo "👉 下一步二：在此目錄執行 'docker compose up -d' 啟動 LINE Bot 服務。"
echo "=================================================="
