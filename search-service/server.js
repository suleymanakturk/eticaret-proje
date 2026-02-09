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
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://172.35.28.80:3001';
const CATEGORY_SERVICE_URL = process.env.CATEGORY_SERVICE_URL || 'http://172.35.28.80:3002';
const SELLER_SERVICE_URL = process.env.SELLER_SERVICE_URL || 'http://172.35.28.80:3005';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://172.35.28.80:3006';
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://172.35.28.80:3008';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://172.35.28.80:3009';

// Connect to MongoDB (Read-Only)
connectDB();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://localhost:3006',
        'http://localhost:3008',
        AUTH_SERVICE_URL,
        CATEGORY_SERVICE_URL,
        SELLER_SERVICE_URL,
        PRODUCT_SERVICE_URL,
        CART_SERVICE_URL
    ],
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

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        authServiceUrl: AUTH_SERVICE_URL,
        categoryServiceUrl: CATEGORY_SERVICE_URL,
        sellerServiceUrl: SELLER_SERVICE_URL,
        productServiceUrl: PRODUCT_SERVICE_URL,
        cartServiceUrl: CART_SERVICE_URL,
        orderServiceUrl: ORDER_SERVICE_URL
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
    console.log(`\n🔗 Product Service: ${PRODUCT_SERVICE_URL}`);
});
