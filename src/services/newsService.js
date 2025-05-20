/**
 * บริการจัดการข่าวคริปโต
 * ดึงข่าวและข้อมูลต่างๆ เกี่ยวกับเหรียญคริปโต
 */

const axios = require('axios');
const logger = require('../utils/logger').createModuleLogger('NewsService');
const config = require('../config');
const redis = require('../config/redis');

// ระยะเวลาที่ข้อมูลข่าวใน cache จะหมดอายุ (วินาที)
const NEWS_CACHE_EXPIRY = 3600; // 1 ชั่วโมง

/**
 * ดึงข่าวล่าสุดเกี่ยวกับเหรียญคริปโต
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @param {number} limit - จำนวนข่าวที่ต้องการ
 * @returns {Promise<Array>} - รายการข่าว
 */
async function getNewsForCoin(symbol, limit = 5) {
  try {
    // ตรวจสอบ cache ก่อน
    const cacheKey = `news:${symbol}:${limit}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      logger.debug(`Retrieved news data from cache for ${symbol}`);
      return cachedData;
    }
    
    // ถ้าไม่มีใน cache ให้ดึงจาก API
    // ลองดึงจาก NewsAPI ก่อน
    try {
      const news = await getNewsFromNewsApi(symbol, limit);
      
      // บันทึกผลลัพธ์ใน cache
      await redis.set(cacheKey, news, NEWS_CACHE_EXPIRY);
      
      return news;
    } catch (newsApiError) {
      logger.warn(`NewsAPI failed for ${symbol}: ${newsApiError.message}`);
      
      // ถ้า NewsAPI ไม่ทำงาน ให้ลองใช้แหล่งอื่น (ตัวอย่าง CryptoNews API)
      const news = await getNewsFromCryptoNewsApi(symbol, limit);
      
      // บันทึกผลลัพธ์ใน cache
      await redis.set(cacheKey, news, NEWS_CACHE_EXPIRY);
      
      return news;
    }
  } catch (error) {
    logger.error(`Error getting news for ${symbol}:`, error);
    return [];
  }
}

/**
 * ดึงข่าวจาก NewsAPI
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @param {number} limit - จำนวนข่าวที่ต้องการ
 * @returns {Promise<Array>} - รายการข่าว
 */
async function getNewsFromNewsApi(symbol, limit) {
  // ตรวจสอบว่ามี API key หรือไม่
  if (!config.newsApi.apiKey) {
    throw new Error('NewsAPI key is not configured');
  }
  
  // แปลงสัญลักษณ์ให้เป็นชื่อเต็ม
  const coinNames = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'USDT': 'Tether',
    'BNB': 'Binance Coin',
    'SOL': 'Solana',
    'XRP': 'Ripple',
    'USDC': 'USD Coin',
    'ADA': 'Cardano',
    'AVAX': 'Avalanche',
    'DOGE': 'Dogecoin'
  };
  
  const searchTerm = coinNames[symbol] || symbol;
  
  const url = `${config.newsApi.baseUrl}/everything`;
  const response = await axios.get(url, {
    params: {
      q: `(crypto OR cryptocurrency) AND ${searchTerm}`,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: limit,
      apiKey: config.newsApi.apiKey
    }
  });
  
  if (!response.data || !response.data.articles) {
    throw new Error('NewsAPI did not return valid data');
  }
  
  return response.data.articles.map(article => ({
    title: article.title,
    description: article.description,
    url: article.url,
    imageUrl: article.urlToImage,
    source: article.source.name,
    publishedAt: article.publishedAt
  }));
}

/**
 * ดึงข่าวจาก CryptoNews API
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @param {number} limit - จำนวนข่าวที่ต้องการ
 * @returns {Promise<Array>} - รายการข่าว
 */
async function getNewsFromCryptoNewsApi(symbol, limit) {
  // ตัวอย่างนี้สมมติว่าเราใช้ API ของ CryptoCompare เนื่องจาก CryptoNews API อาจไม่มีให้ใช้ฟรี
  
  // แปลงสัญลักษณ์เป็นชื่อตามรูปแบบที่ API ต้องการ
  const url = 'https://min-api.cryptocompare.com/data/v2/news/';
  
  try {
    const response = await axios.get(url, {
      params: {
        categories: symbol.toLowerCase(),
        excludeCategories: 'Sponsored',
        lang: 'EN',
        lTs: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60) // ข่าว 7 วันล่าสุด
      }
    });
    
    if (!response.data || !response.data.Data) {
      throw new Error('CryptoCompare API did not return valid data');
    }
    
    return response.data.Data.slice(0, limit).map(article => ({
      title: article.title,
      description: article.body,
      url: article.url,
      imageUrl: article.imageurl,
      source: article.source,
      publishedAt: new Date(article.published_on * 1000).toISOString()
    }));
  } catch (error) {
    logger.error('Error fetching from CryptoCompare:', error);
    
    // ถ้าไม่สามารถดึงข้อมูลได้ให้ใช้ข้อมูลจำลอง (ในการใช้งานจริงไม่ควรทำแบบนี้)
    return generateDummyNews(symbol, limit);
  }
}

/**
 * สร้างข่าวจำลองในกรณีที่ไม่สามารถเชื่อมต่อกับ API ได้
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @param {number} limit - จำนวนข่าวที่ต้องการ
 * @returns {Array} - รายการข่าวจำลอง
 */
function generateDummyNews(symbol, limit) {
  const news = [
    {
      title: `${symbol} Shows Strong Momentum in Market Recovery`,
      description: `Recent analysis indicates ${symbol} is well-positioned for growth as market sentiment improves.`,
      url: `https://example.com/crypto/${symbol.toLowerCase()}-momentum`,
      imageUrl: null,
      source: 'Crypto News Daily',
      publishedAt: new Date().toISOString()
    },
    {
      title: `New Development Roadmap Announced for ${symbol}`,
      description: `${symbol} team unveils ambitious development plans for the next 12 months including major protocol upgrades.`,
      url: `https://example.com/crypto/${symbol.toLowerCase()}-roadmap`,
      imageUrl: null,
      source: 'Blockchain Insider',
      publishedAt: new Date(Date.now() - 86400000).toISOString() // 1 day ago
    },
    {
      title: `Major Exchange Lists New ${symbol} Trading Pairs`,
      description: `Leading cryptocurrency exchange announces support for additional ${symbol} trading pairs, expanding accessibility.`,
      url: `https://example.com/crypto/${symbol.toLowerCase()}-listing`,
      imageUrl: null,
      source: 'Crypto Market News',
      publishedAt: new Date(Date.now() - 172800000).toISOString() // 2 days ago
    },
    {
      title: `${symbol} Adoption Increasing Among Institutional Investors`,
      description: `Institutional interest in ${symbol} continues to grow as more investment firms add it to their portfolios.`,
      url: `https://example.com/crypto/${symbol.toLowerCase()}-institutional`,
      imageUrl: null,
      source: 'Financial Crypto Review',
      publishedAt: new Date(Date.now() - 259200000).toISOString() // 3 days ago
    },
    {
      title: `Technical Analysis: ${symbol} Price Prediction for Q2`,
      description: `Expert analysts share their technical insights and predictions for ${symbol} price movement in the coming months.`,
      url: `https://example.com/crypto/${symbol.toLowerCase()}-prediction`,
      imageUrl: null,
      source: 'Crypto Analyst Weekly',
      publishedAt: new Date(Date.now() - 345600000).toISOString() // 4 days ago
    }
  ];
  
  logger.warn(`Using dummy news data for ${symbol} due to API connection issues`);
  return news.slice(0, limit);
}

