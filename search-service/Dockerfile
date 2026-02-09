# Search Service Dockerfile
FROM node:20-alpine

# Çalışma dizini
WORKDIR /app

# Package dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle (production için)
RUN npm ci --only=production

# Uygulama dosyalarını kopyala
COPY . .

# Port tanımla
EXPOSE 3007

# Ortam değişkenleri
ENV NODE_ENV=production
ENV PORT=3007

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3007/health || exit 1

# Uygulamayı başlat
CMD ["node", "server.js"]
