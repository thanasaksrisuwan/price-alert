/**
 * บริการจัดการสตรีมข้อมูลราคาจาก Binance
 * จัดการการสมัครสมาชิกและจัดการข้อมูลจาก Binance WebSocket streams
 */

const logger = require('../utils/logger').createModuleLogger('BinancePriceStreamService');
const redis = require('../config/redis');
const binanceWebSocketManager = require('./binanceWebSocketService');

// ระยะเวลาที่ข้อมูลใน cache จะหมดอายุ (วินาที)
const PRICE_CACHE_EXPIRY = 60; // 1 นาที

/**
 * บริการจัดการสตรีมข้อมูลราคาจาก Binance
 */
class BinancePriceStreamService {
  /**
   * สร้างบริการสตรีมข้อมูลราคา
   */
  constructor() {
    // แฮชแมปเก็บการสมัครสมาชิกปัจจุบัน key: symbol, value: subscriberCount
    this.subscriptions = new Map();
    
    // แฮชแมปเก็บข้อมูลราคาล่าสุด key: symbol, value: priceData
    this.latestPriceData = new Map();
    
    // ตั้งค่า event handlers สำหรับ WebSocket Manager
    this.setupEventHandlers();
  }

  /**
   * ตั้งค่า event handlers สำหรับ WebSocket Manager
   */
  setupEventHandlers() {
    // เมื่อได้รับข้อมูลจาก stream ของราคา
    binanceWebSocketManager.on('message', (streamName, data) => {
      // ถ้าเป็น ticker stream
      if (streamName.endsWith('@ticker')) {
        this.handleTickerData(streamName, data);
      }
      
      // ถ้าเป็น trade stream
      else if (streamName.endsWith('@trade')) {
        this.handleTradeData(streamName, data);
      }
      
      // ถ้าเป็น depth stream
      else if (streamName.includes('@depth')) {
        this.handleDepthData(streamName, data);
      }
      
      // ถ้าเป็น kline stream
      else if (streamName.includes('@kline')) {
        this.handleKlineData(streamName, data);
      }
    });
  }

  /**
   * จัดการข้อมูล ticker
   * @param {string} streamName - ชื่อ stream
   * @param {object} data - ข้อมูลที่ได้รับ
   */
  handleTickerData(streamName, data) {
    try {
      // แยกชื่อเหรียญ
      const parts = streamName.split('@');
      const market = parts[0].toUpperCase();
      const base = market.slice(0, -4); // ตัด USDT ออก
      
      // แปลงข้อมูล
      const lastPrice = parseFloat(data.c); // current price 
      const priceChange = parseFloat(data.p); // price change
      const priceChangePercent = parseFloat(data.P); // price change percent
      const volume24h = parseFloat(data.v); // 24h volume
      const high24h = parseFloat(data.h); // 24h high
      const low24h = parseFloat(data.l); // 24h low
      
      // อัพเดตข้อมูลราคาล่าสุด
      const priceData = {
        symbol: base,
        price: lastPrice,
        priceChange,
        priceChangePercent,
        volume24h,
        high24h,
        low24h,
        lastUpdated: new Date().toISOString()
      };
      
      this.latestPriceData.set(base, priceData);
      
      // บันทึกใน cache
      this.cachePriceData(base, 'USD', JSON.stringify(priceData));
      
      // อาจตรวจสอบเงื่อนไขการแจ้งเตือนที่นี่
      
    } catch (error) {
      logger.error(`Error handling ticker data for ${streamName}:`, error);
    }
  }

  /**
   * จัดการข้อมูลการซื้อขาย
   * @param {string} streamName - ชื่อ stream
   * @param {object} data - ข้อมูลที่ได้รับ
   */
  handleTradeData(streamName, data) {
    try {
      // แยกชื่อเหรียญจากชื่อ stream
      const market = streamName.split('@')[0].toUpperCase();
      const base = market.slice(0, -4);
      
      // ถ้าเราแค่ต้องการจะไม่เก็บทุกการซื้อขาย แต่จะอัพเดตราคาล่าสุด
      const latestPrice = parseFloat(data.p);
      
      // อัพเดตราคาล่าสุด
      if (this.latestPriceData.has(base)) {
        const priceData = this.latestPriceData.get(base);
        priceData.price = latestPrice;
        priceData.lastUpdated = new Date().toISOString();
        this.latestPriceData.set(base, priceData);
      }
    } catch (error) {
      logger.error(`Error handling trade data for ${streamName}:`, error);
    }
  }

