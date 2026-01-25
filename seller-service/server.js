/**
 * SELLER SERVICE
 * Port: 3005
 * Satıcı başvuru ve yönetim servisi
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const sellerRoutes = require('./routes/seller');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3005;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const CATEGORY_SERVICE_URL = process.env.CATEGORY_SERVICE_URL || 'http://localhost:3002';

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3001',
        'http://localhost:3000',
        'http://localhost:3004',
        AUTH_SERVICE_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/seller', sellerRoutes);
app.use('/api/admin', adminRoutes);

// Home page - Seller application form
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
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

app.listen(PORT, () => {
    console.log(`🏪 Seller Service çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   POST /api/seller/apply         - Satıcı başvurusu`);
    console.log(`   GET  /api/seller/application   - Başvuru durumu`);
    console.log(`   GET  /api/admin/applications   - Başvuru listesi (Admin)`);
    console.log(`   PUT  /api/admin/applications/:id/approve - Onay`);
    console.log(`   PUT  /api/admin/applications/:id/reject  - Red`);
    console.log(`\n🔗 Auth Service: ${AUTH_SERVICE_URL}`);
});
