/**
 * CATEGORY ROUTES
 * /api/categories/*
 * Kategori, Ürün Türü, Marka CRUD işlemleri
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// SPECIFIC ROUTES FIRST (before :id routes)
// ============================================

/**
 * GET /api/categories/flat
 * Tüm verileri düz liste olarak getir (admin için)
 */
router.get('/flat', async (req, res) => {
    try {
        const [categories] = await db.execute('SELECT * FROM categories ORDER BY name');
        const [types] = await db.execute('SELECT * FROM product_types ORDER BY name');
        const [brands] = await db.execute('SELECT * FROM brands ORDER BY name');

        res.json({
            success: true,
            data: {
                categories: categories.map(c => ({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    icon: c.icon,
                    isActive: c.is_active
                })),
                productTypes: types.map(t => ({
                    id: t.id,
                    categoryId: t.category_id,
                    name: t.name,
                    description: t.description,
                    isActive: t.is_active
                })),
                brands: brands.map(b => ({
                    id: b.id,
                    productTypeId: b.product_type_id,
                    name: b.name,
                    logoUrl: b.logo_url,
                    isActive: b.is_active
                }))
            }
        });

    } catch (error) {
        console.error('Get flat data error:', error);
        res.status(500).json({ success: false, error: 'Veriler getirilemedi' });
    }
});

// ============================================
// PRODUCT TYPES - Specific routes before /:id
// ============================================

/**
 * PUT /api/categories/types/:id
 * Ürün türü güncelle
 */
router.put('/types/:id', async (req, res) => {
    try {
        const { name, description, isActive } = req.body;
        const typeId = req.params.id;

        // Convert undefined to null for MySQL2
        const params = [
            name !== undefined ? name : null,
            description !== undefined ? description : null,
            isActive !== undefined ? isActive : null,
            typeId
        ];

        await db.execute(
            'UPDATE product_types SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?',
            params
        );

        res.json({ success: true, message: 'Ürün türü güncellendi' });

    } catch (error) {
        console.error('Update product type error:', error);
        res.status(500).json({ success: false, error: 'Ürün türü güncellenemedi' });
    }
});

/**
 * DELETE /api/categories/types/:id
 * Ürün türü sil
 */
router.delete('/types/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM product_types WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Ürün türü silindi' });
    } catch (error) {
        console.error('Delete product type error:', error);
        res.status(500).json({ success: false, error: 'Ürün türü silinemedi' });
    }
});

/**
 * POST /api/categories/types/:id/brands
 * Ürün türüne marka ekle
 */
router.post('/types/:id/brands', async (req, res) => {
    try {
        const productTypeId = req.params.id;
        const { name, logoUrl } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Marka adı zorunlu' });
        }

        const [result] = await db.execute(
            'INSERT INTO brands (product_type_id, name, logo_url) VALUES (?, ?, ?)',
            [productTypeId, name, logoUrl || null]
        );

        res.status(201).json({
            success: true,
            message: 'Marka eklendi',
            data: { id: result.insertId, productTypeId, name, logoUrl }
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Bu marka bu ürün türünde zaten mevcut' });
        }
        console.error('Add brand error:', error);
        res.status(500).json({ success: false, error: 'Marka eklenemedi' });
    }
});

// ============================================
// BRANDS - Specific routes before /:id
// ============================================

/**
 * PUT /api/categories/brands/:id
 * Marka güncelle
 */
router.put('/brands/:id', async (req, res) => {
    try {
        const { name, logoUrl, isActive } = req.body;

        // Convert undefined to null for MySQL2
        const params = [
            name !== undefined ? name : null,
            logoUrl !== undefined ? logoUrl : null,
            isActive !== undefined ? isActive : null,
            req.params.id
        ];

        await db.execute(
            'UPDATE brands SET name = COALESCE(?, name), logo_url = COALESCE(?, logo_url), is_active = COALESCE(?, is_active) WHERE id = ?',
            params
        );

        res.json({ success: true, message: 'Marka güncellendi' });

    } catch (error) {
        console.error('Update brand error:', error);
        res.status(500).json({ success: false, error: 'Marka güncellenemedi' });
    }
});

/**
 * DELETE /api/categories/brands/:id
 * Marka sil
 */
router.delete('/brands/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM brands WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Marka silindi' });
    } catch (error) {
        console.error('Delete brand error:', error);
        res.status(500).json({ success: false, error: 'Marka silinemedi' });
    }
});

