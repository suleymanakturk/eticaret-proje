/**
 * Authentication Middleware
 * Payment Service için yetkilendirme
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-in-production';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'internal-service-secret-key-2024';

/**
 * Internal Service doğrulama
 * Sadece sistem içindeki servisler erişebilir
 */
const verifyInternalService = (req, res, next) => {
    const serviceKey = req.headers['x-service-key'];

    if (serviceKey === INTERNAL_SERVICE_KEY) {
        req.isInternalService = true;
        return next();
    }

    // JWT token ile de kabul et
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (error) {
            // Token geçersiz
        }
    }

    return res.status(401).json({
        success: false,
        error: 'Bu endpoint sadece sistem servisleri tarafından erişilebilir'
    });
};

/**
 * JWT Token doğrulama
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

module.exports = {
    verifyInternalService,
    verifyToken
};
