/**
 * PAYMENT SERVICE
 * Port: 3011
 * Ödeme işleme servisi (MySQL)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const db = require('./config/database');
const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3011;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3009';
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3010';
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
        'http://localhost:3011',
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
        'http://172.35.28.80:3011',
        ORDER_SERVICE_URL,
        INVENTORY_SERVICE_URL,
        AUTH_SERVICE_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/payments', paymentRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await db.execute('SELECT 1');
        res.json({
            success: true,
            service: 'payment-service',
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            service: 'payment-service',
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        orderServiceUrl: ORDER_SERVICE_URL,
        inventoryServiceUrl: INVENTORY_SERVICE_URL,
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
    console.log(`💳 Payment Service çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   POST   /payments/process     - Ödeme işle`);
    console.log(`   GET    /payments/:id         - Ödeme detayı`);
    console.log(`   GET    /payments/order/:id   - Sipariş ödemeleri`);
    console.log(`   POST   /payments/refund      - İade işlemi`);
    console.log(`   GET    /health               - Servis durumu`);
    console.log(`\n🔗 Order Service: ${ORDER_SERVICE_URL}`);
    console.log(`🔗 Inventory Service: ${INVENTORY_SERVICE_URL}`);
});
