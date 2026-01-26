/**
 * AWS S3 Configuration
 * S3 client and multer-s3 storage setup
 * Supports S3-compatible storage (MinIO, Ceph, etc.)
 */

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// S3 Client with custom endpoint support
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_S3_URL, // Custom endpoint for S3-compatible storage
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    forcePathStyle: true, // Required for S3-compatible storage (MinIO, Ceph, etc.)
    tls: process.env.AWS_S3_URL?.startsWith('https') ?? true
});

console.log('🗂️ S3 Endpoint:', process.env.AWS_S3_URL);
console.log('🪣 S3 Bucket:', process.env.AWS_BUCKET_NAME);

// Allowed file types
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// File filter
const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Sadece resim dosyaları yüklenebilir (JPEG, PNG, GIF, WEBP)'), false);
    }
};

// Multer S3 Storage
const upload = multer({
    storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_BUCKET_NAME,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const ext = path.extname(file.originalname);
            const uniqueName = `products/${uuidv4()}${ext}`;
            cb(null, uniqueName);
        }
    }),
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Get full S3 URL
const getS3Url = (key) => {
    return `${process.env.AWS_S3_URL}/${process.env.AWS_BUCKET_NAME}/${key}`;
};

module.exports = {
    s3Client,
    upload,
    getS3Url
};
