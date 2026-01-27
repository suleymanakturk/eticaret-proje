/**
 * CART SERVICE
 * Port: 3008
 * Redis tabanlı sepet yönetimi servisi
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connectRedis } = require('./config/redis');
const cartRoutes = require('./routes/cart');

const app = express();
const PORT = process.env.PORT || 3008;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3006';
const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:3007';

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://localhost:3006',
        'http://localhost:3007',
        'http://172.35.28.80:3001',
        'http://172.35.28.80:3002',
        'http://172.35.28.80:3004',
        'http://172.35.28.80:3005',
        'http://172.35.28.80:3006',
        'http://172.35.28.80:3007',
        PRODUCT_SERVICE_URL,
        SEARCH_SERVICE_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/cart', cartRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'cart-service',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        productServiceUrl: PRODUCT_SERVICE_URL,
        searchServiceUrl: SEARCH_SERVICE_URL
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

// Start server after Redis connection
const startServer = async () => {
    try {
        await connectRedis();

        app.listen(PORT, () => {
            console.log(`🛒 Cart Service çalışıyor: http://localhost:${PORT}`);
            console.log(`📋 API Endpoints:`);
            console.log(`   GET    /cart              - Sepeti getir`);
            console.log(`   POST   /cart/add          - Sepete ürün ekle`);
            console.log(`   PUT    /cart/:productId   - Miktar güncelle`);
            console.log(`   DELETE /cart/:productId   - Ürünü sil`);
            console.log(`   DELETE /cart              - Sepeti temizle`);
            console.log(`   GET    /health            - Servis durumu`);
            console.log(`\n🔗 Product Service: ${PRODUCT_SERVICE_URL}`);
        });
    } catch (error) {
        console.error('❌ Sunucu başlatılamadı:', error.message);
        process.exit(1);
    }
};

startServer();
