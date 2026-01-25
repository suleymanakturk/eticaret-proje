/**
 * AUTH ROUTES
 * /api/auth/*
 * Login, Register, Logout, Me endpoints
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../config/database');

const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * Yeni kullanıcı kaydı (varsayılan rol: CUSTOMER)
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        // Validasyon
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                error: 'Tüm alanlar zorunludur'
            });
        }

        // Email formatı kontrolü
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Geçerli bir email adresi giriniz'
            });
        }

        // Şifre uzunluğu kontrolü
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Şifre en az 6 karakter olmalıdır'
            });
        }

        // Email benzersizlik kontrolü
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                error: 'Bu email adresi zaten kayıtlı'
            });
        }

        // Şifre hashleme
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Kullanıcı oluştur
        const [result] = await db.execute(
            'INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)',
            [email, passwordHash, firstName, lastName]
        );

        const userId = result.insertId;

        // CUSTOMER rolünü ekle
        const [roles] = await db.execute(
            'SELECT id FROM roles WHERE name = ?',
            ['CUSTOMER']
        );

        if (roles.length > 0) {
            await db.execute(
                'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
                [userId, roles[0].id]
            );
        }

        res.status(201).json({
            message: 'Kayıt başarılı',
            userId: userId
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu' });
    }
});

/**
 * POST /api/auth/login
 * Kullanıcı girişi
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validasyon
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email ve şifre zorunludur'
            });
        }

        // Kullanıcıyı bul
        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: 'Email veya şifre hatalı'
            });
        }

        const user = users[0];

        // Şifre kontrolü
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                error: 'Email veya şifre hatalı'
            });
        }

        // Rolleri getir
        const [roles] = await db.execute(`
            SELECT r.name, r.description 
            FROM roles r 
            INNER JOIN user_roles ur ON r.id = ur.role_id 
            WHERE ur.user_id = ?
        `, [user.id]);

        // User object
        const userInfo = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            roles: roles.map(r => r.name)
        };

        // Session'a kullanıcı bilgilerini kaydet
        req.session.user = userInfo;

        // JWT token oluştur (Product Service için)
        const jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret';
        console.log('🔑 JWT_SECRET kullanılıyor:', jwtSecret.substring(0, 10) + '...');

        const token = jwt.sign(
            userInfo,
            jwtSecret,
            { expiresIn: '24h' }
        );

        console.log('✅ JWT Token oluşturuldu, uzunluk:', token.length);

        res.json({
            message: 'Giriş başarılı',
            user: userInfo,
            token: token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Giriş sırasında bir hata oluştu' });
    }
});

/**
 * POST /api/auth/logout
 * Çıkış
 */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Çıkış yapılamadı' });
        }
        res.json({ message: 'Çıkış başarılı' });
    });
});

/**
 * GET /api/auth/me
 * Mevcut kullanıcı bilgisi
 */
router.get('/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Oturum açılmamış' });
    }
    res.json({ user: req.session.user });
});

/**
 * PUT /api/auth/users/:id/roles
 * Kullanıcıya rol ekle (Seller Service tarafından çağrılır)
 */
router.put('/users/:id/roles', async (req, res) => {
    try {
        const userId = req.params.id;
        const { roleName } = req.body;

        if (!roleName) {
            return res.status(400).json({ error: 'Rol adı zorunlu' });
        }

        // Rolü bul
        const [roles] = await db.execute(
            'SELECT id FROM roles WHERE name = ?',
            [roleName]
        );

        if (roles.length === 0) {
            return res.status(404).json({ error: 'Rol bulunamadı' });
        }

        // Kullanıcıya rol ekle
        await db.execute(
            `INSERT INTO user_roles (user_id, role_id) 
             VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE assigned_at = NOW()`,
            [userId, roles[0].id]
        );

        res.json({ message: `${roleName} rolü eklendi`, userId, roleName });

    } catch (error) {
        console.error('Add role error:', error);
        res.status(500).json({ error: 'Rol eklenemedi' });
    }
});

/**
 * GET /api/auth/users/:id
 * Kullanıcı bilgisi getir (Seller Service için)
 */
router.get('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        const [users] = await db.execute(
            'SELECT id, email, first_name, last_name, is_active, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = users[0];

        // Rolleri getir
        const [roles] = await db.execute(`
            SELECT r.name 
            FROM roles r 
            INNER JOIN user_roles ur ON r.id = ur.role_id 
            WHERE ur.user_id = ?
        `, [userId]);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                isActive: user.is_active,
                roles: roles.map(r => r.name),
                createdAt: user.created_at
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Kullanıcı bilgisi alınamadı' });
    }
});

module.exports = router;
