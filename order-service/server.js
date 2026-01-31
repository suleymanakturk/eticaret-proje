/**
 * ORDER SERVICE
 * Port: 3009
 * Sipariş yönetimi servisi (MySQL)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3009;
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3008';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3006';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://localhost:3006',
        'http://localhost:3007',
        'http://localhost:3008',
        'http://localhost:3009',
        'http://172.35.28.80:3001',
        'http://172.35.28.80:3002',
        'http://172.35.28.80:3004',
        'http://172.35.28.80:3005',
        'http://172.35.28.80:3006',
        'http://172.35.28.80:3007',
        'http://172.35.28.80:3008',
        'http://172.35.28.80:3009',
        AUTH_SERVICE_URL,
        CART_SERVICE_URL,
        PRODUCT_SERVICE_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/orders', orderRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'order-service',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        cartServiceUrl: CART_SERVICE_URL,
        productServiceUrl: PRODUCT_SERVICE_URL,
        authServiceUrl: AUTH_SERVICE_URL
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

// Start server
app.listen(PORT, () => {
    console.log(`📦 Order Service çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   POST   /orders              - Checkout (sepeti siparişe dönüştür)`);
    console.log(`   GET    /orders              - Kullanıcı siparişleri`);
    console.log(`   GET    /orders/:id          - Sipariş detayı`);
    console.log(`   PUT    /orders/:id/status   - Durum güncelle (Admin/Seller)`);
    console.log(`   DELETE /orders/:id          - Sipariş iptal`);
    console.log(`   GET    /orders/admin/all    - Tüm siparişler (Admin)`);
    console.log(`   GET    /health              - Servis durumu`);
    console.log(`\n🔗 Cart Service: ${CART_SERVICE_URL}`);
    console.log(`🔗 Product Service: ${PRODUCT_SERVICE_URL}`);
    console.log(`🔗 Auth Service: ${AUTH_SERVICE_URL}`);
});
