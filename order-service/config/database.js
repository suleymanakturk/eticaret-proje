/**
 * Database Connection Pool
 * MySQL2 promise-based connection for Order Service
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'order_service_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL bağlantısı başarılı (Order Service DB)');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL bağlantı hatası:', err.message);
    });

module.exports = pool;
