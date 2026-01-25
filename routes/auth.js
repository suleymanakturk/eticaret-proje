/**
 * AUTH ROUTES
 * /api/auth/*
 * Login, Register, Logout, Me endpoints
 */

const express = require('express');
const bcrypt = require('bcrypt');
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

        // Session'a kullanıcı bilgilerini kaydet
        req.session.user = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            roles: roles.map(r => r.name)
        };

        res.json({
            message: 'Giriş başarılı',
            user: req.session.user
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

module.exports = router;