// ============================================
// CATEGORY ROUTES (with :id parameter)
// ============================================

/**
 * GET /api/categories
 * Tüm kategorileri nested (iç içe) formatında getir
 */
router.get('/', async (req, res) => {
    try {
        const [categories] = await db.execute(
            'SELECT id, name, description, icon FROM categories WHERE is_active = TRUE ORDER BY name'
        );

        const result = await Promise.all(categories.map(async (category) => {
            const [types] = await db.execute(
                'SELECT id, name, description FROM product_types WHERE category_id = ? AND is_active = TRUE ORDER BY name',
                [category.id]
            );

            const typesWithBrands = await Promise.all(types.map(async (type) => {
                const [brands] = await db.execute(
                    'SELECT id, name, logo_url FROM brands WHERE product_type_id = ? AND is_active = TRUE ORDER BY name',
                    [type.id]
                );

                return {
                    id: type.id,
                    name: type.name,
                    description: type.description,
                    brands: brands.map(b => ({ id: b.id, name: b.name, logoUrl: b.logo_url }))
                };
            }));

            return {
                id: category.id,
                name: category.name,
                description: category.description,
                icon: category.icon,
                types: typesWithBrands
            };
        }));

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, error: 'Kategoriler getirilemedi' });
    }
});

/**
 * POST /api/categories
 * Yeni kategori ekle
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, icon } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Kategori adı zorunlu' });
        }

        const [result] = await db.execute(
            'INSERT INTO categories (name, description, icon) VALUES (?, ?, ?)',
            [name, description || null, icon || null]
        );

        res.status(201).json({
            success: true,
            message: 'Kategori eklendi',
            data: { id: result.insertId, name, description, icon }
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Bu kategori zaten mevcut' });
        }
        console.error('Add category error:', error);
        res.status(500).json({ success: false, error: 'Kategori eklenemedi' });
    }
});

/**
 * GET /api/categories/:id
 * Tek kategori detayı
 */
router.get('/:id', async (req, res) => {
    try {
        const [categories] = await db.execute(
            'SELECT * FROM categories WHERE id = ?',
            [req.params.id]
        );

        if (categories.length === 0) {
            return res.status(404).json({ success: false, error: 'Kategori bulunamadı' });
        }

        const category = categories[0];

        const [types] = await db.execute(
            'SELECT id, name, description FROM product_types WHERE category_id = ? AND is_active = TRUE',
            [category.id]
        );

        res.json({
            success: true,
            data: {
                id: category.id,
                name: category.name,
                description: category.description,
                icon: category.icon,
                types
            }
        });

    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ success: false, error: 'Kategori getirilemedi' });
    }
});

/**
 * PUT /api/categories/:id
 * Kategori güncelle
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, description, icon, isActive } = req.body;

        // Convert undefined to null for MySQL2
        const params = [
            name !== undefined ? name : null,
            description !== undefined ? description : null,
            icon !== undefined ? icon : null,
            isActive !== undefined ? isActive : null,
            req.params.id
        ];

        await db.execute(
            'UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description), icon = COALESCE(?, icon), is_active = COALESCE(?, is_active) WHERE id = ?',
            params
        );

        res.json({ success: true, message: 'Kategori güncellendi' });

    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ success: false, error: 'Kategori güncellenemedi' });
    }
});

/**
 * DELETE /api/categories/:id
 * Kategori sil (cascade ile types ve brands da silinir)
 */
router.delete('/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Kategori silindi' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ success: false, error: 'Kategori silinemedi' });
    }
});

/**
 * POST /api/categories/:id/types
 * Kategoriye ürün türü ekle
 */
router.post('/:id/types', async (req, res) => {
    try {
        const categoryId = req.params.id;
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Ürün türü adı zorunlu' });
        }

        const [result] = await db.execute(
            'INSERT INTO product_types (category_id, name, description) VALUES (?, ?, ?)',
            [categoryId, name, description || null]
        );

        res.status(201).json({
            success: true,
            message: 'Ürün türü eklendi',
            data: { id: result.insertId, categoryId, name, description }
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Bu ürün türü bu kategoride zaten mevcut' });
        }
        console.error('Add product type error:', error);
        res.status(500).json({ success: false, error: 'Ürün türü eklenemedi' });
    }
});

module.exports = router;

