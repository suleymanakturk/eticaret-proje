/**
 * Product Model
 * Mongoose Schema for Products
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Ürün adı zorunludur'],
        trim: true,
        maxlength: [200, 'Ürün adı 200 karakterden uzun olamaz']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [2000, 'Açıklama 2000 karakterden uzun olamaz']
    },
    price: {
        type: Number,
        required: [true, 'Fiyat zorunludur'],
        min: [0, 'Fiyat 0\'dan küçük olamaz']
    },
    stock: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Stok 0\'dan küçük olamaz']
    },
    category_id: {
        type: String,
        required: [true, 'Kategori zorunludur']
    },
    seller_id: {
        type: String,
        required: [true, 'Satıcı ID zorunludur']
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
    timestamps: true // createdAt ve updatedAt otomatik eklenir
});

// Indexes
productSchema.index({ seller_id: 1 });
productSchema.index({ category_id: 1 });
productSchema.index({ name: 'text', description: 'text' });
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
