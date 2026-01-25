/**
 * AUTH SERVICE
 * Port: 3001
 * Kullanıcı kimlik doğrulama servisi (Login, Register)
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const SELLER_SERVICE_URL = process.env.SELLER_SERVICE_URL || 'http://localhost:3005';

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3004',
        'http://localhost:3005',
        SELLER_SERVICE_URL
    ],
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
        secure: false, // Production'da true yapın (HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);

// HTML Sayfaları
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Auth check endpoint (diğer servisler için)
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

// Seller Service URL endpoint
app.get('/api/config', (req, res) => {
    res.json({
        sellerServiceUrl: SELLER_SERVICE_URL
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

app.listen(PORT, () => {
    console.log(`🔐 Auth Service çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 API Endpoints:`);
    console.log(`   POST /api/auth/register - Kullanıcı kaydı`);
    console.log(`   POST /api/auth/login    - Giriş`);
    console.log(`   POST /api/auth/logout   - Çıkış`);
    console.log(`   GET  /api/auth/me       - Kullanıcı bilgisi`);
    console.log(`   GET  /api/check-auth    - Auth kontrolü`);
    console.log(`\n🔗 Seller Service: ${SELLER_SERVICE_URL}`);
});
