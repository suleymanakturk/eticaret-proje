/**
 * SELLER ROUTES
 * /api/seller/*
 * Satıcı başvuru işlemleri
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

/**
 * POST /api/seller/apply
 * Satıcı başvurusu oluştur
 * NOT: Başvuru yapıldığında SELLER rolü eklenmez, sadece başvuru kaydı oluşturulur
 * Admin onayı sonrası rol eklenir
 */
router.post('/apply', requireAuth, async (req, res) => {
    try {
        const { storeName, taxNumber } = req.body;
        const userId = req.session.user.id;

        // Validasyon
        if (!storeName || !taxNumber) {
            return res.status(400).json({
                error: 'Mağaza adı ve vergi numarası zorunludur'
            });
        }

        // Vergi numarası formatı (10 veya 11 haneli)
        if (!/^\d{10,11}$/.test(taxNumber)) {
            return res.status(400).json({
                error: 'Vergi numarası 10 veya 11 haneli olmalıdır'
            });
        }

        // Zaten başvuru var mı kontrol et
        const [existingApp] = await db.execute(
            'SELECT id, status FROM seller_applications WHERE user_id = ?',
            [userId]
        );

        if (existingApp.length > 0) {
            const status = existingApp[0].status;
            if (status === 'PENDING') {
                return res.status(400).json({
                    error: 'Bekleyen bir başvurunuz zaten var'
                });
            }
            if (status === 'APPROVED') {
                return res.status(400).json({
                    error: 'Zaten onaylanmış bir satıcı hesabınız var'
                });
            }
            // REJECTED durumunda yeni başvuru yapabilir - eski kaydı güncelle
            await db.execute(
                `UPDATE seller_applications 
                 SET store_name = ?, tax_number = ?, status = 'PENDING', 
                     rejection_reason = NULL, reviewed_at = NULL, reviewed_by = NULL
                 WHERE user_id = ?`,
                [storeName, taxNumber, userId]
            );

            return res.json({
                message: 'Başvurunuz güncellendi ve tekrar incelemeye alındı',
                applicationId: existingApp[0].id
            });
        }

        // Yeni başvuru oluştur (status = PENDING)
        const [result] = await db.execute(
            'INSERT INTO seller_applications (user_id, store_name, tax_number, status) VALUES (?, ?, ?, ?)',
            [userId, storeName, taxNumber, 'PENDING']
        );

        res.status(201).json({
            message: 'Satıcı başvurunuz alındı. Admin onayı bekleniyor.',
            applicationId: result.insertId
        });

    } catch (error) {
        console.error('Seller apply error:', error);
        res.status(500).json({ error: 'Başvuru sırasında bir hata oluştu' });
    }
});

/**
 * GET /api/seller/application
 * Mevcut başvuru durumunu getir
 */
router.get('/application', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [applications] = await db.execute(
            `SELECT sa.*, u.first_name as reviewer_first_name, u.last_name as reviewer_last_name
             FROM seller_applications sa
             LEFT JOIN users u ON sa.reviewed_by = u.id
             WHERE sa.user_id = ?`,
            [userId]
        );

        if (applications.length === 0) {
            return res.json({ hasApplication: false });
        }

        const app = applications[0];
        res.json({
            hasApplication: true,
            application: {
                id: app.id,
                storeName: app.store_name,
                taxNumber: app.tax_number,
                status: app.status,
                rejectionReason: app.rejection_reason,
                createdAt: app.created_at,
                reviewedAt: app.reviewed_at,
                reviewedBy: app.reviewer_first_name
                    ? `${app.reviewer_first_name} ${app.reviewer_last_name}`
                    : null
            }
        });

    } catch (error) {
        console.error('Get application error:', error);
        res.status(500).json({ error: 'Başvuru bilgisi alınamadı' });
    }
});

module.exports = router;
