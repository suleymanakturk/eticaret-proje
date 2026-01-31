/**
 * INVENTORY SERVICE
 * Port: 3010
 * Stok yönetimi ve rezervasyon servisi (MySQL)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const db = require('./config/database');
const inventoryRoutes = require('./routes/inventory');

const app = express();
const PORT = process.env.PORT || 3010;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3006';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3009';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://localhost:3006',
        'http://localhost:3007',
        'http://localhost:3008',
        'http://localhost:3009',
        'http://localhost:3010',
        'http://172.35.28.80:3001',
        'http://172.35.28.80:3002',
        'http://172.35.28.80:3003',
        'http://172.35.28.80:3004',
        'http://172.35.28.80:3005',
        'http://172.35.28.80:3006',
        'http://172.35.28.80:3007',
        'http://172.35.28.80:3008',
        'http://172.35.28.80:3009',
        'http://172.35.28.80:3010',
        PRODUCT_SERVICE_URL,
        ORDER_SERVICE_URL,
        AUTH_SERVICE_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/inventory', inventoryRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Veritabanı bağlantısını test et
        await db.execute('SELECT 1');
        res.json({
            success: true,
            service: 'inventory-service',
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            service: 'inventory-service',
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        productServiceUrl: PRODUCT_SERVICE_URL,
        orderServiceUrl: ORDER_SERVICE_URL,
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📦 Inventory Service çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   POST   /inventory/reserve     - Stok rezerve et`);
    console.log(`   POST   /inventory/confirm     - Rezervasyonu onayla`);
    console.log(`   POST   /inventory/release     - Rezervasyonu iptal et`);
    console.log(`   GET    /inventory/:productId  - Ürün stok bilgisi`);
    console.log(`   POST   /inventory/init        - Yeni ürün için stok kaydı`);
    console.log(`   PUT    /inventory/:productId  - Stok güncelle`);
    console.log(`   GET    /health                - Servis durumu`);
    console.log(`\n🔗 Product Service: ${PRODUCT_SERVICE_URL}`);
    console.log(`🔗 Order Service: ${ORDER_SERVICE_URL}`);
});