  /**
   * จัดการข้อมูล order book (depth)
   * @param {string} streamName - ชื่อ stream
   * @param {object} data - ข้อมูลที่ได้รับ
   */
  handleDepthData(streamName, data) {
    // สำหรับข้อมูล order book อาจไม่จำเป็นต้องเก็บใน service นี้
    // แต่สามารถส่ง event ออกไปให้ service อื่นจัดการแทน
  }

  /**
   * จัดการข้อมูลแท่งเทียน (kline)
   * @param {string} streamName - ชื่อ stream
   * @param {object} data - ข้อมูลที่ได้รับ
   */
  handleKlineData(streamName, data) {
    try {
      // แยกชื่อเหรียญและช่วงเวลา
      const parts = streamName.split('@');
      const market = parts[0].toUpperCase();
      const base = market.slice(0, -4);
      
      // อัพเดตข้อมูลแท่งเทียนล่าสุด
      const kline = data.k;
      
      // ถ้าเป็นแท่งล่าสุดที่ยังไม่ปิด อาจจะใช้เป็นราคาล่าสุดได้
      if (!kline.x) { // x = kline closed
        // อัพเดตราคาล่าสุดถ้าจำเป็น
        const currentPrice = parseFloat(kline.c); // ราคาปัจจุบัน
        
        if (this.latestPriceData.has(base)) {
          const priceData = this.latestPriceData.get(base);
          priceData.price = currentPrice;
          priceData.lastUpdated = new Date().toISOString();
          this.latestPriceData.set(base, priceData);
        }
      }
    } catch (error) {
      logger.error(`Error handling kline data for ${streamName}:`, error);
    }
  }

  /**
   * บันทึกข้อมูลราคาใน cache
   * @param {string} symbol - สัญลักษณ์เหรียญ
   * @param {string} currency - สกุลเงิน
   * @param {object} priceData - ข้อมูลราคา
   */
  async cachePriceData(symbol, currency, priceData) {
    try {
      const cacheKey = `price:${symbol}:${currency}`;
      await redis.set(cacheKey, priceData, PRICE_CACHE_EXPIRY);
    } catch (error) {
      logger.error(`Error caching price data for ${symbol}:`, error);
    }
  }

