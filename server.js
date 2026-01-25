/**
 * LOGIN MICROSERVICE
 * Port: 3001
 * E-ticaret platformu için kullanıcı kimlik doğrulama ve yetkilendirme servisi
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const sellerRoutes = require('./routes/seller');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3004'], // Homepage ve diğer servisler
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Production'da true yapın (HTTPS gerektirir)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/admin', adminRoutes);

// HTML Sayfaları
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Auth check middleware (diğer servisler için)
app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.user) {
        res.json({
            authenticated: true,
            user: req.session.user
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Login Microservice çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   POST /api/auth/register - Kullanıcı kaydı`);
    console.log(`   POST /api/auth/login    - Giriş`);
    console.log(`   POST /api/auth/logout   - Çıkış`);
    console.log(`   GET  /api/auth/me       - Kullanıcı bilgisi`);
    console.log(`   POST /api/seller/apply  - Satıcı başvurusu`);
    console.log(`   GET  /api/admin/applications - Başvuru listesi`);
});
