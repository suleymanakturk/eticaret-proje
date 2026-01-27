/**
 * Authentication Middleware
 * JWT token verification for Cart Service
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

module.exports = { verifyToken };
