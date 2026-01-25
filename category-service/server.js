/**
 * CATEGORY SERVICE
 * Port: 3002
 * Kategori, Ürün Türü ve Marka yönetimi
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const categoryRoutes = require('./routes/categories');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/categories', categoryRoutes);

// Home redirect
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
});

app.listen(PORT, () => {
    console.log(`📂 Category Service çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   GET  /api/categories           - Tüm kategoriler (nested)`);
    console.log(`   GET  /api/categories/flat      - Düz liste`);
    console.log(`   POST /api/categories           - Kategori ekle`);
    console.log(`   POST /api/categories/:id/types - Ürün türü ekle`);
    console.log(`   POST /api/categories/types/:id/brands - Marka ekle`);
});
