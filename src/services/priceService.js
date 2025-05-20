/**
 * บริการจัดการข้อมูลราคาคริปโต
 * ดึงและจัดการข้อมูลราคาจาก API ต่างๆ
 */

const axios = require('axios');
const logger = require('../utils/logger').createModuleLogger('PriceService');
const config = require('../config');
const redis = require('../config/redis');

// ระยะเวลาที่ข้อมูลราคาใน cache จะหมดอายุ (วินาที)
const PRICE_CACHE_EXPIRY = 60; // 1 นาที

/**
 * ดึงข้อมูลราคาเหรียญคริปโต
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต (BTC, ETH, เป็นต้น)
 * @param {string} currency - สกุลเงินที่ต้องการแสดงราคา (USD, EUR, THB, เป็นต้น)
 * @param {boolean} forceUpdate - บังคับอัพเดตข้อมูลแม้จะมีใน cache
 * @returns {Promise<Object|null>} - ข้อมูลราคาหรือ null ถ้าไม่พบ
 */
async function getPrice(symbol, currency = 'USD', forceUpdate = false) {
  try {
    // ตรวจสอบ cache ก่อน (เว้นแต่จะบังคับอัพเดต)
    const cacheKey = `price:${symbol}:${currency}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData && !forceUpdate) {
      logger.debug(`Retrieved price data from cache for ${symbol}`);
      return cachedData;
    }
    
    // ถ้าไม่มีใน cache ให้ดึงจาก API
    // ลองดึงจาก CoinGecko ก่อน
    try {
      const priceData = await getPriceFromCoinGecko(symbol, currency);
      
      // บันทึกผลลัพธ์ใน cache
      await redis.set(cacheKey, priceData, PRICE_CACHE_EXPIRY);
      
      return priceData;
    } catch (coinGeckoError) {
      logger.warn(`CoinGecko API failed for ${symbol}: ${coinGeckoError.message}`);
      
      // ถ้า CoinGecko ไม่ทำงาน ให้ลองใช้ Binance
      try {
        const priceData = await getPriceFromBinance(symbol, currency);
        
        // บันทึกผลลัพธ์ใน cache
        await redis.set(cacheKey, priceData, PRICE_CACHE_EXPIRY);
        
        return priceData;
      } catch (binanceError) {
        logger.warn(`Binance API failed for ${symbol}: ${binanceError.message}`);
        
        // ถ้า Binance ไม่ทำงาน ให้ลองใช้ CoinMarketCap เป็นตัวสุดท้าย
        try {
          const priceData = await getPriceFromCoinMarketCap(symbol, currency);
          
          // บันทึกผลลัพธ์ใน cache
          await redis.set(cacheKey, priceData, PRICE_CACHE_EXPIRY);
          
          return priceData;
        } catch (cmcError) {
          logger.error(`All price APIs failed for ${symbol}`);
          throw cmcError;
        }
      }
    }
  } catch (error) {
    logger.error(`Error getting price for ${symbol}:`, error);
    return null;
  }
}

/**
 * ดึงราคาจาก CoinGecko API
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงิน
 * @returns {Promise<Object>} - ข้อมูลราคา
 */
async function getPriceFromCoinGecko(symbol, currency) {
  const currencyLower = currency.toLowerCase();
  const apiKey = config.cryptoApis.coingecko.apiKey;
  const headers = apiKey ? { 'x-cg-pro-api-key': apiKey } : {};
  
  // เปลี่ยนจากรูปแบบ BTC เป็น bitcoin ตามที่ CoinGecko ต้องการ
  const coinId = await getCoinGeckoId(symbol);
  
  const url = `${config.cryptoApis.coingecko.baseUrl}/coins/${coinId}`;
  const response = await axios.get(url, {
    headers,
    params: {
      localization: false,
      tickers: false,
      market_data: true,
      community_data: false,
      developer_data: false,
      sparkline: false
    }
  });
  
  const {
    name,
    symbol: returnedSymbol,
    image,
    market_data: marketData,
    last_updated: lastUpdated
  } = response.data;
  
  return {
    name,
    symbol: returnedSymbol.toUpperCase(),
    imageUrl: image?.large,
    price: marketData.current_price[currencyLower] || 0,
    priceChange24h: marketData.price_change_24h_in_currency[currencyLower] || 0,
    priceChangePercentage24h: marketData.price_change_percentage_24h || 0,
    marketCap: marketData.market_cap[currencyLower] || 0,
    volume24h: marketData.total_volume[currencyLower] || 0,
    high24h: marketData.high_24h[currencyLower] || 0,
    low24h: marketData.low_24h[currencyLower] || 0,
    lastUpdated
  };
}

/**
 * แปลงสัญลักษณ์เหรียญเป็น CoinGecko ID
 * @param {string} symbol - สัญลักษณ์เหรียญ (BTC, ETH)
 * @returns {Promise<string>} - CoinGecko ID (bitcoin, ethereum)
 */
async function getCoinGeckoId(symbol) {
  // ตรวจสอบ cache ก่อน
  const cacheKey = `coingecko:symbolToId:${symbol}`;
  const cachedId = await redis.get(cacheKey);
  
  if (cachedId) {
    return cachedId;
  }
  
  // แมปอย่างง่ายสำหรับเหรียญหลัก
  const commonCoins = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'XRP': 'ripple',
    'USDC': 'usd-coin',
    'ADA': 'cardano',
    'AVAX': 'avalanche-2',
    'DOGE': 'dogecoin'
  };
  
  if (commonCoins[symbol]) {
    // เก็บไว้ใน cache เพื่อใช้ในอนาคต
    await redis.set(cacheKey, commonCoins[symbol], 86400); // 24 ชั่วโมง
    return commonCoins[symbol];
  }
  
  // ถ้าไม่ใช่เหรียญหลัก ให้ค้นหา ID จาก CoinGecko API
  const apiKey = config.cryptoApis.coingecko.apiKey;
  const headers = apiKey ? { 'x-cg-pro-api-key': apiKey } : {};
  
  const url = `${config.cryptoApis.coingecko.baseUrl}/coins/list`;
  const response = await axios.get(url, { headers });
  
  const coin = response.data.find(c => c.symbol.toLowerCase() === symbol.toLowerCase());
  
  if (!coin) {
    throw new Error(`Could not find CoinGecko ID for symbol ${symbol}`);
  }
  
  // เก็บไว้ใน cache เพื่อใช้ในอนาคต
  await redis.set(cacheKey, coin.id, 86400); // 24 ชั่วโมง
  
  return coin.id;
}

/**
 * ดึงราคาจาก Binance API
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงิน
 * @returns {Promise<Object>} - ข้อมูลราคา
 */
async function getPriceFromBinance(symbol, currency) {
  // Binance มักใช้รูปแบบ BTCUSDT
  let pair = `${symbol}${currency}`;
  
  // สำหรับเงินบาทหรือสกุลเงินอื่น ๆ อาจต้องแปลงเป็น USDT ก่อน
  if (currency !== 'USD' && currency !== 'USDT') {
    pair = `${symbol}USDT`;
  }
  
  try {
    const url = `${config.cryptoApis.binance.baseUrl}/api/v3/ticker/24hr`;
    const response = await axios.get(url, {
      params: { symbol: pair }
    });
    
    const data = response.data;
    
    // ค้นหาข้อมูลเพิ่มเติมของเหรียญ (ชื่อเต็ม)
    let name = symbol;
    
    const price = parseFloat(data.lastPrice);
    const priceChange24h = parseFloat(data.priceChange);
    const priceChangePercentage24h = parseFloat(data.priceChangePercent);
    const volume24h = parseFloat(data.volume) * price; // แปลงปริมาณเป็นมูลค่า
    
    // ถ้าสกุลเงินไม่ใช่ USD/USDT ต้องแปลงราคา
    let finalPrice = price;
    let finalPriceChange = priceChange24h;
    let finalVolume = volume24h;
    let exchangeRate = 1;
    
    if (currency !== 'USD' && currency !== 'USDT') {
      try {
        // ใช้อัตราแลกเปลี่ยน
        exchangeRate = await getExchangeRate('USD', currency);
        finalPrice *= exchangeRate;
        finalPriceChange *= exchangeRate;
        finalVolume *= exchangeRate;
      } catch (exchangeError) {
        logger.error(`Failed to get exchange rate USD to ${currency}:`, exchangeError);
        // ใช้อัตรา 1:1 เมื่อไม่สามารถดึงอัตราแลกเปลี่ยนได้
        exchangeRate = 1;
      }
    }
    
    return {
      name,
      symbol,
      price: finalPrice,
      priceChange24h: finalPriceChange,
      priceChangePercentage24h,
      volume24h: finalVolume,
      high24h: parseFloat(data.highPrice) * exchangeRate,
      low24h: parseFloat(data.lowPrice) * exchangeRate,
      marketCap: 0, // Binance ไม่ให้ข้อมูล market cap
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    // สำหรับคู่เหรียญที่ไม่รองรับ ให้ลองเปลี่ยนเป็น BUSD
    try {
      pair = `${symbol}BUSD`;
      const url = `${config.cryptoApis.binance.baseUrl}/api/v3/ticker/24hr`;
      const response = await axios.get(url, {
        params: { symbol: pair }
      });
      
      // ตรรกะเหมือนด้านบนแต่ใช้ BUSD
      // ย่อเพื่อให้โค้ดสั้นลง
      const data = response.data;
      let exchangeRate = 1;
      
      if (currency !== 'USD' && currency !== 'BUSD') {
        try {
          exchangeRate = await getExchangeRate('USD', currency);
        } catch (exchangeError) {
          logger.error(`Failed to get exchange rate USD to ${currency}:`, exchangeError);
          exchangeRate = 1;
        }
      }
      
      return {
        name: symbol,
        symbol,
        price: parseFloat(data.lastPrice) * exchangeRate,
        priceChange24h: parseFloat(data.priceChange) * exchangeRate,
        priceChangePercentage24h: parseFloat(data.priceChangePercent),
        volume24h: parseFloat(data.volume) * parseFloat(data.lastPrice) * exchangeRate,
        high24h: parseFloat(data.highPrice) * exchangeRate,
        low24h: parseFloat(data.lowPrice) * exchangeRate,
        marketCap: 0,
        lastUpdated: new Date().toISOString()
      };
    } catch (busdError) {
      throw new Error(`Binance API does not support ${symbol}${currency} or ${symbol}USDT/BUSD: ${error.message}`);
    }
  }
}

/**
 * ดึงราคาจาก CoinMarketCap API
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงิน
 * @returns {Promise<Object>} - ข้อมูลราคา
 */
async function getPriceFromCoinMarketCap(symbol, currency) {
  // ตรวจสอบว่ามี API key หรือไม่
  if (!config.cryptoApis.coinmarketcap.apiKey) {
    throw new Error('CoinMarketCap API key is not configured');
  }
  
  const url = `${config.cryptoApis.coinmarketcap.baseUrl}/cryptocurrency/quotes/latest`;
  const response = await axios.get(url, {
    headers: {
      'X-CMC_PRO_API_KEY': config.cryptoApis.coinmarketcap.apiKey
    },
    params: {
      symbol,
      convert: currency
    }
  });
  
  // ตรวจสอบว่ามีข้อมูลหรือไม่
  if (!response.data || !response.data.data || !response.data.data[symbol]) {
    throw new Error(`CoinMarketCap API did not return data for ${symbol}`);
  }
  
  const coinData = response.data.data[symbol];
  const quote = coinData.quote[currency];
  
  return {
    name: coinData.name,
    symbol: coinData.symbol,
    price: quote.price,
    priceChange24h: quote.volume_24h ? (quote.price - quote.price / (1 + quote.percent_change_24h / 100)) : 0,
    priceChangePercentage24h: quote.percent_change_24h || 0,
    marketCap: quote.market_cap || 0,
    volume24h: quote.volume_24h || 0,
    high24h: 0, // CMC ไม่ให้ข้อมูล high/low 24h
    low24h: 0,
    lastUpdated: quote.last_updated
  };
}

/**
 * ดึงอัตราแลกเปลี่ยนระหว่างสกุลเงิน
 * @param {string} from - สกุลเงินต้นทาง
 * @param {string} to - สกุลเงินปลายทาง
 * @returns {Promise<number>} - อัตราแลกเปลี่ยน
 */
async function getExchangeRate(from, to) {
  // ในตัวอย่างนี้เราใช้อัตราคงที่เพื่อความเรียบง่าย
  // ในการใช้งานจริงควรดึงจาก API เช่น ExchangeRate-API หรือ Open Exchange Rates
  
  const rates = {
    'USD_THB': 31.5,
    'USD_EUR': 0.85,
    'USD_JPY': 110.5,
    'USD_GBP': 0.73
  };
  
  const key = `${from}_${to}`;
  
  if (rates[key]) {
    return rates[key];
  } else if (from === to) {
    return 1;
  } else {
    // ค่าเริ่มต้นถ้าไม่พบอัตราแลกเปลี่ยน
    logger.warn(`Exchange rate for ${key} not found, using 1`);
    return 1;
  }
}

module.exports = {
  getPrice
};
