/**
 * ทดสอบสำหรับ enhancedPriceService.js
 */

const enhancedPriceService = require('../../src/services/enhancedPriceService');
const priceService = require('../../src/services/priceService');
const redis = require('../../src/config/redis');

// Mock dependencies
jest.mock('../../src/services/priceService');
jest.mock('../../src/config/redis');

describe('EnhancedPriceService Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock redis get/set
    redis.get = jest.fn();
    redis.set = jest.fn();
  });

  describe('enhancePriceData', () => {
    it('should return existing price data if marketCap is already > 0', async () => {
      // Arrange
      const priceData = { 
        symbol: 'BTC', 
        price: 50000, 
        marketCap: 1000000000 
      };
      
      // Act
      const result = await enhancedPriceService.enhancePriceData(priceData, 'BTC', 'USD');
      
      // Assert
      expect(result).toBe(priceData);
      expect(priceService.getPriceFromCoinGecko).not.toHaveBeenCalled();
      expect(priceService.getPriceFromCoinMarketCap).not.toHaveBeenCalled();
    });

    it('should use cached market cap if available', async () => {
      // Arrange
      const priceData = { symbol: 'BTC', price: 50000, marketCap: 0 };
      redis.get.mockResolvedValue('1000000000');
      
      // Act
      const result = await enhancedPriceService.enhancePriceData(priceData, 'BTC', 'USD');
      
      // Assert
      expect(result.marketCap).toBe(1000000000);
      expect(redis.get).toHaveBeenCalledWith('marketcap:BTC:USD');
      expect(priceService.getPriceFromCoinGecko).not.toHaveBeenCalled();
    });

    it('should try CoinGecko if no cached market cap is available', async () => {
      // Arrange
      const priceData = { symbol: 'BTC', price: 50000, marketCap: 0 };
      redis.get.mockResolvedValue(null);
      priceService.getPriceFromCoinGecko.mockResolvedValue({ 
        symbol: 'BTC', 
        marketCap: 1000000000 
      });
      
      // Act
      const result = await enhancedPriceService.enhancePriceData(priceData, 'BTC', 'USD');
      
      // Assert
      expect(result.marketCap).toBe(1000000000);
      expect(priceService.getPriceFromCoinGecko).toHaveBeenCalledWith('BTC', 'USD');
      expect(redis.set).toHaveBeenCalledWith('marketcap:BTC:USD', '1000000000', 3600);
    });

    it('should try CoinMarketCap if CoinGecko fails', async () => {
      // Arrange
      const priceData = { symbol: 'BTC', price: 50000, marketCap: 0 };
      redis.get.mockResolvedValue(null);
      priceService.getPriceFromCoinGecko.mockRejectedValue(new Error('API error'));
      priceService.getPriceFromCoinMarketCap.mockResolvedValue({ 
        symbol: 'BTC', 
        marketCap: 1000000000 
      });
      
      // Act
      const result = await enhancedPriceService.enhancePriceData(priceData, 'BTC', 'USD');
      
      // Assert
      expect(result.marketCap).toBe(1000000000);
      expect(priceService.getPriceFromCoinGecko).toHaveBeenCalledWith('BTC', 'USD');
      expect(priceService.getPriceFromCoinMarketCap).toHaveBeenCalledWith('BTC', 'USD');
    });

    it('should return original price data if all sources fail', async () => {
      // Arrange
      const priceData = { symbol: 'BTC', price: 50000, marketCap: 0 };
      redis.get.mockResolvedValue(null);
      priceService.getPriceFromCoinGecko.mockRejectedValue(new Error('API error'));
      priceService.getPriceFromCoinMarketCap.mockRejectedValue(new Error('API error'));
      
      // Act
      const result = await enhancedPriceService.enhancePriceData(priceData, 'BTC', 'USD');
      
      // Assert
      expect(result).toBe(priceData);
      expect(result.marketCap).toBe(0);
    });
  });
});
