/**
 * Redis Configuration
 * Manages Redis connection for cart storage
 */

const { createClient } = require('redis');

let redisClient = null;

const connectRedis = async () => {
    try {
        const redisHost = process.env.REDIS_HOST || 'localhost';
        const redisPort = process.env.REDIS_PORT || 6379;
        const redisPassword = process.env.REDIS_PASSWORD || undefined;

        redisClient = createClient({
            socket: {
                host: redisHost,
                port: parseInt(redisPort)
            },
            password: redisPassword || undefined
        });

        redisClient.on('error', (err) => {
            console.error('❌ Redis Client Error:', err.message);
        });

        redisClient.on('connect', () => {
            console.log(`📦 Redis bağlantısı kuruldu: ${redisHost}:${redisPort}`);
        });

        await redisClient.connect();
        return redisClient;

    } catch (error) {
        console.error('❌ Redis bağlantı hatası:', error.message);
        throw error;
    }
};

const getRedisClient = () => {
    if (!redisClient) {
        throw new Error('Redis client not initialized');
    }
    return redisClient;
};

module.exports = { connectRedis, getRedisClient };
