#!/bin/bash
# Oracle Cloud Always Free VM (Ubuntu) 快速設定腳本

echo "🚀 開始設定 Oracle Cloud 伺服器環境..."

# 1. 更新系統
sudo apt-get update && sudo apt-get upgrade -y

# 2. 安裝 Docker
echo "📦 安裝 Docker..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 3. 安裝 Nginx 與 Certbot
echo "🌐 安裝 Nginx 與 Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 4. 開啟防火牆 (OCI 控制台仍需手動設定 Ingress Rules)
echo "🛡️ 設定防火牆 (ufw)..."
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

echo "✅ 環境基礎設定完成！"
echo "👉 下一步：將專案上傳至主機，並執行 'docker compose up -d'"
echo "👉 SSL 設定：請執行 'sudo certbot --nginx -d 您的網域'"
