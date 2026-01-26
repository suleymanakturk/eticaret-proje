/**
 * Search Routes
 * GET /search endpoint - Ürün arama API
 */

const express = require('express');
const router = express.Router();
const searchRepository = require('../repositories/searchRepository');

/**
 * GET /api/search
 * Ürün arama endpoint'i
 * 
 * Query Parameters:
 * @param {string} q - Arama terimi (name, description üzerinde full-text search)
 * @param {string} category_id - Kategori filtresi
 * @param {string} seller_id - Satıcı filtresi
 * @param {number} minPrice - Minimum fiyat
 * @param {number} maxPrice - Maksimum fiyat
 * @param {string} sort - Sıralama: newest, oldest, price_asc, price_desc
 * @param {number} limit - Sayfa başına sonuç (varsayılan: 20, max: 100)
 * @param {number} offset - Başlangıç indeksi (varsayılan: 0)
 */
router.get('/', async (req, res) => {
    try {
        const {
            q,
            category_id,
            seller_id,
            minPrice,
            maxPrice,
            sort = 'newest',
            limit = '20',
            offset = '0'
        } = req.query;

        // Limit ve offset doğrulama
        let parsedLimit = parseInt(limit, 10);
        let parsedOffset = parseInt(offset, 10);

        // Limit sınırları
        if (isNaN(parsedLimit) || parsedLimit < 1) parsedLimit = 20;
        if (parsedLimit > 100) parsedLimit = 100;

        // Offset sınırları
        if (isNaN(parsedOffset) || parsedOffset < 0) parsedOffset = 0;

        // Arama yap
        const result = await searchRepository.search({
            q,
            category_id,
            seller_id,
            minPrice: minPrice ? parseFloat(minPrice) : undefined,
            maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
            sort,
            limit: parsedLimit,
            offset: parsedOffset
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Arama hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Arama sırasında bir hata oluştu'
        });
    }
});

/**
 * GET /api/search/suggestions
 * Otomatik tamamlama önerileri (gelecek geliştirme için)
 */
router.get('/suggestions', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json({
                success: true,
                data: { suggestions: [] }
            });
        }

        // Basit öneri: İlk 5 eşleşen ürün ismi
        const result = await searchRepository.search({
            q: q.trim(),
            limit: 5,
            offset: 0
        });

        const suggestions = result.products.map(p => ({
            id: p._id,
            name: p.name,
            price: p.price
        }));

        res.json({
            success: true,
            data: { suggestions }
        });
    } catch (error) {
        console.error('Öneri hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Öneriler alınırken bir hata oluştu'
        });
    }
});

module.exports = router;