/**
 * ดึงค่า Fear & Greed Index ล่าสุด
 * @returns {Promise<Object>} - ข้อมูล Fear & Greed Index
 */
async function getFearGreedIndex() {
  try {
    // ตรวจสอบ cache ก่อน
    const cacheKey = 'market:feargreed';
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    // ใช้ Alternative.me Fear & Greed API ซึ่งเป็น API ฟรี
    const url = 'https://api.alternative.me/fng/';
    const response = await axios.get(url);
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Fear & Greed API did not return valid data');
    }
    
    const indexData = {
      value: parseInt(response.data.data[0].value),
      valueText: response.data.data[0].value_classification,
      timestamp: response.data.data[0].timestamp,
      updateTime: new Date().toISOString()
    };
    
    // บันทึกใน cache
    await redis.set(cacheKey, indexData, 3600); // 1 ชั่วโมง
    
    return indexData;
  } catch (error) {
    logger.error('Error getting Fear & Greed Index:', error);
    
    // ถ้าไม่สามารถดึงข้อมูลได้ให้ใช้ข้อมูลจำลอง
    return {
      value: 50,
      valueText: 'Neutral',
      timestamp: Math.floor(Date.now() / 1000),
      updateTime: new Date().toISOString()
    };
  }
}

module.exports = {
  getNewsForCoin,
  getFearGreedIndex
};
