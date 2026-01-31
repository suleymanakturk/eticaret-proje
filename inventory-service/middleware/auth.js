/**
 * JWT Authentication Middleware
 * Inventory Service için yetkilendirme
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-in-production';

/**
 * Token doğrulama middleware'i
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Yetkilendirme token\'ı gerekli'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Geçersiz veya süresi dolmuş token'
        });
    }
};

/**
 * Admin yetkisi kontrolü
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için admin yetkisi gerekli'
        });
    }
    next();
};

/**
 * Seller yetkisi kontrolü
 */
const requireSeller = (req, res, next) => {
    if (!req.user || req.user.role !== 'seller') {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için satıcı yetkisi gerekli'
        });
    }
    next();
};

/**
 * Admin veya Seller yetkisi kontrolü
 */
const requireAdminOrSeller = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'seller')) {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için admin veya satıcı yetkisi gerekli'
        });
    }
    next();
};

/**
 * Internal Service Auth (API Key tabanlı - opsiyonel)
 * Servisler arası güvenli iletişim için
 */
const verifyInternalService = (req, res, next) => {
    const serviceKey = req.headers['x-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY || 'internal-service-secret';

    // Ya internal service key ya da JWT token kabul et
    if (serviceKey === expectedKey) {
        req.isInternalService = true;
        return next();
    }

    // JWT token ile devam et
    return verifyToken(req, res, next);
};

module.exports = {
    verifyToken,
    requireAdmin,
    requireSeller,
    requireAdminOrSeller,
    verifyInternalService
};
