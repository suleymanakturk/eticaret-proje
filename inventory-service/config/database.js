/**
 * MySQL Database Connection
 * Inventory Service için veritabanı bağlantısı
 */

const mysql = require('mysql2/promise');

// Connection pool oluştur
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3310,
    user: process.env.DB_USER || 'inventory_service_user',
    password: process.env.DB_PASSWORD || 'inventory_service_password',
    database: process.env.DB_NAME || 'inventory_service_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Bağlantı testi
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL bağlantısı başarılı (Inventory Service DB)');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL bağlantı hatası:', err.message);
    });

module.exports = pool;
