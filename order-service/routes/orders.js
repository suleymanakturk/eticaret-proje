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
 */
router.post('/', verifyToken, async (req, res) => {
    const connection = await db.getConnection();

    try {
        const userId = req.user.id;
        const { shippingAddress, billingAddress, notes } = req.body;

        // 1. Cart Service'den kullanıcının sepetini çek
        let cartData;
        try {
            const token = req.headers.authorization;
            const cartResponse = await axios.get(`${CART_SERVICE_URL}/cart`, {
                headers: { Authorization: token }
            });

            if (!cartResponse.data.success || !cartResponse.data.data.items.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Sepetiniz boş'
                });
            }

            cartData = cartResponse.data.data;
        } catch (cartError) {
            console.error('Cart fetch error:', cartError.message);
            return res.status(503).json({
                success: false,
                error: 'Sepet bilgisi alınamadı'
            });
        }

        // 2. Her ürün için stok ve fiyat doğrulaması
        const validatedItems = [];
        let calculatedTotal = 0;

        for (const item of cartData.items) {
            try {
                const productResponse = await axios.get(
                    `${PRODUCT_SERVICE_URL}/api/products/${item.productId}`
                );

                if (!productResponse.data.success) {
                    return res.status(400).json({
                        success: false,
                        error: `Ürün bulunamadı: ${item.name}`
                    });
                }

                const product = productResponse.data.data;

                // Stok kontrolü
                if (product.stock < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        error: `Yetersiz stok: ${item.name} (Mevcut: ${product.stock})`
                    });
                }

                // Doğrulanmış ürün bilgisi
                const subtotal = product.price * item.quantity;
                validatedItems.push({
                    productId: item.productId,
                    productName: product.name,
                    productImage: product.images && product.images.length > 0 ? product.images[0] : null,
                    price: product.price,
                    quantity: item.quantity,
                    subtotal: subtotal
                });

                calculatedTotal += subtotal;

            } catch (productError) {
                console.error('Product validation error:', productError.message);
                return res.status(400).json({
                    success: false,
                    error: `Ürün doğrulanamadı: ${item.name}`
                });
            }
        }

        // 3. Transaction başlat
        await connection.beginTransaction();

        try {
            // 4. Siparişi oluştur
            const [orderResult] = await connection.execute(
                `INSERT INTO orders (user_id, total_price, status, shipping_address, billing_address, notes) 
                 VALUES (?, ?, 'PENDING_PAYMENT', ?, ?, ?)`,
                [userId, calculatedTotal, shippingAddress || null, billingAddress || null, notes || null]
            );

            const orderId = orderResult.insertId;

            // 5. Sipariş kalemlerini ekle
            for (const item of validatedItems) {
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, subtotal) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [orderId, item.productId, item.productName, item.productImage, item.price, item.quantity, item.subtotal]
                );
            }

            // 6. Status history'ye kaydet
            await connection.execute(
                `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes) 
                 VALUES (?, NULL, 'PENDING_PAYMENT', ?, 'Sipariş oluşturuldu')`,
                [orderId, userId]
            );

            // Transaction'ı onayla
            await connection.commit();

            // 7. Cart Service'e sepeti temizle mesajı gönder
            try {
                const token = req.headers.authorization;
                await axios.delete(`${CART_SERVICE_URL}/cart`, {
                    headers: { Authorization: token }
                });
                console.log(`✅ Sepet temizlendi (User: ${userId})`);
            } catch (clearCartError) {
                // Sepet temizleme hatası kritik değil, log'la ve devam et
                console.error('Sepet temizleme hatası:', clearCartError.message);
            }

            // 8. Oluşturulan siparişi getir
            const [orders] = await db.execute(
                `SELECT * FROM orders WHERE id = ?`,
                [orderId]
            );

            const [orderItems] = await db.execute(
                `SELECT * FROM order_items WHERE order_id = ?`,
                [orderId]
            );

            res.status(201).json({
                success: true,
                message: 'Sipariş başarıyla oluşturuldu',
                data: {
                    order: {
                        ...orders[0],
                        items: orderItems,
                        formattedTotal: `₺${calculatedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                    }
                }
            });

        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        }

    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ success: false, error: 'Sipariş oluşturulamadı' });
    } finally {
        connection.release();
    }
});

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
