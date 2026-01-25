/**
 * ADMIN ROUTES
 * /api/admin/*
 * Satıcı başvuru onay/red işlemleri
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Bu işlem için giriş yapmalısınız' });
    }
    next();
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
    if (!req.session.user.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'Bu işlem için admin yetkisi gereklidir' });
    }
    next();
};

/**
 * GET /api/admin/applications
 * Tüm satıcı başvurularını listele
 */
router.get('/applications', requireAuth, requireAdmin, async (req, res) => {
    try {
        const status = req.query.status || 'PENDING'; // Default: sadece bekleyenler

        let query = `
            SELECT sa.*, 
                   u.email, u.first_name, u.last_name,
                   reviewer.first_name as reviewer_first_name, 
                   reviewer.last_name as reviewer_last_name
            FROM seller_applications sa
            INNER JOIN users u ON sa.user_id = u.id
            LEFT JOIN users reviewer ON sa.reviewed_by = reviewer.id
        `;

        const params = [];

        if (status !== 'ALL') {
            query += ' WHERE sa.status = ?';
            params.push(status);
        }

        query += ' ORDER BY sa.created_at DESC';

        const [applications] = await db.execute(query, params);

        res.json({
            applications: applications.map(app => ({
                id: app.id,
                userId: app.user_id,
                userEmail: app.email,
                userName: `${app.first_name} ${app.last_name}`,
                storeName: app.store_name,
                taxNumber: app.tax_number,
                status: app.status,
                rejectionReason: app.rejection_reason,
                createdAt: app.created_at,
                reviewedAt: app.reviewed_at,
                reviewedBy: app.reviewer_first_name
                    ? `${app.reviewer_first_name} ${app.reviewer_last_name}`
                    : null
            }))
        });

    } catch (error) {
        console.error('List applications error:', error);
        res.status(500).json({ error: 'Başvurular listelenemedi' });
    }
});

/**
 * PUT /api/admin/applications/:id/approve
 * Başvuruyu onayla ve SELLER rolünü ekle
 */
router.put('/applications/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const applicationId = req.params.id;
        const adminId = req.session.user.id;

        // Başvuruyu bul
        const [applications] = await connection.execute(
            'SELECT * FROM seller_applications WHERE id = ? AND status = ?',
            [applicationId, 'PENDING']
        );

        if (applications.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                error: 'Bekleyen başvuru bulunamadı'
            });
        }

        const application = applications[0];

        // Başvuruyu onayla
        await connection.execute(
            `UPDATE seller_applications 
             SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = ?
             WHERE id = ?`,
            [adminId, applicationId]
        );

        // SELLER rolünü bul
        const [roles] = await connection.execute(
            'SELECT id FROM roles WHERE name = ?',
            ['SELLER']
        );

        if (roles.length > 0) {
            // Kullanıcıya SELLER rolünü ekle
            // ON DUPLICATE KEY ile zaten varsa hata vermez
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id) 
                 VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE assigned_at = NOW()`,
                [application.user_id, roles[0].id]
            );
        }

        await connection.commit();

        res.json({
            message: 'Başvuru onaylandı ve SELLER rolü eklendi',
            applicationId: applicationId,
            userId: application.user_id
        });

    } catch (error) {
        await connection.rollback();
        console.error('Approve application error:', error);
        res.status(500).json({ error: 'Onaylama işlemi başarısız' });
    } finally {
        connection.release();
    }
});

/**
 * PUT /api/admin/applications/:id/reject
 * Başvuruyu reddet
 */
router.put('/applications/:id/reject', requireAuth, requireAdmin, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const adminId = req.session.user.id;
        const { reason } = req.body;

        // Başvuruyu bul
        const [applications] = await db.execute(
            'SELECT * FROM seller_applications WHERE id = ? AND status = ?',
            [applicationId, 'PENDING']
        );

        if (applications.length === 0) {
            return res.status(404).json({
                error: 'Bekleyen başvuru bulunamadı'
            });
        }

        // Başvuruyu reddet
        await db.execute(
            `UPDATE seller_applications 
             SET status = 'REJECTED', rejection_reason = ?, 
                 reviewed_at = NOW(), reviewed_by = ?
             WHERE id = ?`,
            [reason || 'Belirtilmedi', adminId, applicationId]
        );

        res.json({
            message: 'Başvuru reddedildi',
            applicationId: applicationId
        });

    } catch (error) {
        console.error('Reject application error:', error);
        res.status(500).json({ error: 'Reddetme işlemi başarısız' });
    }
});

/**
 * GET /api/admin/users
 * Tüm kullanıcıları listele (opsiyonel)
 */
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const [users] = await db.execute(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.created_at,
                   GROUP_CONCAT(r.name) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);

        res.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: `${u.first_name} ${u.last_name}`,
                isActive: u.is_active,
                roles: u.roles ? u.roles.split(',') : [],
                createdAt: u.created_at
            }))
        });

    } catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Kullanıcılar listelenemedi' });
    }
});

module.exports = router;
