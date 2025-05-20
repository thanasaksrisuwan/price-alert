/**
 * ทดสอบสำหรับ portfolioController.js
 */

const portfolioController = require('../../src/controllers/portfolioController');
const PortfolioModel = require('../../src/models/portfolio');
const UserModel = require('../../src/models/user');
const PriceService = require('../../src/services/priceService');

// Mock dependencies
jest.mock('../../src/models/portfolio');
jest.mock('../../src/models/user');
jest.mock('../../src/services/priceService');

// Access private functions for testing
const { getCurrencySymbol, formatPortfolioMessage } = portfolioController.__testExports;

describe('PortfolioController Tests', () => {
  describe('getCurrencySymbol', () => {
    it('should return the correct symbol for Thai Baht', () => {
      // Arrange & Act
      const thbSymbol = getCurrencySymbol('THB');
      
      // Assert
      expect(thbSymbol).toBe('฿');
    });
    
    it('should return the correct symbols for other currencies', () => {
      // Arrange & Act
      const usdSymbol = getCurrencySymbol('USD');
      const eurSymbol = getCurrencySymbol('EUR');
      const btcSymbol = getCurrencySymbol('BTC');
      
      // Assert
      expect(usdSymbol).toBe('$');
      expect(eurSymbol).toBe('€');
      expect(btcSymbol).toBe('₿');
    });
    
    it('should handle unsupported currency codes gracefully', () => {
      // Arrange & Act
      const xyzSymbol = getCurrencySymbol('XYZ');
      
      // Assert
      expect(xyzSymbol).toBe('XYZ ');
    });
  });
  
  describe('formatPortfolioMessage', () => {
    it('should correctly format portfolio with Thai Baht', () => {
      // Arrange
      const portfolioData = [
        {
          symbol: 'BTC',
          quantity: 0.5,
          buy_price: 35000,
          currentPrice: 40000,
          currentValue: 20000,
          profitLoss: 2500,
          profitLossPercentage: 14.28,
          priceAvailable: true
        }
      ];
      const currency = 'THB';
      const totalValue = 20000;
      const totalInvestment = 17500;
      const totalProfitLoss = 2500;
      const totalProfitLossPercentage = 14.28;
      
      // Act
      const message = formatPortfolioMessage(
        portfolioData,
        currency,
        totalValue,
        totalInvestment,
        totalProfitLoss,
        totalProfitLossPercentage
      );
      
      // Assert
      expect(message).toContain('💼 *พอร์ตโฟลิโอของคุณ* 💼');
      expect(message).toContain('*มูลค่ารวม:* ฿20,000.00');
      expect(message).toContain('*เงินลงทุน:* ฿17,500.00');
      expect(message).toContain('+฿2,500.00 (14.28%)');
    });
  });
});
