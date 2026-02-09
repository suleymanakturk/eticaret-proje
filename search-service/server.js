/**
 * SEARCH SERVICE
 * Port: 3007
 * Ürün arama servisi (Read-Only)
 * MongoDB Full-Text Search ile çalışır
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/database');
const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3007;

// =============================================================================
// FRONTEND İÇİN (Tarayıcı yönlendirmeleri - Ingress üzerinden)
// =============================================================================
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'https://suleymanakturk.online';

// Frontend path'leri (tarayıcı URL'lerinde görünür)
const SERVICE_PATHS = {
    auth: process.env.AUTH_PATH || '/login',
    category: process.env.CATEGORY_PATH || '/categories',
    seller: process.env.SELLER_PATH || '/seller',
    product: process.env.PRODUCT_PATH || '/products',
    cart: process.env.CART_PATH || '/cart',
    order: process.env.ORDER_PATH || '/orders'
};

// Frontend URL oluşturucu (tarayıcı için - Ingress üzerinden)
const buildFrontendUrl = (path) => `${BASE_DOMAIN}${path}`;

// =============================================================================
// BACKEND İÇİN (Kubernetes Internal - Servis-arası iletişim)
// =============================================================================
// Bu URL'ler backend'den backend'e istek atarken kullanılır
// Kubernetes cluster içinde traffic internal olarak kalır
const K8S_INTERNAL_URLS = {
    auth: process.env.K8S_AUTH_SERVICE || 'http://localhost:3001',
    category: process.env.K8S_CATEGORY_SERVICE || 'http://localhost:3002',
    seller: process.env.K8S_SELLER_SERVICE || 'http://localhost:3005',
    product: process.env.K8S_PRODUCT_SERVICE || 'http://localhost:3006',
    cart: process.env.K8S_CART_SERVICE || 'http://localhost:3008',
    order: process.env.K8S_ORDER_SERVICE || 'http://localhost:3009'
};

// Connect to MongoDB (Read-Only)
connectDB();

// CORS Configuration
// Production'da tüm servisler aynı domain altında (suleymanakturk.online)
// olduğu için CORS sorunu YOK - same-origin.
// Sadece local development için CORS gerekli (farklı portlar).
const isDevelopment = process.env.NODE_ENV !== 'production';

// Middleware
app.use(cors({
    origin: isDevelopment
        ? true  // Development: tüm originlere izin ver
        : false, // Production: same-origin, CORS gerekmiyor
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/search', searchRoutes);

// Home page - Search Interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'search-service',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Config endpoint - Frontend'e domain ve path'leri gönder
// NOT: Bu endpoint tarayıcıya URL döndürür, bu yüzden Ingress URL'leri kullanılır
app.get('/api/config', (req, res) => {
    res.json({
        // Base domain (Ingress üzerinden erişilen public URL)
        baseDomain: BASE_DOMAIN,
        // Göreceli path'ler
        paths: SERVICE_PATHS,
        // Frontend için tam URL'ler (tarayıcı bu URL'lere gidecek)
        authServiceUrl: buildFrontendUrl(SERVICE_PATHS.auth),
        categoryServiceUrl: buildFrontendUrl(SERVICE_PATHS.category),
        sellerServiceUrl: buildFrontendUrl(SERVICE_PATHS.seller),
        productServiceUrl: buildFrontendUrl(SERVICE_PATHS.product),
        cartServiceUrl: buildFrontendUrl(SERVICE_PATHS.cart),
        orderServiceUrl: buildFrontendUrl(SERVICE_PATHS.order)
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Sunucu hatası oluştu'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint bulunamadı'
    });
});

app.listen(PORT, () => {
    console.log(`🔍 Search Service çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   GET  /api/search              - Ürün arama`);
    console.log(`   GET  /api/search/suggestions  - Arama önerileri`);
    console.log(`   GET  /health                  - Servis durumu`);
    console.log(`\n📝 Query Parameters:`);
    console.log(`   q          - Arama terimi`);
    console.log(`   category_id - Kategori filtresi`);
    console.log(`   seller_id  - Satıcı filtresi`);
    console.log(`   minPrice   - Minimum fiyat`);
    console.log(`   maxPrice   - Maksimum fiyat`);
    console.log(`   sort       - Sıralama (newest, price_asc, price_desc)`);
    console.log(`   limit      - Sayfa başına sonuç (max: 100)`);
    console.log(`   offset     - Başlangıç indeksi`);
    console.log(`\n🌐 Base Domain: ${BASE_DOMAIN}`);
    console.log(`🔗 Service Paths:`, SERVICE_PATHS);
});
