/**
 * Order Routes
 * /orders/*
 * CRUD operations for orders with checkout flow
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdminOrSeller } = require('../middleware/auth');

const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3008';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3006';

// Sipariş durumları
const ORDER_STATUSES = [
    'PENDING_PAYMENT',
    'PAID',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED'
];

/**
 * POST /orders
 * Checkout - Sepeti siparişe dönüştür
 * 
 * Akış:
 * 1. Cart Service'den sepet verisi çekilir
 * 2. Product Service'den her ürünün güncel fiyatı ve stok durumu kontrol edilir
 * 3. Payment Service simülasyonu ile ödeme kontrolü yapılır
 * 4. Sipariş veritabanına kaydedilir
 * 5. Cart Service'e sepet temizleme isteği gönderilir
 */
router.post('/', verifyToken, async (req, res) => {
    let connection;

    try {
        // MySQL bağlantısını al
        try {
            connection = await db.getConnection();
            console.log('✅ MySQL bağlantısı alındı');
        } catch (dbConnError) {
            console.error('❌ MySQL bağlantı hatası:', dbConnError.message);
            return res.status(503).json({
                success: false,
                error: 'Veritabanına bağlanılamadı. Lütfen daha sonra tekrar deneyin.'
            });
        }

        const userId = req.user.id;
        const { shippingAddress, billingAddress, notes } = req.body;
        const token = req.headers.authorization;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🛒 YENİ SİPARİŞ TALEBİ - User ID: ${userId}`);
        console.log(`${'='.repeat(60)}`);

        // ============================================
        // ADIM 1: Cart Service'den Sepet Verisini Çek
        // ============================================
        console.log(`\n📦 ADIM 1: Cart Service'den sepet çekiliyor...`);
        console.log(`   URL: ${CART_SERVICE_URL}/cart`);

        let cartData;
        try {
            const cartResponse = await axios.get(`${CART_SERVICE_URL}/cart`, {
                headers: { Authorization: token },
                timeout: 10000
            });

            console.log(`   ✅ Cart Service yanıt verdi`);

            if (!cartResponse.data.success) {
                console.log(`   ❌ Sepet alınamadı: ${cartResponse.data.error}`);
                return res.status(400).json({
                    success: false,
                    error: 'Sepet bilgisi alınamadı'
                });
            }

            if (!cartResponse.data.data.items || cartResponse.data.data.items.length === 0) {
                console.log(`   ❌ Sepet boş`);
                return res.status(400).json({
                    success: false,
                    error: 'Sepetiniz boş'
                });
            }

            cartData = cartResponse.data.data;
            console.log(`   📋 Sepetteki ürün sayısı: ${cartData.items.length}`);
            console.log(`   💰 Sepet toplamı (Cart Service): ${cartData.formattedTotal || cartData.total}`);

        } catch (cartError) {
            console.error(`   ❌ Cart Service hatası:`, cartError.message);
            return res.status(503).json({
                success: false,
                error: 'Cart Service ile iletişim kurulamadı. Lütfen tekrar deneyin.'
            });
        }

        // ============================================
        // ADIM 2: Product Service'den Fiyat/Stok Doğrulama
        // ============================================
        console.log(`\n🔍 ADIM 2: Product Service'den ürün doğrulaması...`);

        const validatedItems = [];
        let calculatedTotal = 0;

        for (let i = 0; i < cartData.items.length; i++) {
            const item = cartData.items[i];
            console.log(`   [${i + 1}/${cartData.items.length}] Ürün: ${item.name} (ID: ${item.productId})`);

            try {
                const productResponse = await axios.get(
                    `${PRODUCT_SERVICE_URL}/api/products/${item.productId}`,
                    { timeout: 10000 }
                );

                if (!productResponse.data.success) {
                    console.log(`      ❌ Ürün bulunamadı`);
                    return res.status(400).json({
                        success: false,
                        error: `Ürün bulunamadı: ${item.name}`
                    });
                }

                const product = productResponse.data.data;
                console.log(`      📊 Güncel fiyat: ₺${product.price} | Stok: ${product.stock}`);

                // Stok kontrolü (Inventory check)
                if (product.stock < item.quantity) {
                    console.log(`      ❌ Yetersiz stok! İstenen: ${item.quantity}, Mevcut: ${product.stock}`);
                    return res.status(400).json({
                        success: false,
                        error: `Yetersiz stok: ${item.name} (İstenen: ${item.quantity}, Mevcut: ${product.stock})`
                    });
                }

                // Doğrulanmış ürün bilgisi (güncel fiyat ile)
                const subtotal = product.price * item.quantity;
                validatedItems.push({
                    productId: item.productId,
                    productName: product.name,
                    productImage: product.images && product.images.length > 0 ? product.images[0] : null,
                    price: product.price,  // Güncel fiyat (Cart'taki değil, Product Service'teki)
                    quantity: item.quantity,
                    subtotal: subtotal
                });

                calculatedTotal += subtotal;
                console.log(`      ✅ Doğrulandı | Alt toplam: ₺${subtotal}`);

            } catch (productError) {
                console.error(`      ❌ Product Service hatası:`, productError.message);
                return res.status(400).json({
                    success: false,
                    error: `Ürün doğrulanamadı: ${item.name}. Product Service yanıt vermedi.`
                });
            }
        }

        console.log(`   💰 Hesaplanan toplam: ₺${calculatedTotal}`);

        // ============================================
        // ADIM 3: Payment Service Simülasyonu
        // ============================================
        console.log(`\n💳 ADIM 3: Ödeme kontrolü (Payment Service simülasyonu)...`);

        // Simüle edilmiş ödeme kontrolü
        // Gerçek projede burada Payment Gateway (iyzico, PayTR vb.) çağrılır
        const paymentResult = await simulatePaymentCheck(userId, calculatedTotal);

        if (!paymentResult.success) {
            console.log(`   ❌ Ödeme başarısız: ${paymentResult.error}`);
            return res.status(400).json({
                success: false,
                error: paymentResult.error
            });
        }

        console.log(`   ✅ Ödeme onaylandı | İşlem ID: ${paymentResult.transactionId}`);

        // ============================================
        // ADIM 4: Siparişi Veritabanına Kaydet
        // ============================================
        console.log(`\n📝 ADIM 4: Sipariş veritabanına kaydediliyor...`);

        await connection.beginTransaction();

        try {
            // Siparişi oluştur
            const [orderResult] = await connection.execute(
                `INSERT INTO orders (user_id, total_price, status, shipping_address, billing_address, notes) 
                 VALUES (?, ?, 'PENDING_PAYMENT', ?, ?, ?)`,
                [userId, calculatedTotal, shippingAddress || null, billingAddress || null, notes || null]
            );

            const orderId = orderResult.insertId;
            console.log(`   ✅ Sipariş oluşturuldu | ID: ${orderId}`);

            // Sipariş kalemlerini ekle
            for (const item of validatedItems) {
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, subtotal) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [orderId, item.productId, item.productName, item.productImage, item.price, item.quantity, item.subtotal]
                );
            }
            console.log(`   ✅ ${validatedItems.length} ürün kalemi eklendi`);

            // Status history'ye kaydet
            await connection.execute(
                `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes) 
                 VALUES (?, NULL, 'PENDING_PAYMENT', ?, 'Sipariş oluşturuldu')`,
                [orderId, userId]
            );

            // Transaction'ı onayla
            await connection.commit();
            console.log(`   ✅ Veritabanı transaction onaylandı`);

            // ============================================
            // ADIM 5: Cart Service'e Sepeti Temizle
            // ============================================
            console.log(`\n🧹 ADIM 5: Cart Service'e sepet temizleme isteği...`);
            console.log(`   URL: DELETE ${CART_SERVICE_URL}/cart`);

            try {
                await axios.delete(`${CART_SERVICE_URL}/cart`, {
                    headers: { Authorization: token },
                    timeout: 10000
                });
                console.log(`   ✅ Sepet başarıyla temizlendi`);
            } catch (clearCartError) {
                // Sepet temizleme hatası kritik değil, sipariş zaten oluştu
                console.error(`   ⚠️ Sepet temizleme hatası (kritik değil):`, clearCartError.message);
            }

            // ============================================
            // ADIM 6: Başarılı Yanıt Döndür
            // ============================================
            const [orders] = await db.execute(`SELECT * FROM orders WHERE id = ?`, [orderId]);
            const [orderItems] = await db.execute(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);

            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ SİPARİŞ BAŞARIYLA TAMAMLANDI!`);
            console.log(`   Sipariş No: #${orderId}`);
            console.log(`   Toplam: ₺${calculatedTotal}`);
            console.log(`   Durum: PENDING_PAYMENT (Onay Bekliyor)`);
            console.log(`${'='.repeat(60)}\n`);

            res.status(201).json({
                success: true,
                message: 'Siparişiniz başarıyla alındı!',
                data: {
                    order: {
                        ...orders[0],
                        items: orderItems,
                        formattedTotal: `₺${calculatedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
                        paymentTransactionId: paymentResult.transactionId
                    }
                }
            });

        } catch (dbError) {
            await connection.rollback();
            console.error(`   ❌ Veritabanı hatası, transaction geri alındı:`, dbError.message);
            throw dbError;
        }

    } catch (error) {
        console.error('❌ Checkout error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: `Sipariş oluşturulurken bir hata oluştu: ${error.message}`
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/**
 * Payment Service Simülasyonu
 * Gerçek projede burada iyzico, PayTR, Stripe vb. entegrasyonu olur
 */
async function simulatePaymentCheck(userId, amount) {
    // Simüle edilmiş gecikme (gerçek API çağrısını taklit eder)
    await new Promise(resolve => setTimeout(resolve, 100));

    // %95 başarı oranı simülasyonu
    const isSuccess = Math.random() > 0.05;

    if (isSuccess) {
        return {
            success: true,
            transactionId: `TXN-${Date.now()}-${userId}`,
            message: 'Ödeme başarılı'
        };
    } else {
        return {
            success: false,
            error: 'Ödeme işlemi başarısız oldu. Lütfen ödeme bilgilerinizi kontrol edin.'
        };
    }
}

/**
 * GET /orders
 * Kullanıcının siparişlerini listele
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 10 } = req.query;

        let query = `SELECT * FROM orders WHERE user_id = ?`;
        const params = [userId];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const [orders] = await db.execute(query, params);

        // Her sipariş için kalemleri getir
        for (const order of orders) {
            const [items] = await db.execute(
                `SELECT * FROM order_items WHERE order_id = ?`,
                [order.id]
            );
            order.items = items;
            order.formattedTotal = `₺${parseFloat(order.total_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
        }

        // Toplam sayı
        const [countResult] = await db.execute(
            `SELECT COUNT(*) as total FROM orders WHERE user_id = ?${status ? ' AND status = ?' : ''}`,
            status ? [userId, status] : [userId]
        );

        res.json({
            success: true,
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ success: false, error: 'Siparişler getirilemedi' });
    }
});

/**
 * GET /orders/my-orders
 * Kullanıcının kendi siparişlerini listele (açık endpoint)
 * JWT'den user_id alır, sadece o kullanıcının siparişlerini döner
 */
router.get('/my-orders', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`📋 Siparişlerim çekiliyor - User ID: ${userId}`);

        // Kullanıcının tüm siparişlerini en yeniden eskiye sırala
        const [orders] = await db.execute(
            `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );

        // Her sipariş için ürün detaylarını getir
        for (const order of orders) {
            const [items] = await db.execute(
                `SELECT 
                    product_id,
                    product_name,
                    product_image,
                    price,
                    quantity,
                    subtotal
                FROM order_items 
                WHERE order_id = ?`,
                [order.id]
            );
            order.items = items;
            order.formattedTotal = `₺${parseFloat(order.total_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
            order.formattedDate = new Date(order.created_at).toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Status çevirisi
            const statusMap = {
                'PENDING_PAYMENT': 'Onay Bekliyor',
                'PAID': 'Ödendi',
                'PROCESSING': 'Hazırlanıyor',
                'SHIPPED': 'Kargoya Verildi',
                'DELIVERED': 'Teslim Edildi',
                'CANCELLED': 'İptal Edildi',
                'REFUNDED': 'İade Edildi'
            };
            order.statusText = statusMap[order.status] || order.status;
        }

        console.log(`✅ ${orders.length} sipariş bulundu`);

        res.json({
            success: true,
            data: orders,
            count: orders.length
        });

    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({ success: false, error: 'Siparişler getirilemedi' });
    }
});

/**
 * GET /orders/:id
 * Sipariş detayı
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user.id;
        const isAdmin = req.user.roles && req.user.roles.includes('ADMIN');

        // Siparişi getir
        let query = `SELECT * FROM orders WHERE id = ?`;
        const params = [orderId];

        // Admin değilse sadece kendi siparişini görebilir
        if (!isAdmin) {
            query += ` AND user_id = ?`;
            params.push(userId);
        }

        const [orders] = await db.execute(query, params);

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Sipariş bulunamadı'
            });
        }

        const order = orders[0];

        // Sipariş kalemlerini getir
        const [items] = await db.execute(
            `SELECT * FROM order_items WHERE order_id = ?`,
            [orderId]
        );

        // Status geçmişini getir
        const [statusHistory] = await db.execute(
            `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC`,
            [orderId]
        );

        order.items = items;
        order.statusHistory = statusHistory;
        order.formattedTotal = `₺${parseFloat(order.total_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;

        res.json({
            success: true,
            data: order
        });

    } catch (error) {
        console.error('Get order detail error:', error);
        res.status(500).json({ success: false, error: 'Sipariş detayı getirilemedi' });
    }
});

/**
 * PUT /orders/:id/status
 * Sipariş durumunu güncelle (Admin/Seller)
 */
router.put('/:id/status', verifyToken, requireAdminOrSeller, async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status, notes } = req.body;
        const changedBy = req.user.id;

        // Geçerli status kontrolü
        if (!status || !ORDER_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                error: `Geçersiz durum. Geçerli durumlar: ${ORDER_STATUSES.join(', ')}`
            });
        }

        // Mevcut siparişi kontrol et
        const [orders] = await db.execute(
            `SELECT * FROM orders WHERE id = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Sipariş bulunamadı'
            });
        }

        const currentOrder = orders[0];
        const oldStatus = currentOrder.status;

        // Aynı status ise güncelleme yapma
        if (oldStatus === status) {
            return res.status(400).json({
                success: false,
                error: 'Sipariş zaten bu durumda'
            });
        }

        // Status güncelle
        await db.execute(
            `UPDATE orders SET status = ? WHERE id = ?`,
            [status, orderId]
        );

        // Status geçmişine kaydet
        await db.execute(
            `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes) 
             VALUES (?, ?, ?, ?, ?)`,
            [orderId, oldStatus, status, changedBy, notes || null]
        );

        // Güncellenmiş siparişi getir
        const [updatedOrders] = await db.execute(
            `SELECT * FROM orders WHERE id = ?`,
            [orderId]
        );

        res.json({
            success: true,
            message: `Sipariş durumu güncellendi: ${oldStatus} → ${status}`,
            data: updatedOrders[0]
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ success: false, error: 'Sipariş durumu güncellenemedi' });
    }
});

/**
 * GET /orders/admin/all
 * Tüm siparişler (Admin only)
 */
router.get('/admin/all', verifyToken, requireAdminOrSeller, async (req, res) => {
    try {
        const { status, userId, page = 1, limit = 20 } = req.query;

        let query = `SELECT o.*, 
                     (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
                     FROM orders o WHERE 1=1`;
        const params = [];

        if (status) {
            query += ` AND o.status = ?`;
            params.push(status);
        }

        if (userId) {
            query += ` AND o.user_id = ?`;
            params.push(userId);
        }

        query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const [orders] = await db.execute(query, params);

        // Her sipariş için formatlı total ekle
        for (const order of orders) {
            order.formattedTotal = `₺${parseFloat(order.total_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
        }

        // Toplam sayı
        let countQuery = `SELECT COUNT(*) as total FROM orders WHERE 1=1`;
        const countParams = [];

        if (status) {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }

        if (userId) {
            countQuery += ` AND user_id = ?`;
            countParams.push(userId);
        }

        const [countResult] = await db.execute(countQuery, countParams);

        res.json({
            success: true,
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({ success: false, error: 'Siparişler getirilemedi' });
    }
});

/**
 * DELETE /orders/:id
 * Sipariş iptal (Sadece PENDING_PAYMENT durumunda)
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user.id;
        const isAdmin = req.user.roles && req.user.roles.includes('ADMIN');

        // Siparişi kontrol et
        let query = `SELECT * FROM orders WHERE id = ?`;
        const params = [orderId];

        if (!isAdmin) {
            query += ` AND user_id = ?`;
            params.push(userId);
        }

        const [orders] = await db.execute(query, params);

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Sipariş bulunamadı'
            });
        }

        const order = orders[0];

        // Sadece PENDING_PAYMENT durumunda iptal edilebilir
        if (order.status !== 'PENDING_PAYMENT' && !isAdmin) {
            return res.status(400).json({
                success: false,
                error: 'Sadece ödeme bekleyen siparişler iptal edilebilir'
            });
        }

        // Status'u CANCELLED olarak güncelle
        await db.execute(
            `UPDATE orders SET status = 'CANCELLED' WHERE id = ?`,
            [orderId]
        );

        // Status geçmişine kaydet
        await db.execute(
            `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes) 
             VALUES (?, ?, 'CANCELLED', ?, 'Kullanıcı tarafından iptal edildi')`,
            [orderId, order.status, userId]
        );

        res.json({
            success: true,
            message: 'Sipariş iptal edildi'
        });

    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ success: false, error: 'Sipariş iptal edilemedi' });
    }
});

module.exports = router;
