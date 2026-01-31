/**
 * Authentication Middleware
 * JWT token verification for Order Service
 */

const jwt = require('jsonwebtoken');

/**
 * JWT Token Verification Middleware
 * Verifies Bearer token and adds user info to req.user
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Yetkilendirme token\'ı gerekli'
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            const jwtSecret = process.env.JWT_SECRET;

            if (!jwtSecret) {
                console.error('❌ JWT_SECRET tanımlanmamış!');
                return res.status(500).json({
                    success: false,
                    error: 'Sunucu yapılandırma hatası'
                });
            }

            const decoded = jwt.verify(token, jwtSecret);
            req.user = decoded;
            next();
        } catch (jwtError) {
            console.error('❌ JWT Hata:', jwtError.message);
            return res.status(401).json({
                success: false,
                error: 'Geçersiz veya süresi dolmuş token'
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ success: false, error: 'Yetkilendirme hatası' });
    }
};

/**
 * Require Admin Role
 * Must be used after verifyToken
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.roles) {
        return res.status(403).json({
            success: false,
            error: 'Yetki bilgisi bulunamadı'
        });
    }

    if (!req.user.roles.includes('ADMIN')) {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için admin yetkisi gerekli'
        });
    }

    next();
};

/**
 * Require Seller Role
 * Must be used after verifyToken
 */
const requireSeller = (req, res, next) => {
    if (!req.user || !req.user.roles) {
        return res.status(403).json({
            success: false,
            error: 'Yetki bilgisi bulunamadı'
        });
    }

    if (!req.user.roles.includes('SELLER') && !req.user.roles.includes('ADMIN')) {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için satıcı yetkisi gerekli'
        });
    }

    next();
};

/**
 * Require Admin or Seller Role
 * Must be used after verifyToken
 */
const requireAdminOrSeller = (req, res, next) => {
    if (!req.user || !req.user.roles) {
        return res.status(403).json({
            success: false,
            error: 'Yetki bilgisi bulunamadı'
        });
    }

    const hasPermission = req.user.roles.includes('ADMIN') || req.user.roles.includes('SELLER');

    if (!hasPermission) {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için admin veya satıcı yetkisi gerekli'
        });
    }

    next();
};

module.exports = { verifyToken, requireAdmin, requireSeller, requireAdminOrSeller };
