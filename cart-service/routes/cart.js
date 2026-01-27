/**
 * Cart Routes
 * /cart/*
 * Sepet CRUD operations with Redis storage
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { getRedisClient } = require('../config/redis');
const { verifyToken } = require('../middleware/auth');

const CART_TTL = parseInt(process.env.CART_TTL_SECONDS) || 604800; // 7 gün
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3006';

/**
 * Get cart key for user
 */
const getCartKey = (userId) => `cart:user_${userId}`;

/**
 * GET /cart
 * Get user's cart
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const redis = getRedisClient();
        const cartKey = getCartKey(req.user.id);

        const cartData = await redis.get(cartKey);
        const cart = cartData ? JSON.parse(cartData) : [];

        // Toplam hesapla
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            data: {
                items: cart,
                itemCount,
                total,
                formattedTotal: `₺${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
            }
        });

    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ success: false, error: 'Sepet getirilemedi' });
    }
});

/**
 * POST /cart/add
 * Add product to cart
 */
router.post('/add', verifyToken, async (req, res) => {
    try {
        const { product_id, quantity = 1 } = req.body;

        if (!product_id) {
            return res.status(400).json({
                success: false,
                error: 'Ürün ID zorunludur'
            });
        }

        // Product Service'den ürün bilgisini doğrula
        let product;
        try {
            const productRes = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${product_id}`);
            if (!productRes.data.success) {
                return res.status(404).json({
                    success: false,
                    error: 'Ürün bulunamadı'
                });
            }
            product = productRes.data.data;
        } catch (productError) {
            console.error('Product validation error:', productError.message);
            return res.status(404).json({
                success: false,
                error: 'Ürün doğrulanamadı veya bulunamadı'
            });
        }

        // Stok kontrolü
        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                error: `Yetersiz stok. Mevcut: ${product.stock}`
            });
        }

        const redis = getRedisClient();
        const cartKey = getCartKey(req.user.id);

        // Mevcut sepeti al
        const cartData = await redis.get(cartKey);
        let cart = cartData ? JSON.parse(cartData) : [];

        // Ürün zaten sepette mi?
        const existingIndex = cart.findIndex(item => item.productId === product_id);

        if (existingIndex > -1) {
            // Miktarı artır
            const newQuantity = cart[existingIndex].quantity + parseInt(quantity);
            if (newQuantity > product.stock) {
                return res.status(400).json({
                    success: false,
                    error: `Maksimum stok: ${product.stock}`
                });
            }
            cart[existingIndex].quantity = newQuantity;
            cart[existingIndex].price = product.price; // Güncel fiyatı al
        } else {
            // Yeni ürün ekle
            cart.push({
                productId: product_id,
                name: product.name,
                price: product.price,
                image: product.images && product.images.length > 0 ? product.images[0] : null,
                quantity: parseInt(quantity),
                addedAt: new Date().toISOString()
            });
        }

        // Redis'e kaydet (TTL ile)
        await redis.setEx(cartKey, CART_TTL, JSON.stringify(cart));

        // Toplam hesapla
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            message: 'Ürün sepetinize eklendi!',
            data: {
                items: cart,
                itemCount,
                total,
                formattedTotal: `₺${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
            }
        });

    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ success: false, error: 'Sepete ekleme başarısız' });
    }
});

/**
 * DELETE /cart/:productId
 * Remove product from cart
 */
router.delete('/:productId', verifyToken, async (req, res) => {
    try {
        const { productId } = req.params;

        const redis = getRedisClient();
        const cartKey = getCartKey(req.user.id);

        // Mevcut sepeti al
        const cartData = await redis.get(cartKey);
        if (!cartData) {
            return res.status(404).json({
                success: false,
                error: 'Sepet boş'
            });
        }

        let cart = JSON.parse(cartData);
        const initialLength = cart.length;

        // Ürünü kaldır
        cart = cart.filter(item => item.productId !== productId);

        if (cart.length === initialLength) {
            return res.status(404).json({
                success: false,
                error: 'Ürün sepette bulunamadı'
            });
        }

        // Redis'e kaydet
        if (cart.length > 0) {
            await redis.setEx(cartKey, CART_TTL, JSON.stringify(cart));
        } else {
            await redis.del(cartKey);
        }

        // Toplam hesapla
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            message: 'Ürün sepetten kaldırıldı',
            data: {
                items: cart,
                itemCount,
                total,
                formattedTotal: `₺${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
            }
        });

    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ success: false, error: 'Ürün silinemedi' });
    }
});

/**
 * PUT /cart/:productId
 * Update product quantity in cart
 */
router.put('/:productId', verifyToken, async (req, res) => {
    try {
        const { productId } = req.params;
        const { quantity } = req.body;

        if (!quantity || quantity < 1) {
            return res.status(400).json({
                success: false,
                error: 'Geçerli bir miktar giriniz'
            });
        }

        const redis = getRedisClient();
        const cartKey = getCartKey(req.user.id);

        // Mevcut sepeti al
        const cartData = await redis.get(cartKey);
        if (!cartData) {
            return res.status(404).json({
                success: false,
                error: 'Sepet boş'
            });
        }

        let cart = JSON.parse(cartData);
        const itemIndex = cart.findIndex(item => item.productId === productId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Ürün sepette bulunamadı'
            });
        }

        // Stok kontrolü
        try {
            const productRes = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
            if (productRes.data.success && productRes.data.data.stock < quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Maksimum stok: ${productRes.data.data.stock}`
                });
            }
        } catch (err) {
            // Stok kontrolü başarısız olursa devam et
        }

        cart[itemIndex].quantity = parseInt(quantity);

        // Redis'e kaydet
        await redis.setEx(cartKey, CART_TTL, JSON.stringify(cart));

        // Toplam hesapla
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            message: 'Miktar güncellendi',
            data: {
                items: cart,
                itemCount,
                total,
                formattedTotal: `₺${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
            }
        });

    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ success: false, error: 'Güncelleme başarısız' });
    }
});

/**
 * DELETE /cart
 * Clear entire cart
 */
router.delete('/', verifyToken, async (req, res) => {
    try {
        const redis = getRedisClient();
        const cartKey = getCartKey(req.user.id);

        await redis.del(cartKey);

        res.json({
            success: true,
            message: 'Sepet temizlendi',
            data: {
                items: [],
                itemCount: 0,
                total: 0,
                formattedTotal: '₺0,00'
            }
        });

    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ success: false, error: 'Sepet temizlenemedi' });
    }
});

module.exports = router;
