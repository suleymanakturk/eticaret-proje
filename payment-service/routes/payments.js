/**
 * PAYMENT ROUTES
 * Ödeme işleme API'leri
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../config/database');
const { verifyInternalService, verifyToken } = require('../middleware/auth');

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3009';
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3010';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'internal-service-secret-key-2024';
const PAYMENT_SUCCESS_RATE = parseInt(process.env.PAYMENT_SUCCESS_RATE) || 95;

// =============================================
// POST /payments/process
// Ana ödeme endpoint'i - Order Service'ten çağrılır
// =============================================
router.post('/process', verifyInternalService, async (req, res) => {
    let connection;
    const transactionId = `TXN-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    try {
        const { orderId, totalAmount, userId, items, cardLastFour } = req.body;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`💳 YENİ ÖDEME TALEBİ`);
        console.log(`   Transaction ID: ${transactionId}`);
        console.log(`   Order ID: ${orderId}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Tutar: ₺${totalAmount}`);
        console.log(`${'='.repeat(60)}`);

        // Validasyon
        if (!orderId || !totalAmount || !userId) {
            return res.status(400).json({
                success: false,
                error: 'orderId, totalAmount ve userId zorunludur'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // =============================================
        // ADIM 1: Ödeme simülasyonu
        // =============================================
        console.log(`\n📊 ADIM 1: Ödeme simülasyonu çalıştırılıyor...`);

        // Simüle edilmiş gecikme (gerçek ödeme gateway'i gibi)
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

        // Başarı oranına göre sonuç belirle
        const randomValue = Math.random() * 100;
        const isSuccess = randomValue < PAYMENT_SUCCESS_RATE;

        console.log(`   Rastgele değer: ${randomValue.toFixed(2)}, Başarı eşiği: ${PAYMENT_SUCCESS_RATE}`);
        console.log(`   Sonuç: ${isSuccess ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);

        // Ödeme kaydını oluştur
        const status = isSuccess ? 'SUCCESS' : 'FAILED';
        const errorCode = isSuccess ? null : 'PAYMENT_DECLINED';
        const errorMessage = isSuccess ? null : 'Ödeme reddedildi. Lütfen kart bilgilerinizi kontrol edin.';

        const [insertResult] = await connection.execute(
            `INSERT INTO payments 
             (transaction_id, order_id, user_id, amount, status, card_last_four, error_code, error_message) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [transactionId, orderId, userId, totalAmount, status, cardLastFour || null, errorCode, errorMessage]
        );

        const paymentId = insertResult.insertId;
        console.log(`   💾 Ödeme kaydı oluşturuldu: ID ${paymentId}`);

        await connection.commit();

        // =============================================
        // ADIM 2: Callback'ler (asenkron)
        // =============================================
        if (isSuccess) {
            console.log(`\n📤 ADIM 2: Başarılı ödeme callback'leri gönderiliyor...`);

            // Inventory Service'e stok onayı (asenkron - hata olsa bile ödeme başarılı)
            sendInventoryCallback(orderId, items, 'confirm', connection, paymentId);

            // Order Service'e durum güncellemesi
            sendOrderCallback(orderId, 'PAID', transactionId, connection, paymentId);

        } else {
            console.log(`\n📤 ADIM 2: Başarısız ödeme callback'leri gönderiliyor...`);

            // Inventory Service'e rezervasyon iptali
            sendInventoryCallback(orderId, items, 'release', connection, paymentId);

            // Order Service'e durum güncellemesi
            sendOrderCallback(orderId, 'PAYMENT_FAILED', transactionId, connection, paymentId);
        }

        // =============================================
        // ADIM 3: Yanıt döndür
        // =============================================
        if (isSuccess) {
            console.log(`\n✅ ÖDEME BAŞARILI - Transaction: ${transactionId}`);

            res.status(200).json({
                success: true,
                message: 'Ödeme başarıyla tamamlandı',
                data: {
                    paymentId,
                    transactionId,
                    orderId,
                    amount: totalAmount,
                    status: 'SUCCESS',
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            console.log(`\n❌ ÖDEME BAŞARISIZ - Transaction: ${transactionId}`);

            res.status(402).json({
                success: false,
                error: 'Ödeme işlemi başarısız oldu',
                data: {
                    paymentId,
                    transactionId,
                    orderId,
                    errorCode,
                    errorMessage
                }
            });
        }

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('❌ Payment process error:', error);
        res.status(500).json({
            success: false,
            error: 'Ödeme işlenirken bir hata oluştu',
            transactionId
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// Inventory Service Callback
// =============================================
async function sendInventoryCallback(orderId, items, action, connection, paymentId) {
    try {
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.log(`   ⚠️ Inventory callback atlandı - ürün listesi yok`);
            return;
        }

        console.log(`   📦 Inventory Service'e ${action} isteği gönderiliyor...`);

        for (const item of items) {
            const endpoint = action === 'confirm' ? 'confirm' : 'release';

            try {
                await axios.post(
                    `${INVENTORY_SERVICE_URL}/inventory/${endpoint}`,
                    {
                        productId: item.productId,
                        quantity: item.quantity,
                        orderId
                    },
                    {
                        headers: { 'x-service-key': INTERNAL_SERVICE_KEY },
                        timeout: 5000
                    }
                );
                console.log(`      ✅ ${item.productId}: ${action} başarılı`);
            } catch (error) {
                console.error(`      ❌ ${item.productId}: ${action} hatası -`, error.message);
            }
        }

        // Callback durumunu güncelle
        await db.execute(
            'UPDATE payments SET inventory_callback_sent = TRUE WHERE id = ?',
            [paymentId]
        );

    } catch (error) {
        console.error('   ❌ Inventory callback error:', error.message);
    }
}

// =============================================
// Order Service Callback
// =============================================
async function sendOrderCallback(orderId, status, transactionId, connection, paymentId) {
    try {
        console.log(`   📋 Order Service'e durum güncellemesi gönderiliyor...`);
        console.log(`      Order ID: ${orderId}, Yeni durum: ${status}`);

        await axios.put(
            `${ORDER_SERVICE_URL}/orders/${orderId}/payment-status`,
            {
                status,
                transactionId,
                paymentId
            },
            {
                headers: { 'x-service-key': INTERNAL_SERVICE_KEY },
                timeout: 5000
            }
        );

        console.log(`      ✅ Order Service callback başarılı`);

        // Callback durumunu güncelle
        await db.execute(
            'UPDATE payments SET order_callback_sent = TRUE WHERE id = ?',
            [paymentId]
        );

    } catch (error) {
        console.error('   ❌ Order callback error:', error.message);
    }
}

// =============================================
// GET /payments/:id
// Ödeme detayı
// =============================================
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [payments] = await db.execute(
            'SELECT * FROM payments WHERE id = ? OR transaction_id = ?',
            [id, id]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Ödeme bulunamadı'
            });
        }

        const payment = payments[0];

        // Kullanıcı sadece kendi ödemelerini görebilir
        if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Bu ödemeyi görüntüleme yetkiniz yok'
            });
        }

        res.json({
            success: true,
            data: {
                id: payment.id,
                transactionId: payment.transaction_id,
                orderId: payment.order_id,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                paymentMethod: payment.payment_method,
                cardLastFour: payment.card_last_four,
                createdAt: payment.created_at
            }
        });

    } catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({ success: false, error: 'Ödeme bilgisi alınamadı' });
    }
});

// =============================================
// GET /payments/order/:orderId
// Sipariş ödemeleri
// =============================================
router.get('/order/:orderId', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;

        const [payments] = await db.execute(
            'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC',
            [orderId]
        );

        res.json({
            success: true,
            data: payments.map(p => ({
                id: p.id,
                transactionId: p.transaction_id,
                amount: p.amount,
                status: p.status,
                createdAt: p.created_at
            }))
        });

    } catch (error) {
        console.error('Get order payments error:', error);
        res.status(500).json({ success: false, error: 'Ödeme listesi alınamadı' });
    }
});

// =============================================
// POST /payments/refund
// İade işlemi
// =============================================
router.post('/refund', verifyInternalService, async (req, res) => {
    let connection;

    try {
        const { paymentId, amount, reason } = req.body;

        if (!paymentId) {
            return res.status(400).json({
                success: false,
                error: 'paymentId zorunludur'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Ödemeyi bul
        const [payments] = await connection.execute(
            'SELECT * FROM payments WHERE id = ? FOR UPDATE',
            [paymentId]
        );

        if (payments.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Ödeme bulunamadı'
            });
        }

        const payment = payments[0];

        if (payment.status !== 'SUCCESS') {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Sadece başarılı ödemeler iade edilebilir'
            });
        }

        const refundAmount = amount || payment.amount;
        const refundTransactionId = `REF-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

        // İade kaydı oluştur
        await connection.execute(
            'INSERT INTO refunds (payment_id, refund_transaction_id, amount, status, reason) VALUES (?, ?, ?, "SUCCESS", ?)',
            [paymentId, refundTransactionId, refundAmount, reason || 'Müşteri talebi']
        );

        // Ödeme durumunu güncelle
        await connection.execute(
            'UPDATE payments SET status = "REFUNDED" WHERE id = ?',
            [paymentId]
        );

        await connection.commit();
        connection.release();

        console.log(`💸 İade işlemi tamamlandı: ${refundTransactionId}, Tutar: ₺${refundAmount}`);

        res.json({
            success: true,
            message: 'İade işlemi başarılı',
            data: {
                refundTransactionId,
                originalPaymentId: paymentId,
                amount: refundAmount
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Refund error:', error);
        res.status(500).json({ success: false, error: 'İade işlemi başarısız' });
    }
});

module.exports = router;
