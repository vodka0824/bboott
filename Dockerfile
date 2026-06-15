FROM node:20-slim

# 為 OCI Always Free ARM 最佳化的輕量化 Dockerfile
# 如果後續需要 Puppeteer，請在安裝時額外加入 chromium

WORKDIR /app

# 先複製依賴設定，利用 Docker layers 快取
COPY package*.json ./

# 安裝生產環境依賴
RUN npm ci --only=production

# 安裝 Chromium 以支援 Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 複製其餘程式碼
COPY . .

# 建立非 root 用戶以增加安全性 (P0-8 修復)
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

# 切換到非 root 用戶
USER pptruser

# LINE Bot 預設端口
EXPOSE 8080

# 啟動命令
CMD ["npm", "start"]
