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

// =============================================================================
// FRONTEND İÇİN (Tarayıcı yönlendirmeleri - Ingress üzerinden)
// =============================================================================
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'https://suleymanakturk.online';

// Frontend path'leri (tarayıcı URL'lerinde görünür)
const SERVICE_PATHS = {
    seller: process.env.SELLER_PATH || '/seller',
    product: process.env.PRODUCT_PATH || '/products',
    search: process.env.SEARCH_PATH || '/'
};

// Frontend URL oluşturucu (tarayıcı için - Ingress üzerinden)
const buildFrontendUrl = (path) => path === '/' ? BASE_DOMAIN : `${BASE_DOMAIN}${path}`;

// =============================================================================
// BACKEND İÇİN (Kubernetes Internal - Servis-arası iletişim)
// =============================================================================
const K8S_INTERNAL_URLS = {
    seller: process.env.K8S_SELLER_SERVICE || 'http://localhost:3005',
    product: process.env.K8S_PRODUCT_SERVICE || 'http://localhost:3006',
    search: process.env.K8S_SEARCH_SERVICE || 'http://localhost:3007',
    category: process.env.K8S_CATEGORY_SERVICE || 'http://localhost:3002',
    cart: process.env.K8S_CART_SERVICE || 'http://localhost:3008',
    order: process.env.K8S_ORDER_SERVICE || 'http://localhost:3009'
};

// CORS Configuration
// Production'da tüm servisler aynı domain altında (suleymanakturk.online)
// olduğu için CORS sorunu YOK - same-origin.
// Sadece local development için CORS gerekli (farklı portlar).
const isDevelopment = process.env.NODE_ENV !== 'production';

// Middleware
app.use(cors({
    origin: isDevelopment
        ? true  // Development: tüm originlere izin ver
        : false, // Production: same-origin, CORS gerekmiyor
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

// Logout endpoint - session'ı temizle ve geri yönlendir
app.get('/logout', (req, res) => {
    const redirectUri = req.query.redirect_uri || '/login.html';

    // Session'ı yok et
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }
        // Cookie'yi temizle
        res.clearCookie('connect.sid');
        // Geri yönlendir
        res.redirect(decodeURIComponent(redirectUri));
    });
});

// Service URLs endpoint - Frontend'e domain ve path'leri gönder
app.get('/api/config', (req, res) => {
    res.json({
        // Base domain (Ingress üzerinden erişilen public URL)
        baseDomain: BASE_DOMAIN,
        // Göreceli path'ler
        paths: SERVICE_PATHS,
        // Frontend için tam URL'ler (tarayıcı bu URL'lere gidecek)
        sellerServiceUrl: buildFrontendUrl(SERVICE_PATHS.seller),
        productServiceUrl: buildFrontendUrl(SERVICE_PATHS.product),
        searchServiceUrl: buildFrontendUrl(SERVICE_PATHS.search)
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
    console.log(`\n🌐 Base Domain: ${BASE_DOMAIN}`);
    console.log(`🔗 Service Paths:`, SERVICE_PATHS);
});
