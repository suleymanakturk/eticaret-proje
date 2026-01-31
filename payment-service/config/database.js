/**
 * MySQL Database Connection
 * Payment Service için veritabanı bağlantısı
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3310,
    user: process.env.DB_USER || 'payment_service_user',
    password: process.env.DB_PASSWORD || 'payment_service_password',
    database: process.env.DB_NAME || 'payment_service_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL bağlantısı başarılı (Payment Service DB)');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL bağlantı hatası:', err.message);
    });

module.exports = pool;
