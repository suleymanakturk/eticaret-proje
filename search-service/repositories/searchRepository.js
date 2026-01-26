/**
 * Search Repository
 * MongoDB implementasyonu - İleride Elasticsearch için genişletilebilir
 * 
 * Bu repository pattern, veri kaynağını soyutlayarak gelecekte
 * Elasticsearch veya başka bir arama motoruna geçişi kolaylaştırır.
 */

const Product = require('../models/Product');

class SearchRepository {
    /**
     * Ana arama fonksiyonu
     * @param {Object} options - Arama seçenekleri
     * @param {string} options.q - Arama terimi
     * @param {string} options.category_id - Kategori filtresi
     * @param {string} options.seller_id - Satıcı filtresi
     * @param {number} options.minPrice - Minimum fiyat
     * @param {number} options.maxPrice - Maksimum fiyat
     * @param {string} options.sort - Sıralama: 'newest', 'price_asc', 'price_desc'
     * @param {number} options.limit - Sayfa başına sonuç sayısı
     * @param {number} options.offset - Başlangıç indeksi
     * @returns {Promise<Object>} - Arama sonuçları ve pagination bilgisi
     */
    async search(options = {}) {
        const {
            q,
            category_id,
            seller_id,
            minPrice,
            maxPrice,
            sort = 'newest',
            limit = 20,
            offset = 0
        } = options;

        // Query oluştur
        const query = this.buildQuery({ q, category_id, seller_id, minPrice, maxPrice });

        // Sıralama belirle
        const sortOption = this.buildSort(sort);

        // Toplam sayıyı al
        const total = await Product.countDocuments(query);

        // Ürünleri getir
        const products = await Product.find(query)
            .sort(sortOption)
            .skip(offset)
            .limit(limit)
            .lean(); // Read-only için optimize

        return {
            products,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + products.length < total
            }
        };
    }

    /**
     * Dinamik query builder
     * @param {Object} filters - Filtre parametreleri
     * @returns {Object} - MongoDB query objesi
     */
    buildQuery({ q, category_id, seller_id, minPrice, maxPrice }) {
        const query = { isActive: true };

        // Full-text search
        if (q && q.trim()) {
            query.$text = { $search: q.trim() };
        }

        // Kategori filtresi
        if (category_id) {
            query.category_id = category_id;
        }

        // Satıcı filtresi
        if (seller_id) {
            query.seller_id = seller_id;
        }

        // Fiyat aralığı filtresi
        if (minPrice !== undefined || maxPrice !== undefined) {
            query.price = {};
            if (minPrice !== undefined && !isNaN(minPrice)) {
                query.price.$gte = Number(minPrice);
            }
            if (maxPrice !== undefined && !isNaN(maxPrice)) {
                query.price.$lte = Number(maxPrice);
            }
            // Boş obje kontrolü
            if (Object.keys(query.price).length === 0) {
                delete query.price;
            }
        }

        return query;
    }

    /**
     * Sıralama mapping
     * @param {string} sortBy - Sıralama türü
     * @returns {Object} - MongoDB sort objesi
     */
    buildSort(sortBy) {
        const sortOptions = {
            'newest': { createdAt: -1 },
            'oldest': { createdAt: 1 },
            'price_asc': { price: 1 },
            'price_desc': { price: -1 },
            'name_asc': { name: 1 },
            'name_desc': { name: -1 }
        };

        return sortOptions[sortBy] || sortOptions['newest'];
    }

    /**
     * Attributes içinde arama (gelişmiş arama için)
     * Not: MongoDB text index Map türünü desteklemediği için
     * bu fonksiyon regex kullanarak arama yapar
     * @param {string} attributeKey - Attribute anahtarı
     * @param {string} attributeValue - Aranan değer
     * @returns {Object} - MongoDB query objesi
     */
    buildAttributeQuery(attributeKey, attributeValue) {
        if (!attributeKey || !attributeValue) return {};

        const key = `attributes.${attributeKey}`;
        return {
            [key]: { $regex: attributeValue, $options: 'i' }
        };
    }

    /**
     * Kategoriye göre ürün sayısını getir
     * @param {string} category_id - Kategori ID
     * @returns {Promise<number>} - Ürün sayısı
     */
    async countByCategory(category_id) {
        return Product.countDocuments({
            category_id,
            isActive: true
        });
    }

    /**
     * Satıcıya göre ürün sayısını getir
     * @param {string} seller_id - Satıcı ID
     * @returns {Promise<number>} - Ürün sayısı
     */
    async countBySeller(seller_id) {
        return Product.countDocuments({
            seller_id,
            isActive: true
        });
    }
}

// Singleton pattern - tek instance
const searchRepository = new SearchRepository();

module.exports = searchRepository;