  /**
   * สมัครสมาชิกข้อมูลราคาสำหรับเหรียญคริปโต
   * @param {string} symbol - สัญลักษณ์เหรียญคริปโต (BTC, ETH, เป็นต้น)
   * @returns {Promise<boolean>} - สถานะการสมัครสมาชิก
   */
  async subscribeToPriceUpdates(symbol) {
    try {
      const upperSymbol = symbol.toUpperCase();
      
      // ตรวจสอบว่ามีการสมัครสมาชิกอยู่แล้วหรือไม่
      const subscriptionCount = this.subscriptions.get(upperSymbol) || 0;
      
      if (subscriptionCount > 0) {
        // เพิ่ม counter
        this.subscriptions.set(upperSymbol, subscriptionCount + 1);
        logger.debug(`Incremented subscription count for ${upperSymbol}: ${subscriptionCount + 1}`);
        return true;
      }
      
      // ถ้ายังไม่มีการสมัครสมาชิก
      // สร้างชื่อ stream (เช่น btcusdt@ticker)
      const streamName = `${upperSymbol.toLowerCase()}usdt@ticker`;
      
      // เชื่อมต่อกับ WebSocket stream
      const connected = await binanceWebSocketManager.connectToStream(streamName);
      
      if (connected) {
        // บันทึกการสมัครสมาชิก
        this.subscriptions.set(upperSymbol, 1);
        logger.info(`Subscribed to price updates for ${upperSymbol}`);
        return true;
      } else {
        logger.error(`Failed to connect to ticker stream for ${upperSymbol}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error subscribing to price updates for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * ยกเลิกการสมัครสมาชิกข้อมูลราคา
   * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
   */
  unsubscribeFromPriceUpdates(symbol) {
    try {
      const upperSymbol = symbol.toUpperCase();
      
      // ตรวจสอบว่ามีการสมัครสมาชิกหรือไม่
      const subscriptionCount = this.subscriptions.get(upperSymbol) || 0;
      
      if (subscriptionCount <= 1) {
        // ยกเลิกการเชื่อมต่อกับ WebSocket
        const streamName = `${upperSymbol.toLowerCase()}usdt@ticker`;
        binanceWebSocketManager.disconnect(streamName);
        
        // ลบออกจากการติดตาม
        this.subscriptions.delete(upperSymbol);
        logger.info(`Unsubscribed from price updates for ${upperSymbol}`);
      } else {
        // ลด counter
        this.subscriptions.set(upperSymbol, subscriptionCount - 1);
        logger.debug(`Decremented subscription count for ${upperSymbol}: ${subscriptionCount - 1}`);
      }
    } catch (error) {
      logger.error(`Error unsubscribing from price updates for ${symbol}:`, error);
    }
  }

  /**
   * สมัครสมาชิกข้อมูลการซื้อขายแบบเรียลไทม์
   * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
   * @returns {Promise<boolean>} - สถานะการสมัครสมาชิก
   */
  async subscribeToTrades(symbol) {
    try {
      const upperSymbol = symbol.toUpperCase();
      const streamName = `${upperSymbol.toLowerCase()}usdt@trade`;
      
      // เชื่อมต่อกับ WebSocket stream
      const connected = await binanceWebSocketManager.connectToStream(streamName);
      
      if (connected) {
        logger.info(`Subscribed to trade updates for ${upperSymbol}`);
      }
      
      return connected;
    } catch (error) {
      logger.error(`Error subscribing to trades for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * สมัครสมาชิกข้อมูลแท่งเทียน (คืนแท่งเทียนล่าสุดและอัพเดตเมื่อมีแท่งใหม่)
   * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
   * @param {string} interval - ช่วงเวลาของแท่งเทียน (1m, 5m, 15m, 1h, 4h, 1d)
   * @returns {Promise<boolean>} - สถานะการสมัครสมาชิก
   */
  async subscribeToKlines(symbol, interval = '1m') {
    try {
      const upperSymbol = symbol.toUpperCase();
      const streamName = `${upperSymbol.toLowerCase()}usdt@kline_${interval}`;
      
      // เชื่อมต่อกับ WebSocket stream
      const connected = await binanceWebSocketManager.connectToStream(streamName);
      
      if (connected) {
        logger.info(`Subscribed to ${interval} klines for ${upperSymbol}`);
      }
      
      return connected;
    } catch (error) {
      logger.error(`Error subscribing to klines for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * รับข้อมูลราคาล่าสุดสำหรับเหรียญ
   * @param {string} symbol - สัญลักษณ์เหรียญ
   * @returns {object|null} - ข้อมูลราคาล่าสุด
   */
  getLatestPriceData(symbol) {
    const upperSymbol = symbol.toUpperCase();
    return this.latestPriceData.get(upperSymbol) || null;
  }

  /**
   * สมัครสมาชิกข้อมูลราคาสำหรับเหรียญหลายเหรียญพร้อมกัน
   * @param {Array<string>} symbols - รายการสัญลักษณ์เหรียญ
   * @returns {Promise<object>} - ผลลัพธ์การสมัครสมาชิก
   */
  async subscribeToPriceUpdatesForSymbols(symbols) {
    const results = {};
    
    // สมัครสมาชิกทีละเหรียญ
    for (const symbol of symbols) {
      results[symbol] = await this.subscribeToPriceUpdates(symbol);
    }
    
    return results;
  }

  /**
   * สมัครสมาชิกข้อมูลราคาสำหรับเหรียญหลายเหรียญพร้อมกันผ่านการเชื่อมต่อเดียว
   * @param {Array<string>} symbols - รายการสัญลักษณ์เหรียญ
   * @returns {Promise<boolean>} - สถานะการสมัครสมาชิก
   */
  async subscribeToMultipleTickerStream(symbols) {
    try {
      // ค่าสูงสุดของการสมัครสมาชิกต่อหนึ่งชุดการเชื่อมต่อ
      const MAX_SYMBOLS_PER_BATCH = 25;
      
      // สร้างชื่อ streams
      const streamNames = symbols.map(symbol => 
        `${symbol.toLowerCase()}usdt@ticker`
      );
      
      logger.info(`Subscribing to price updates for ${symbols.length} symbols`);
      
      // เช็คว่าต้องแบ่งเป็นหลายการเชื่อมต่อไหม
      if (streamNames.length > MAX_SYMBOLS_PER_BATCH) {
        // แบ่งเป็นชุดเล็กๆ ตามขีดจำกัดของ Binance WebSocket API
        const batches = [];
        for (let i = 0; i < streamNames.length; i += MAX_SYMBOLS_PER_BATCH) {
          batches.push(streamNames.slice(i, i + MAX_SYMBOLS_PER_BATCH));
        }
        
        logger.info(`Split ${symbols.length} symbols into ${batches.length} batches`);
        
        // ประมวลผลชุดทั้งหมดพร้อมกันโดยใช้ระบบคิวการเชื่อมต่อ
        // ระบบจะจัดการตามจำนวน maxConcurrentConnections อัตโนมัติ
        const results = await Promise.all(
          batches.map(batch => 
            binanceWebSocketManager.connectToCombinedStreams(
              batch,
              this.handleMultipleTickerData.bind(this)
            )
          )
        );
        
        // บันทึกการสมัครสมาชิกสำหรับทุกเหรียญ
        let allSuccess = !results.includes(false);
        
        // บันทึกการสมัครสมาชิก
        symbols.forEach(symbol => {
          const upperSymbol = symbol.toUpperCase();
          this.subscriptions.set(upperSymbol, (this.subscriptions.get(upperSymbol) || 0) + 1);
        });
        
        return {
          success: allSuccess,
          totalSymbols: symbols.length,
          connectedBatches: results.filter(Boolean).length,
          totalBatches: batches.length
        };
      } else {
        // กรณีที่สมัครสมาชิกน้อยกว่า MAX_SYMBOLS_PER_BATCH สามารถใช้การเชื่อมต่อเดียว
        const connected = await binanceWebSocketManager.connectToCombinedStreams(
          streamNames,
          this.handleMultipleTickerData.bind(this)
        );
        
        // บันทึกการสมัครสมาชิก
        if (connected) {
          symbols.forEach(symbol => {
            const upperSymbol = symbol.toUpperCase();
            this.subscriptions.set(upperSymbol, (this.subscriptions.get(upperSymbol) || 0) + 1);
            logger.debug(`Subscribed to price updates for ${upperSymbol}`);
          });
        }
        
        return { 
          success: connected, 
          totalSymbols: symbols.length,
          connectedBatches: connected ? 1 : 0,
          totalBatches: 1
        };
      }
    } catch (error) {
      logger.error(`Error subscribing to multiple ticker streams:`, error);
      return { 
        success: false, 
        error: error.message,
        totalSymbols: symbols.length 
      };
    }
  }

  /**
   * สมัครสมาชิกข้อมูลราคาแบบเป็นชุด โดยเว้นระยะเวลาระหว่างการเชื่อมต่อเพื่อไม่ให้เกิดปัญหา rate limit
   * @param {Array<string>} symbols - รายการสัญลักษณ์เหรียญ
   * @param {number} batchSize - จำนวนเหรียญต่อชุด
   * @param {number} delayMs - เวลาระหว่างชุด (มิลลิวินาที)
   * @returns {Promise<object>} - ผลลัพธ์การสมัครสมาชิก
   */
  async subscribeWithStaggeredBatches(symbols, batchSize = 10, delayMs = 2000) {
    try {
      const results = { success: true, batches: [], totalProcessed: 0 };
      
      // แบ่งเป็นกลุ่ม
      const batches = [];
      for (let i = 0; i < symbols.length; i += batchSize) {
        batches.push(symbols.slice(i, i + batchSize));
      }
      
      logger.info(`Subscribing to ${symbols.length} symbols with staggered batches (${batches.length} batches, ${delayMs}ms delay)`);
      
      // ประมวลผลแต่ละชุดโดยเว้นระยะ
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.info(`Processing batch ${i+1}/${batches.length} with ${batch.length} symbols`);
        
        // สมัครสมาชิกสำหรับชุดปัจจุบัน
        const batchResult = await this.subscribeToMultipleTickerStream(batch);
        results.batches.push(batchResult);
        results.totalProcessed += batch.length;
        
        // เช็คว่าการสมัครสมาชิกสำเร็จหรือไม่
        if (!batchResult.success) {
          results.success = false;
          results.failedAt = i;
          results.failedSymbols = batch;
          
          // หากเกิดข้อผิดพลาด ให้เพิ่มระยะเวลารอและทำต่อ
          delayMs = delayMs * 2; // เพิ่มการรอเป็นสองเท่า
          logger.warn(`Batch ${i+1} failed, increasing delay to ${delayMs}ms`);
        }
        
        // รอเวลาก่อนประมวลผลชุดถัดไป (ยกเว้นชุดสุดท้าย)
        if (i < batches.length - 1) {
          logger.debug(`Waiting ${delayMs}ms before processing next batch`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      return results;
    } catch (error) {
      logger.error(`Error in staggered subscription:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * จัดการข้อมูลจาก combined ticker stream
   * @param {object} data - ข้อมูลจาก combined stream
   */
  async handleMultipleTickerData(data) {
    try {
      // ข้อมูลจาก combined stream อยู่ในรูปแบบพิเศษ
      const streamName = data.stream;
      const streamData = data.data;
      
      if (streamName.endsWith('@ticker')) {
        // แยกชื่อเหรียญจากชื่อ stream (เช่น btcusdt@ticker -> btcusdt)
        const market = streamName.split('@')[0].toUpperCase();
        const base = market.slice(0, -4);
        
        // สร้างข้อมูลราคา
        const priceData = {
          symbol: base,
          price: parseFloat(streamData.c),
          priceChange24h: parseFloat(streamData.p),
          priceChangePercentage24h: parseFloat(streamData.P),
          volume24h: parseFloat(streamData.v) * parseFloat(streamData.c),
          high24h: parseFloat(streamData.h),
          low24h: parseFloat(streamData.l),
          lastUpdated: new Date().toISOString()
        };
        
        // เก็บข้อมูลล่าสุดใน memory
        this.latestPriceData.set(base, priceData);
        
        // เก็บข้อมูลใน Redis
        await this.cachePriceData(base, 'USD', priceData);
      }
    } catch (error) {
      logger.error('Error handling multiple ticker data:', error);
    }
  }

  /**
   * จัดการข้อมูล ticker จาก combined stream
   * @param {object} data - ข้อมูลที่ได้รับจาก combined stream
   */
  handleMultipleTickerData(data) {
    try {
      // เมื่อใช้ combined stream, ข้อมูลจะอยู่ใน format แบบนี้:
      // { stream: "symbolusdt@ticker", data: { actual ticker data } }
      const stream = data.stream;
      const tickerData = data.data;
      
      if (!stream || !tickerData) {
        logger.warn(`Received invalid data format from combined stream: ${JSON.stringify(data)}`);
        return;
      }
      
      // แยกชื่อเหรียญออกมา
      const streamParts = stream.split('@');
      if (streamParts.length !== 2) {
        logger.warn(`Invalid stream name format: ${stream}`);
        return;
      }
      
      const market = streamParts[0].toUpperCase();
      const base = market.slice(0, -4); // ตัด USDT ออก
      
      // แปลงข้อมูล
      const lastPrice = parseFloat(tickerData.c); // current price 
      const priceChange = parseFloat(tickerData.p); // price change
      const priceChangePercent = parseFloat(tickerData.P); // price change percent
      const volume24h = parseFloat(tickerData.v); // 24h volume
      const high24h = parseFloat(tickerData.h); // 24h high
      const low24h = parseFloat(tickerData.l); // 24h low
      
      // อัพเดตข้อมูลราคาล่าสุด
      const priceData = {
        symbol: base,
        price: lastPrice,
        priceChange,
        priceChangePercent,
        volume24h,
        high24h,
        low24h,
        lastUpdated: new Date().toISOString()
      };
      
      this.latestPriceData.set(base, priceData);
      
      // บันทึกใน cache
      this.cachePriceData(base, 'USD', JSON.stringify(priceData));
      
      // อาจตรวจสอบและส่งแจ้งเตือนตามเงื่อนไข
      
    } catch (error) {
      logger.error(`Error handling ticker data from combined stream:`, error);
    }
  }

  /**
   * รับสถานะการเชื่อมต่อปัจจุบัน
   * @returns {object} - สถานะการเชื่อมต่อและข้อมูลการสมัครสมาชิก
   */
  getConnectionStatus() {
    const status = binanceWebSocketManager.getConnectionStatus();
    
    // สร้างข้อมูลสถานะที่มีประโยชน์เพิ่มเติม
    const result = {
      connections: status,
      subscriptions: {},
      stats: {
        totalConnections: Object.keys(status).length,
        totalSubscriptions: this.subscriptions.size,
        activeSymbols: [...this.subscriptions.keys()],
        cachedPrices: this.latestPriceData.size
      }
    };
    
    // แปลง Map เป็น object เพื่อให้ง่ายต่อการใช้งาน
    for (const [symbol, count] of this.subscriptions.entries()) {
      result.subscriptions[symbol] = { count };
      
      // ถ้ามีข้อมูลราคาในแคช ให้รวมเข้าไปด้วย
      if (this.latestPriceData.has(symbol)) {
        const priceData = this.latestPriceData.get(symbol);
        result.subscriptions[symbol].lastPrice = priceData.price;
        result.subscriptions[symbol].lastUpdated = priceData.lastUpdated;
      }
    }
    
    return result;
  }
}

// สร้าง instance เดียวของ service
const binancePriceStreamService = new BinancePriceStreamService();

module.exports = binancePriceStreamService;
