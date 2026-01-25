/**
 * MongoDB Database Configuration
 * Mongoose connection setup
 */

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            // Mongoose 6+ varsayılan olarak bu ayarları kullanır
        });

        console.log(`✅ MongoDB bağlantısı başarılı: ${conn.connection.host}`);

        // Connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB bağlantı hatası:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB bağlantısı kesildi');
        });

        return conn;
    } catch (error) {
        console.error('❌ MongoDB bağlantı hatası:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
