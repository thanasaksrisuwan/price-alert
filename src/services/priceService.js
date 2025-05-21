/**
 * บริการจัดการข้อมูลราคาคริปโต
 * ดึงและจัดการข้อมูลราคาจาก Binance WebSocket/REST API เป็นหลัก 
 * และใช้ CoinGecko/CoinMarketCap เป็น fallback
 */

const axios = require('axios');
const logger = require('../utils/logger').createModuleLogger('PriceService');
const config = require('../config');
const redis = require('../config/redis');
const binancePriceStreamService = require('./binancePriceStreamService');
const { 
  coingeckoRateLimiter, 
  binanceRateLimiter, 
  coinmarketcapRateLimiter 
} = require('../utils/rateLimiter');

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
    
    // ตรวจสอบข้อมูลจาก Binance WebSocket สตรีมก่อน (เร็วที่สุด)
    const streamData = binancePriceStreamService.getLatestPriceData(symbol);
    
    if (streamData && !forceUpdate) {
      logger.debug(`Retrieved price data from WebSocket stream for ${symbol}`);
      
      // ถ้าไม่ใช่ USD ต้องแปลงราคา
      if (currency !== 'USD') {
        try {
          const exchangeRate = await getExchangeRate('USD', currency);
          
          streamData.price = streamData.price * exchangeRate;
          streamData.priceChange24h = streamData.priceChange24h * exchangeRate;
          streamData.high24h = streamData.high24h * exchangeRate;
          streamData.low24h = streamData.low24h * exchangeRate;
          streamData.volume24h = streamData.volume24h * exchangeRate;
          
          // บันทึกใน cache
          await redis.set(cacheKey, streamData, PRICE_CACHE_EXPIRY);
        } catch (exchangeError) {
          logger.error(`Error converting currency for ${symbol}:`, exchangeError);
        }
      } else {
        // บันทึกใน cache (USD)
        await redis.set(cacheKey, streamData, PRICE_CACHE_EXPIRY);
      }
      
      return streamData;
    }
      // ถ้าไม่มีข้อมูลจากสตรีม หรือมีการบังคับอัพเดต ให้ลองดึงจาก API
    
    // ลองสมัครสมาชิก WebSocket stream สำหรับการอัพเดตในอนาคต
    binancePriceStreamService.subscribeToPriceUpdates(symbol)
      .catch(err => logger.error(`Failed to subscribe to price stream for ${symbol}:`, err));
    
    // ลองดึงจาก Binance REST API ก่อน ("Binance First" approach)
    try {
      const priceData = await getPriceFromBinance(symbol, currency);
      
      // บันทึกผลลัพธ์ใน cache
      await redis.set(cacheKey, priceData, PRICE_CACHE_EXPIRY);
      
      return priceData;
    } catch (binanceError) {
      logger.warn(`Binance API failed for ${symbol}: ${binanceError.message}`);
      
      // ถ้า Binance ไม่ทำงาน ให้ลองใช้ CoinGecko
      try {
        const priceData = await getPriceFromCoinGecko(symbol, currency);
        
        // บันทึกผลลัพธ์ใน cache
        await redis.set(cacheKey, priceData, PRICE_CACHE_EXPIRY);
        
        return priceData;
      } catch (coinGeckoError) {
        logger.warn(`CoinGecko API failed for ${symbol}: ${coinGeckoError.message}`);
        
        // ถ้า CoinGecko ไม่ทำงาน ให้ลองใช้ CoinMarketCap เป็นตัวสุดท้าย
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
  // ใช้ rate limiter เพื่อป้องกันการเรียกใช้ API มากเกินไป
  return coingeckoRateLimiter.executeWithRateLimiting(async () => {
    const currencyLower = currency.toLowerCase();
    const apiKey = config.cryptoApis.coingecko.apiKey;
    const headers = apiKey ? { 'x_cg_demo_api_key': apiKey } : {};
    
    // เปลี่ยนจากรูปแบบ BTC เป็น bitcoin ตามที่ CoinGecko ต้องการ
    const coinId = await getCoinGeckoId(symbol);
    
    const url = `${config.cryptoApis.coingecko.baseUrl}/coins/${coinId}`;
    logger.debug(`Fetching price from CoinGecko for ${symbol} (${coinId})`);
    
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
  });
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
  return coingeckoRateLimiter.executeWithRateLimiting(async () => {
    const apiKey = config.cryptoApis.coingecko.apiKey;
    const headers = apiKey ? { 'x-cg-pro-api-key': apiKey } : {};
    
    const url = `${config.cryptoApis.coingecko.baseUrl}/coins/list`;
    logger.debug(`Fetching coin list from CoinGecko for symbol: ${symbol}`);
    
    const response = await axios.get(url, { headers });
    
    const coin = response.data.find(c => c.symbol.toLowerCase() === symbol.toLowerCase());
    
    if (!coin) {
      throw new Error(`Could not find CoinGecko ID for symbol ${symbol}`);
    }
    
    // เก็บไว้ใน cache เพื่อใช้ในอนาคต
    await redis.set(cacheKey, coin.id, 86400); // 24 ชั่วโมง
    
    return coin.id;
  });
}

/**
 * ดึงราคาจาก Binance API
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงิน
 * @returns {Promise<Object>} - ข้อมูลราคา
 */
async function getPriceFromBinance(symbol, currency) {
  return binanceRateLimiter.executeWithRateLimiting(async () => {
    const upperSymbol = symbol.toUpperCase();
    
    // Binance มักใช้รูปแบบ BTCUSDT
    let pair = `${upperSymbol}${currency}`;
    
    // สำหรับเงินบาทหรือสกุลเงินอื่น ๆ อาจต้องแปลงเป็น USDT ก่อน
    if (currency !== 'USD' && currency !== 'USDT') {
      pair = `${upperSymbol}USDT`;
    }
      try {
      const url = `${config.cryptoApis.binance.baseUrl}/api/v3/ticker/24hr`;
      logger.debug(`Fetching price from Binance for ${pair}`);
      
      const response = await axios.get(url, {
        params: { symbol: pair }
      });
      
      const data = response.data;
      
      // ดึงข้อมูลเพิ่มเติมเกี่ยวกับเหรียญ (ชื่อเต็ม) ถ้าทำได้
      let name = symbol;
      
      // ตรวจสอบข้อมูลสำคัญ
      if (!data.lastPrice) {
        throw new Error('Invalid Binance response: Missing price data');
      }
      
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
      };    } catch (error) {
      // สำหรับคู่เหรียญที่ไม่รองรับ ลองใช้คู่เทรดอื่น ๆ
      const alternativePairs = ['BUSD', 'BTC', 'ETH'];
      
      // ลองแต่ละคู่เทรดที่มีโอกาสสูง
      for (const quoteCurrency of alternativePairs) {
        try {
          pair = `${symbol.toUpperCase()}${quoteCurrency}`;
          const url = `${config.cryptoApis.binance.baseUrl}/api/v3/ticker/24hr`;
          logger.debug(`Retrying with alternative pair: ${pair}`);
          
          const response = await axios.get(url, {
            params: { symbol: pair }
          });
          
          const data = response.data;
          
          // ตรวจสอบข้อมูลสำคัญ
          if (!data.lastPrice) {
            continue; // ข้ามไปลองคู่เทรดถัดไป
          }
          
          let exchangeRate = 1;
          
          // ถ้าเทรดกับ BTC หรือ ETH ต้องแปลงเป็น USD ก่อน
          if (quoteCurrency === 'BTC' || quoteCurrency === 'ETH') {
            try {
              // ดึงราคาของ quote currency ไปยัง USD
              const quotePrice = await binancePriceStreamService.getLatestPriceData(quoteCurrency);
              if (quotePrice && quotePrice.price) {
                exchangeRate = quotePrice.price;
              } else {
                // ถ้าไม่มีข้อมูลจาก WebSocket ให้ข้ามไปลองคู่เทรดถัดไป
                continue;
              }
            } catch (err) {
              continue; // ข้ามไปลองคู่เทรดถัดไป
            }
          }
          
          // แปลงราคาไปยังสกุลเงินปลายทาง
          if (currency !== 'USD') {
            try {
              const fiatExchangeRate = await getExchangeRate('USD', currency);
              exchangeRate *= fiatExchangeRate;
            } catch (exchangeError) {
              logger.error(`Failed to get exchange rate USD to ${currency}:`, exchangeError);
              // ใช้อัตราที่มีอยู่ (ถ้าเป็น BTC/ETH) หรือ 1:1
            }
          }
          
          const price = parseFloat(data.lastPrice) * exchangeRate;
          
          return {
            name: symbol,
            symbol,
            price: price,
            priceChange24h: parseFloat(data.priceChange) * exchangeRate,
            priceChangePercentage24h: parseFloat(data.priceChangePercent),
            volume24h: parseFloat(data.volume) * price,
            high24h: parseFloat(data.highPrice) * exchangeRate,
            low24h: parseFloat(data.lowPrice) * exchangeRate,
            marketCap: 0,
            lastUpdated: new Date().toISOString()
          };
        } catch (pairError) {
          // ข้ามไปลองคู่เทรดถัดไป
          logger.debug(`Failed with pair ${pair}: ${pairError.message}`);
        }
      }
      
      // ถ้าลองทุกคู่แล้วไม่สำเร็จ
      throw new Error(`Binance API does not support ${symbol} with any common trading pairs: ${error.message}`);
    }
  });
}

