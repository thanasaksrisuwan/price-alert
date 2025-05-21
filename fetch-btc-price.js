/**
 * Script to fetch and display Bitcoin (BTC) price
 */
const Redis = require('redis');
const config = require('./src/config');
const PriceService = require('./src/services/priceService');
const { createModuleLogger } = require('./src/utils/logger');
const logger = createModuleLogger('FetchPrice');

async function fetchBTCPrice() {
  try {
    // Initialize Redis client
    const redisClient = Redis.createClient({
      url: config.redis.url || 'redis://localhost:6380', 
    });
    
    // Handle Redis connection events
    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });
    
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redisClient.connect();
    
    // Replace Redis client in the global module
    const redisModule = require('./src/config/redis');
    redisModule._testSetClient(redisClient);
    
    // Fetch BTC price
    logger.info('Fetching BTC price in THB...');
    const price = await PriceService.getPrice('BTC', 'THB', true);
    
    console.log('BTC Price:', JSON.stringify(price, null, 2));
    
    // Close Redis connection
    await redisClient.quit();
  } catch (error) {
    logger.error('Error fetching BTC price:', error);
  }
}

// Execute the function
fetchBTCPrice();
