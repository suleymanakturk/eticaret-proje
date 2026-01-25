/**
 * SELLER ROUTES
 * /api/seller/*
 * Satıcı başvuru işlemleri
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * POST /api/seller/apply
 * Satıcı başvurusu oluştur
 * NOT: Başvuru yapıldığında SELLER rolü eklenmez
 * Admin onayı sonrası Auth Service'e rol ekleme isteği gönderilir
 */
router.post('/apply', async (req, res) => {
    try {
        const { userId, userEmail, userName, storeName, taxNumber } = req.body;

        // Validasyon
        if (!userId || !userEmail || !userName || !storeName || !taxNumber) {
            return res.status(400).json({
                error: 'Tüm alanlar zorunludur'
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
            // REJECTED durumunda yeni başvuru yapabilir
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

        // Yeni başvuru oluştur
        const [result] = await db.execute(
            `INSERT INTO seller_applications 
             (user_id, user_email, user_name, store_name, tax_number, status) 
             VALUES (?, ?, ?, ?, ?, 'PENDING')`,
            [userId, userEmail, userName, storeName, taxNumber]
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
router.get('/application', async (req, res) => {
    try {
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({ error: 'userId gerekli' });
        }

        const [applications] = await db.execute(
            'SELECT * FROM seller_applications WHERE user_id = ?',
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
                reviewedAt: app.reviewed_at
            }
        });

    } catch (error) {
        console.error('Get application error:', error);
        res.status(500).json({ error: 'Başvuru bilgisi alınamadı' });
    }
});

module.exports = router;
