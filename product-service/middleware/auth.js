/**
 * Authentication Middleware
 * JWT token verification and role-based authorization
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

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
            // JWT token decode
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (jwtError) {
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
 * Require SELLER Role Middleware
 * Must be used after verifyToken
 */
const requireSeller = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Önce giriş yapmalısınız'
        });
    }

    // Check if user has SELLER role
    const roles = req.user.roles || [];
    if (!roles.includes('SELLER')) {
        return res.status(403).json({
            success: false,
            error: 'Bu işlem için satıcı yetkisi gerekli'
        });
    }

    next();
};

/**
 * Optional Auth Middleware
 * Adds user info if token exists, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = decoded;
            } catch (err) {
                // Token invalid, but continue without user
            }
        }
        next();
    } catch (error) {
        next();
    }
};

module.exports = {
    verifyToken,
    requireSeller,
    optionalAuth
};
