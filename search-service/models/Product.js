/**
 * Product Model (Read-Only)
 * Mongoose Schema for Products - Search Service
 * Bu model sadece okuma amaçlıdır, güncelleme yapılmaz.
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    stock: {
        type: Number,
        default: 0,
        min: 0
    },
    category_id: {
        type: String,
        required: true
    },
    seller_id: {
        type: String,
        required: true
    },
    // Dinamik özellikler (RAM, Renk, Materyal vb.)
    attributes: {
        type: Map,
        of: String,
        default: {}
    },
    // S3 URL listesi
    images: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    // Read-only: Kaydetme işlemlerini engelle
    strict: true
});

// Full-Text Search Index
// name, description ve attributes değerleri üzerinde arama
productSchema.index({
    name: 'text',
    description: 'text'
}, {
    weights: {
        name: 10,      // İsim daha yüksek öncelikli
        description: 5  // Açıklama orta öncelikli
    },
    name: 'product_text_search'
});

// Diğer index'ler
productSchema.index({ seller_id: 1 });
productSchema.index({ category_id: 1 });
productSchema.index({ price: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });

// Virtual for formatted price
productSchema.virtual('formattedPrice').get(function () {
    return `₺${this.price.toFixed(2)}`;
});

// JSON dönüşümünde virtuals dahil edilsin
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
