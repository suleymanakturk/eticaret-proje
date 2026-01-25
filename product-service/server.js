/**
 * PRODUCT SERVICE
 * Port: 3006
 * Ürün yönetimi servisi (MongoDB)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/database');
const productRoutes = require('./routes/products');

const app = express();
const PORT = process.env.PORT || 3006;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const CATEGORY_SERVICE_URL = process.env.CATEGORY_SERVICE_URL || 'http://localhost:3002';

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3004',
        'http://localhost:3005',
        AUTH_SERVICE_URL,
        CATEGORY_SERVICE_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/products', productRoutes);

// Home page - Product dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        authServiceUrl: AUTH_SERVICE_URL,
        categoryServiceUrl: CATEGORY_SERVICE_URL
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Multer error handling
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'Dosya boyutu çok büyük (max 5MB)'
        });
    }

    res.status(500).json({ success: false, error: 'Sunucu hatası oluştu' });
});

app.listen(PORT, () => {
    console.log(`🛍️ Product Service çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   GET  /api/products              - Tüm ürünler`);
    console.log(`   GET  /api/products/:id          - Ürün detayı`);
    console.log(`   GET  /api/products/seller/my-products - Satıcı ürünleri`);
    console.log(`   POST /api/products              - Yeni ürün (SELLER)`);
    console.log(`   PUT  /api/products/:id          - Ürün güncelle (SELLER)`);
    console.log(`   DELETE /api/products/:id        - Ürün sil (SELLER)`);
    console.log(`   POST /api/products/:id/images   - Görsel yükle (SELLER)`);
    console.log(`\n🔗 Auth Service: ${AUTH_SERVICE_URL}`);
    console.log(`🔗 Category Service: ${CATEGORY_SERVICE_URL}`);
});
