/**
 * ADMIN ROUTES
 * /api/admin/*
 * Satıcı başvuru onay/red işlemleri
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../config/database');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

/**
 * GET /api/admin/applications
 * Tüm satıcı başvurularını listele
 */
router.get('/applications', async (req, res) => {
    try {
        const status = req.query.status || 'PENDING';

        let query = 'SELECT * FROM seller_applications';
        const params = [];

        if (status !== 'ALL') {
            query += ' WHERE status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const [applications] = await db.execute(query, params);

        res.json({
            applications: applications.map(app => ({
                id: app.id,
                userId: app.user_id,
                userEmail: app.user_email,
                userName: app.user_name,
                storeName: app.store_name,
                taxNumber: app.tax_number,
                status: app.status,
                rejectionReason: app.rejection_reason,
                createdAt: app.created_at,
                reviewedAt: app.reviewed_at
            }))
        });

    } catch (error) {
        console.error('List applications error:', error);
        res.status(500).json({ error: 'Başvurular listelenemedi' });
    }
});

/**
 * PUT /api/admin/applications/:id/approve
 * Başvuruyu onayla
 * 1. Seller Service'de başvuruyu APPROVED yap
 * 2. Stores tablosuna mağaza ekle
 * 3. Auth Service'e SELLER rolü ekleme isteği gönder
 */
router.put('/applications/:id/approve', async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const applicationId = req.params.id;
        const { adminUserId } = req.body;

        // Başvuruyu bul
        const [applications] = await connection.execute(
            'SELECT * FROM seller_applications WHERE id = ? AND status = ?',
            [applicationId, 'PENDING']
        );

        if (applications.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Bekleyen başvuru bulunamadı' });
        }

        const application = applications[0];

        // Başvuruyu onayla
        await connection.execute(
            `UPDATE seller_applications 
             SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = ?
             WHERE id = ?`,
            [adminUserId || null, applicationId]
        );

        // Stores tablosuna ekle
        await connection.execute(
            `INSERT INTO stores (user_id, store_name, tax_number) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE store_name = VALUES(store_name), tax_number = VALUES(tax_number)`,
            [application.user_id, application.store_name, application.tax_number]
        );

        // Auth Service'e SELLER rolü ekleme isteği gönder
        try {
            await axios.put(
                `${AUTH_SERVICE_URL}/api/auth/users/${application.user_id}/roles`,
                { roleName: 'SELLER' }
            );
            console.log(`SELLER role added to user ${application.user_id} via Auth Service`);
        } catch (authError) {
            console.error('Auth Service role update failed:', authError.message);
            // Auth service hatası olsa bile işleme devam et
        }

        await connection.commit();

        res.json({
            message: 'Başvuru onaylandı, SELLER rolü Auth Service\'e gönderildi',
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
router.put('/applications/:id/reject', async (req, res) => {
    try {
        const applicationId = req.params.id;
        const { reason, adminUserId } = req.body;

        const [applications] = await db.execute(
            'SELECT * FROM seller_applications WHERE id = ? AND status = ?',
            [applicationId, 'PENDING']
        );

        if (applications.length === 0) {
            return res.status(404).json({ error: 'Bekleyen başvuru bulunamadı' });
        }

        await db.execute(
            `UPDATE seller_applications 
             SET status = 'REJECTED', rejection_reason = ?, 
                 reviewed_at = NOW(), reviewed_by = ?
             WHERE id = ?`,
            [reason || 'Belirtilmedi', adminUserId || null, applicationId]
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

module.exports = router;