/**
 * ดึงราคาจาก CoinMarketCap API
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงิน
 * @returns {Promise<Object>} - ข้อมูลราคา
 */
async function getPriceFromCoinMarketCap(symbol, currency) {
  return coinmarketcapRateLimiter.executeWithRateLimiting(async () => {
    // ตรวจสอบว่ามี API key หรือไม่
    if (!config.cryptoApis.coinmarketcap.apiKey) {
      throw new Error('CoinMarketCap API key is not configured');
    }
    
    const url = `${config.cryptoApis.coinmarketcap.baseUrl}/cryptocurrency/quotes/latest`;
    logger.debug(`Fetching price from CoinMarketCap for ${symbol}`);
    
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
  });
}

/**
 * ดึงอัตราแลกเปลี่ยนระหว่างสกุลเงิน
 * @param {string} from - สกุลเงินต้นทาง
 * @param {string} to - สกุลเงินปลายทาง
 * @returns {Promise<number>} - อัตราแลกเปลี่ยน
 */
async function getExchangeRate(from, to) {
  // ตรวจสอบ cache ก่อน
  const cacheKey = `exchangeRate:${from}_${to}`;
  const cachedRate = await redis.get(cacheKey);
  
  if (cachedRate) {
    return parseFloat(cachedRate);
  }
  
  // ในตัวอย่างนี้เราใช้อัตราคงที่เพื่อความเรียบง่าย
  // ในการใช้งานจริงควรดึงจาก API เช่น ExchangeRate-API หรือ Open Exchange Rates
  // โดยใส่การจำกัดอัตราการเรียก API และการ retry ด้วย
  
  const rates = {
    'USD_THB': 31.5,
    'USD_EUR': 0.85,
    'USD_JPY': 110.5,
    'USD_GBP': 0.73
  };
  
  const key = `${from}_${to}`;
  let rate;
  
  if (rates[key]) {
    rate = rates[key];
  } else if (from === to) {
    rate = 1;
  } else {
    // ค่าเริ่มต้นถ้าไม่พบอัตราแลกเปลี่ยน
    logger.warn(`Exchange rate for ${key} not found, using 1`);
    rate = 1;
  }
  
  // เก็บใน cache (1 ชม.)
  await redis.set(cacheKey, rate, 3600);
  
  return rate;
}

module.exports = {
  getPrice
};
