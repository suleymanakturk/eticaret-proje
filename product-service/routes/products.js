/**
 * Product Routes
 * /api/products/*
 * CRUD operations for products
 */

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { verifyToken, requireSeller, optionalAuth } = require('../middleware/auth');
const { upload } = require('../config/s3');

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * GET /api/products
 * Get all active products (public)
 */
router.get('/', async (req, res) => {
    try {
        const {
            category_id,
            search,
            minPrice,
            maxPrice,
            sort = 'createdAt',
            order = 'desc',
            page = 1,
            limit = 20
        } = req.query;

        // Build query
        const query = { isActive: true };

        if (category_id) {
            query.category_id = category_id;
        }

        if (search) {
            query.$text = { $search: search };
        }

        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort
        const sortObj = {};
        sortObj[sort] = order === 'asc' ? 1 : -1;

        const [products, total] = await Promise.all([
            Product.find(query)
                .sort(sortObj)
                .skip(skip)
                .limit(parseInt(limit)),
            Product.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ success: false, error: 'Ürünler getirilemedi' });
    }
});

/**
 * GET /api/products/:id
 * Get single product by ID (public)
 */
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        res.json({ success: true, data: product });

    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ success: false, error: 'Ürün getirilemedi' });
    }
});

// ============================================
// SELLER ROUTES (Protected)
// ============================================

/**
 * GET /api/products/seller/my-products
 * Get seller's own products
 */
router.get('/seller/my-products', verifyToken, requireSeller, async (req, res) => {
    try {
        const products = await Product.find({ seller_id: req.user.id })
            .sort({ createdAt: -1 });

        res.json({ success: true, data: products });

    } catch (error) {
        console.error('Get my products error:', error);
        res.status(500).json({ success: false, error: 'Ürünler getirilemedi' });
    }
});

/**
 * POST /api/products
 * Create new product (SELLER only)
 */
router.post('/', verifyToken, requireSeller, async (req, res) => {
    try {
        const { name, description, price, stock, category_id, attributes } = req.body;

        // Validation
        if (!name || !price || !category_id) {
            return res.status(400).json({
                success: false,
                error: 'Ürün adı, fiyat ve kategori zorunludur'
            });
        }

        // Create product with seller_id from JWT
        const product = new Product({
            name,
            description,
            price: parseFloat(price),
            stock: parseInt(stock) || 0,
            category_id,
            seller_id: req.user.id, // JWT'den otomatik alınır
            attributes: attributes || {}
        });

        await product.save();

        res.status(201).json({
            success: true,
            message: 'Ürün başarıyla eklendi',
            data: product
        });

    } catch (error) {
        console.error('Create product error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: 'Ürün eklenemedi' });
    }
});

/**
 * PUT /api/products/:id
 * Update product (SELLER only, own products)
 */
router.put('/:id', verifyToken, requireSeller, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        // Check ownership
        if (product.seller_id !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Bu ürünü düzenleme yetkiniz yok'
            });
        }

        const { name, description, price, stock, category_id, attributes, isActive } = req.body;

        // Update fields
        if (name !== undefined) product.name = name;
        if (description !== undefined) product.description = description;
        if (price !== undefined) product.price = parseFloat(price);
        if (stock !== undefined) product.stock = parseInt(stock);
        if (category_id !== undefined) product.category_id = category_id;
        if (attributes !== undefined) product.attributes = new Map(Object.entries(attributes));
        if (isActive !== undefined) product.isActive = isActive;

        await product.save();

        res.json({
            success: true,
            message: 'Ürün güncellendi',
            data: product
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, error: 'Ürün güncellenemedi' });
    }
});

/**
 * DELETE /api/products/:id
 * Delete product (SELLER only, own products)
 */
router.delete('/:id', verifyToken, requireSeller, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        // Check ownership
        if (product.seller_id !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Bu ürünü silme yetkiniz yok'
            });
        }

        await Product.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Ürün silindi' });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, error: 'Ürün silinemedi' });
    }
});

/**
 * POST /api/products/:id/images
 * Upload images to product (SELLER only)
 */
router.post('/:id/images', verifyToken, requireSeller, upload.array('images', 5), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        // Check ownership
        if (product.seller_id !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Bu ürüne görsel ekleme yetkiniz yok'
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'En az bir görsel seçilmeli' });
        }

        // Add S3 URLs to product
        const imageUrls = req.files.map(file => file.location);
        product.images.push(...imageUrls);
        await product.save();

        res.json({
            success: true,
            message: `${imageUrls.length} görsel eklendi`,
            data: {
                addedImages: imageUrls,
                allImages: product.images
            }
        });

    } catch (error) {
        console.error('Upload images error:', error);
        res.status(500).json({ success: false, error: 'Görseller yüklenemedi' });
    }
});

/**
 * DELETE /api/products/:id/images/:imageIndex
 * Remove image from product (SELLER only)
 */
router.delete('/:id/images/:imageIndex', verifyToken, requireSeller, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        // Check ownership
        if (product.seller_id !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Bu ürünün görselini silme yetkiniz yok'
            });
        }

        const imageIndex = parseInt(req.params.imageIndex);
        if (imageIndex < 0 || imageIndex >= product.images.length) {
            return res.status(400).json({ success: false, error: 'Geçersiz görsel indeksi' });
        }

        // Remove image from array
        const removedImage = product.images.splice(imageIndex, 1);
        await product.save();

        res.json({
            success: true,
            message: 'Görsel silindi',
            data: { removedImage: removedImage[0] }
        });

    } catch (error) {
        console.error('Delete image error:', error);
        res.status(500).json({ success: false, error: 'Görsel silinemedi' });
    }
});

// ============================================
// INTERNAL SERVICE ROUTES (for Order Service)
// ============================================

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'internal-service-secret-key-2024';

/**
 * POST /api/products/internal/decrement-stock
 * Decrement stock for multiple products (Internal - Order Service only)
 * Body: { items: [{ productId, quantity }, ...] }
 */
router.post('/internal/decrement-stock', async (req, res) => {
    // Internal service key doğrulama
    const serviceKey = req.headers['x-service-key'];
    if (serviceKey !== INTERNAL_SERVICE_KEY) {
        return res.status(401).json({
            success: false,
            error: 'Yetkisiz erişim'
        });
    }

    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'items array zorunludur'
            });
        }

        console.log(`\n📦 Stok düşürme isteği alındı: ${items.length} ürün`);

        const results = [];
        const errors = [];

        for (const item of items) {
            try {
                const product = await Product.findById(item.productId);

                if (!product) {
                    errors.push({ productId: item.productId, error: 'Ürün bulunamadı' });
                    continue;
                }

                const oldStock = product.stock;
                const newStock = Math.max(0, oldStock - item.quantity);

                product.stock = newStock;
                await product.save();

                console.log(`   ✅ ${product.name}: ${oldStock} → ${newStock} (${item.quantity} adet düşüldü)`);

                results.push({
                    productId: item.productId,
                    productName: product.name,
                    oldStock,
                    newStock,
                    decremented: item.quantity
                });

            } catch (err) {
                console.error(`   ❌ ${item.productId}: ${err.message}`);
                errors.push({ productId: item.productId, error: err.message });
            }
        }

        res.json({
            success: true,
            message: `${results.length} ürün stoğu güncellendi`,
            data: { updated: results, errors }
        });

    } catch (error) {
        console.error('Decrement stock error:', error);
        res.status(500).json({ success: false, error: 'Stok güncellenemedi' });
    }
});

module.exports = router;
