/**
 * INVENTORY ROUTES
 * Stok yönetimi ve rezervasyon API'leri
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyInternalService, requireAdminOrSeller } = require('../middleware/auth');

// =============================================
// POST /inventory/init
// Yeni ürün için stok kaydı oluştur
// Product Service'ten yeni ürün eklendiğinde çağrılır
// =============================================
router.post('/init', verifyInternalService, async (req, res) => {
    let connection;

    try {
        const { productId, initialStock = 0 } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                error: 'productId zorunludur'
            });
        }

        connection = await db.getConnection();

        // Önce var mı kontrol et
        const [existing] = await connection.execute(
            'SELECT id FROM stocks WHERE product_id = ?',
            [productId]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({
                success: false,
                error: 'Bu ürün için stok kaydı zaten mevcut'
            });
        }

        // Yeni stok kaydı oluştur
        const [result] = await connection.execute(
            'INSERT INTO stocks (product_id, quantity, reserved_quantity) VALUES (?, ?, 0)',
            [productId, initialStock]
        );

        // Transaction log
        await connection.execute(
            `INSERT INTO stock_transactions 
             (product_id, transaction_type, quantity_change, previous_quantity, previous_reserved, new_quantity, new_reserved, notes) 
             VALUES (?, 'INIT', ?, 0, 0, ?, 0, 'Stok kaydı oluşturuldu')`,
            [productId, initialStock, initialStock]
        );

        connection.release();

        console.log(`✅ Stok kaydı oluşturuldu: ${productId}, Miktar: ${initialStock}`);

        res.status(201).json({
            success: true,
            message: 'Stok kaydı oluşturuldu',
            data: {
                productId,
                quantity: initialStock,
                reservedQuantity: 0,
                availableStock: initialStock
            }
        });

    } catch (error) {
        if (connection) connection.release();
        console.error('Init stock error:', error);
        res.status(500).json({ success: false, error: 'Stok kaydı oluşturulamadı' });
    }
});

// =============================================
// GET /inventory/:productId
// Ürün stok bilgisini getir
// =============================================
router.get('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;

        const [stocks] = await db.execute(
            'SELECT * FROM stocks WHERE product_id = ?',
            [productId]
        );

        if (stocks.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Ürün stok kaydı bulunamadı'
            });
        }

        const stock = stocks[0];
        const availableStock = stock.quantity - stock.reserved_quantity;

        res.json({
            success: true,
            data: {
                productId: stock.product_id,
                quantity: stock.quantity,
                reservedQuantity: stock.reserved_quantity,
                availableStock: availableStock,
                inStock: availableStock > 0,
                updatedAt: stock.updated_at
            }
        });

    } catch (error) {
        console.error('Get stock error:', error);
        res.status(500).json({ success: false, error: 'Stok bilgisi alınamadı' });
    }
});

// =============================================
// POST /inventory/reserve
// Stok rezerve et (sipariş oluşturma aşamasında)
// Atomik güncelleme ile race condition önlenir
// =============================================
router.post('/reserve', verifyInternalService, async (req, res) => {
    let connection;

    try {
        const { productId, quantity, orderId, userId } = req.body;

        if (!productId || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                error: 'productId ve quantity (pozitif) zorunludur'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Mevcut stok bilgisini al (FOR UPDATE ile kilitle)
        const [currentStock] = await connection.execute(
            'SELECT * FROM stocks WHERE product_id = ? FOR UPDATE',
            [productId]
        );

        if (currentStock.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Ürün stok kaydı bulunamadı'
            });
        }

        const stock = currentStock[0];
        const availableStock = stock.quantity - stock.reserved_quantity;

        // Yeterli stok var mı kontrol et
        if (availableStock < quantity) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Yetersiz stok',
                data: {
                    productId,
                    requestedQuantity: quantity,
                    availableStock: availableStock
                }
            });
        }

        // Atomik güncelleme - rezervasyon ekle
        const [updateResult] = await connection.execute(
            `UPDATE stocks 
             SET reserved_quantity = reserved_quantity + ? 
             WHERE product_id = ? AND (quantity - reserved_quantity) >= ?`,
            [quantity, productId, quantity]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Stok rezervasyonu başarısız (race condition)'
            });
        }

        // Transaction log
        await connection.execute(
            `INSERT INTO stock_transactions 
             (product_id, transaction_type, quantity_change, previous_quantity, previous_reserved, new_quantity, new_reserved, order_id, user_id, notes) 
             VALUES (?, 'RESERVE', ?, ?, ?, ?, ?, ?, ?, 'Stok rezerve edildi')`,
            [productId, quantity, stock.quantity, stock.reserved_quantity,
                stock.quantity, stock.reserved_quantity + quantity, orderId || null, userId || null]
        );

        await connection.commit();
        connection.release();

        console.log(`🔒 Stok rezerve edildi: ${productId}, Miktar: ${quantity}`);

        res.json({
            success: true,
            message: 'Stok başarıyla rezerve edildi',
            data: {
                productId,
                reservedQuantity: quantity,
                newAvailableStock: availableStock - quantity
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Reserve stock error:', error);
        res.status(500).json({ success: false, error: 'Stok rezervasyonu başarısız' });
    }
});

// =============================================
// POST /inventory/confirm
// Rezervasyonu onayla (ödeme başarılı olduğunda)
// Reserved'den düş + ana stoktan düş
// =============================================
router.post('/confirm', verifyInternalService, async (req, res) => {
    let connection;

    try {
        const { productId, quantity, orderId, userId } = req.body;

        if (!productId || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                error: 'productId ve quantity (pozitif) zorunludur'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Mevcut stok bilgisini al
        const [currentStock] = await connection.execute(
            'SELECT * FROM stocks WHERE product_id = ? FOR UPDATE',
            [productId]
        );

        if (currentStock.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Ürün stok kaydı bulunamadı'
            });
        }

        const stock = currentStock[0];

        // Yeterli rezervasyon var mı kontrol et
        if (stock.reserved_quantity < quantity) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Yetersiz rezervasyon miktarı',
                data: {
                    productId,
                    requestedQuantity: quantity,
                    reservedQuantity: stock.reserved_quantity
                }
            });
        }

        // Atomik güncelleme - ana stoktan düş + rezervasyondan düş
        const [updateResult] = await connection.execute(
            `UPDATE stocks 
             SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ? 
             WHERE product_id = ? AND reserved_quantity >= ?`,
            [quantity, quantity, productId, quantity]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Stok onaylama başarısız'
            });
        }

        // Transaction log
        await connection.execute(
            `INSERT INTO stock_transactions 
             (product_id, transaction_type, quantity_change, previous_quantity, previous_reserved, new_quantity, new_reserved, order_id, user_id, notes) 
             VALUES (?, 'CONFIRM', ?, ?, ?, ?, ?, ?, ?, 'Sipariş onaylandı, stok düşüldü')`,
            [productId, -quantity, stock.quantity, stock.reserved_quantity,
                stock.quantity - quantity, stock.reserved_quantity - quantity, orderId || null, userId || null]
        );

        await connection.commit();
        connection.release();

        console.log(`✅ Stok onaylandı: ${productId}, Düşülen: ${quantity}`);

        res.json({
            success: true,
            message: 'Stok başarıyla onaylandı ve düşüldü',
            data: {
                productId,
                confirmedQuantity: quantity,
                newQuantity: stock.quantity - quantity
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Confirm stock error:', error);
        res.status(500).json({ success: false, error: 'Stok onaylama başarısız' });
    }
});

// =============================================
// POST /inventory/release
// Rezervasyonu iptal et (ödeme başarısız veya sipariş iptali)
// =============================================
router.post('/release', verifyInternalService, async (req, res) => {
    let connection;

    try {
        const { productId, quantity, orderId, userId, reason } = req.body;

        if (!productId || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                error: 'productId ve quantity (pozitif) zorunludur'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Mevcut stok bilgisini al
        const [currentStock] = await connection.execute(
            'SELECT * FROM stocks WHERE product_id = ? FOR UPDATE',
            [productId]
        );

        if (currentStock.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Ürün stok kaydı bulunamadı'
            });
        }

        const stock = currentStock[0];

        // Yeterli rezervasyon var mı kontrol et
        if (stock.reserved_quantity < quantity) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Yetersiz rezervasyon miktarı',
                data: {
                    productId,
                    requestedQuantity: quantity,
                    reservedQuantity: stock.reserved_quantity
                }
            });
        }

        // Atomik güncelleme - sadece rezervasyondan düş
        const [updateResult] = await connection.execute(
            `UPDATE stocks 
             SET reserved_quantity = reserved_quantity - ? 
             WHERE product_id = ? AND reserved_quantity >= ?`,
            [quantity, productId, quantity]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Rezervasyon iptali başarısız'
            });
        }

        // Transaction log
        await connection.execute(
            `INSERT INTO stock_transactions 
             (product_id, transaction_type, quantity_change, previous_quantity, previous_reserved, new_quantity, new_reserved, order_id, user_id, notes) 
             VALUES (?, 'RELEASE', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [productId, quantity, stock.quantity, stock.reserved_quantity,
                stock.quantity, stock.reserved_quantity - quantity, orderId || null, userId || null,
                reason || 'Rezervasyon iptal edildi']
        );

        await connection.commit();
        connection.release();

        console.log(`🔓 Rezervasyon iptal edildi: ${productId}, Miktar: ${quantity}`);

        res.json({
            success: true,
            message: 'Rezervasyon başarıyla iptal edildi',
            data: {
                productId,
                releasedQuantity: quantity,
                newAvailableStock: stock.quantity - (stock.reserved_quantity - quantity)
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Release stock error:', error);
        res.status(500).json({ success: false, error: 'Rezervasyon iptali başarısız' });
    }
});

// =============================================
// PUT /inventory/:productId
// Stok miktarını güncelle (Admin/Seller)
// =============================================
router.put('/:productId', verifyToken, requireAdminOrSeller, async (req, res) => {
    let connection;

    try {
        const { productId } = req.params;
        const { quantity, operation = 'SET' } = req.body;

        if (quantity === undefined || quantity === null) {
            return res.status(400).json({
                success: false,
                error: 'quantity zorunludur'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Mevcut stok bilgisini al
        const [currentStock] = await connection.execute(
            'SELECT * FROM stocks WHERE product_id = ? FOR UPDATE',
            [productId]
        );

        if (currentStock.length === 0) {
            // Stok kaydı yoksa oluştur
            await connection.execute(
                'INSERT INTO stocks (product_id, quantity, reserved_quantity) VALUES (?, ?, 0)',
                [productId, Math.max(0, quantity)]
            );

            await connection.execute(
                `INSERT INTO stock_transactions 
                 (product_id, transaction_type, quantity_change, previous_quantity, previous_reserved, new_quantity, new_reserved, user_id, notes) 
                 VALUES (?, 'INIT', ?, 0, 0, ?, 0, ?, 'Stok kaydı oluşturuldu ve güncellendi')`,
                [productId, quantity, Math.max(0, quantity), req.user.id]
            );

            await connection.commit();
            connection.release();

            return res.json({
                success: true,
                message: 'Stok kaydı oluşturuldu',
                data: {
                    productId,
                    quantity: Math.max(0, quantity),
                    reservedQuantity: 0
                }
            });
        }

        const stock = currentStock[0];
        let newQuantity;
        let transactionType;

        switch (operation.toUpperCase()) {
            case 'ADD':
                newQuantity = stock.quantity + quantity;
                transactionType = 'ADD';
                break;
            case 'REMOVE':
                newQuantity = Math.max(stock.reserved_quantity, stock.quantity - quantity);
                transactionType = 'REMOVE';
                break;
            case 'SET':
            default:
                newQuantity = Math.max(stock.reserved_quantity, quantity);
                transactionType = quantity >= stock.quantity ? 'ADD' : 'REMOVE';
                break;
        }

        // Güncelle
        await connection.execute(
            'UPDATE stocks SET quantity = ? WHERE product_id = ?',
            [newQuantity, productId]
        );

        // Transaction log
        await connection.execute(
            `INSERT INTO stock_transactions 
             (product_id, transaction_type, quantity_change, previous_quantity, previous_reserved, new_quantity, new_reserved, user_id, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [productId, transactionType, newQuantity - stock.quantity, stock.quantity, stock.reserved_quantity,
                newQuantity, stock.reserved_quantity, req.user.id, `Stok ${operation} işlemi yapıldı`]
        );

        await connection.commit();
        connection.release();

        console.log(`📦 Stok güncellendi: ${productId}, Yeni miktar: ${newQuantity}`);

        res.json({
            success: true,
            message: 'Stok başarıyla güncellendi',
            data: {
                productId,
                previousQuantity: stock.quantity,
                newQuantity,
                reservedQuantity: stock.reserved_quantity,
                availableStock: newQuantity - stock.reserved_quantity
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Update stock error:', error);
        res.status(500).json({ success: false, error: 'Stok güncellenemedi' });
    }
});

// =============================================
// GET /inventory/batch/check
// Toplu stok kontrolü (sipariş için)
// =============================================
router.post('/batch/check', verifyInternalService, async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'items array zorunludur'
            });
        }

        const results = [];
        let allAvailable = true;

        for (const item of items) {
            const [stocks] = await db.execute(
                'SELECT * FROM stocks WHERE product_id = ?',
                [item.productId]
            );

            if (stocks.length === 0) {
                results.push({
                    productId: item.productId,
                    requested: item.quantity,
                    available: 0,
                    isAvailable: false,
                    error: 'Stok kaydı bulunamadı'
                });
                allAvailable = false;
            } else {
                const stock = stocks[0];
                const availableStock = stock.quantity - stock.reserved_quantity;
                const isAvailable = availableStock >= item.quantity;

                results.push({
                    productId: item.productId,
                    requested: item.quantity,
                    available: availableStock,
                    isAvailable
                });

                if (!isAvailable) allAvailable = false;
            }
        }

        res.json({
            success: true,
            data: {
                allAvailable,
                items: results
            }
        });

    } catch (error) {
        console.error('Batch check error:', error);
        res.status(500).json({ success: false, error: 'Toplu stok kontrolü başarısız' });
    }
});

// =============================================
// GET /inventory/all (Admin)
// Tüm stok kayıtlarını listele
// =============================================
router.get('/', verifyToken, requireAdminOrSeller, async (req, res) => {
    try {
        const { page = 1, limit = 20, lowStock } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = 'SELECT * FROM stocks';
        const params = [];

        if (lowStock) {
            query += ' WHERE (quantity - reserved_quantity) <= ?';
            params.push(parseInt(lowStock));
        }

        query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [stocks] = await db.execute(query, params);

        // Her stok için available hesapla
        const stocksWithAvailable = stocks.map(stock => ({
            productId: stock.product_id,
            quantity: stock.quantity,
            reservedQuantity: stock.reserved_quantity,
            availableStock: stock.quantity - stock.reserved_quantity,
            inStock: (stock.quantity - stock.reserved_quantity) > 0,
            updatedAt: stock.updated_at
        }));

        // Toplam sayı
        const [countResult] = await db.execute(
            `SELECT COUNT(*) as total FROM stocks ${lowStock ? 'WHERE (quantity - reserved_quantity) <= ?' : ''}`,
            lowStock ? [parseInt(lowStock)] : []
        );

        res.json({
            success: true,
            data: stocksWithAvailable,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get all stocks error:', error);
        res.status(500).json({ success: false, error: 'Stok listesi alınamadı' });
    }
});

module.exports = router;
