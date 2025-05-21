/**
 * ทดสอบสำหรับ priceController.js
 */

const priceController = require('../../src/controllers/priceController');
const PriceService = require('../../src/services/priceService');
const UserModel = require('../../src/models/user');

// Mock dependencies
jest.mock('../../src/services/priceService');
jest.mock('../../src/models/user');

// Access private functions for testing
const { formatCurrency, getCurrencySymbol } = priceController.__testExports;

describe('PriceController Tests', () => {  describe('formatCurrency', () => {
    it('should format Thai Baht correctly', () => {
      // Arrange & Act
      const result1 = formatCurrency(1234.56, 'THB');
      const result2 = formatCurrency(1000000, 'THB', true);
      const result3 = formatCurrency(0.12345678, 'THB');
      
      // Assert
      expect(result1).toBe('1,234.56 ฿');
      expect(result2).toBe('1.00M ฿');
      expect(result3).toBe('0.12345678 ฿');
    });
    
    it('should format other currencies correctly', () => {
      // Arrange & Act
      const resultUSD = formatCurrency(1234.56, 'USD');
      const resultEUR = formatCurrency(1234.56, 'EUR');
      const resultBTC = formatCurrency(0.00123456, 'BTC');
      
      // Assert
      expect(resultUSD).toBe('$1,234.56');
      expect(resultEUR).toBe('€1,234.56');
      expect(resultBTC).toBe('₿0.00123456');
    });
    
    it('should use compact formatting for large numbers when requested', () => {
      // Arrange & Act
      const result1 = formatCurrency(1234567, 'THB', true);
      const result2 = formatCurrency(5123456789, 'USD', true);
      
      // Assert
      expect(result1).toBe('1.23M ฿');
      expect(result2).toBe('$5.12B');
    });
    
    it('should handle null and undefined values gracefully', () => {
      // Arrange & Act
      const resultNull = formatCurrency(null, 'USD');
      const resultUndefined = formatCurrency(undefined, 'THB');
      
      // Assert
      expect(resultNull).toBe('$0.00');
      expect(resultUndefined).toBe('฿0.00');
    });
  });
  
  describe('getCurrencySymbol', () => {
    it('should return the correct symbol for supported currencies', () => {
      // Arrange & Act
      const thbSymbol = getCurrencySymbol('THB');
      const usdSymbol = getCurrencySymbol('USD');
      const btcSymbol = getCurrencySymbol('BTC');
      
      // Assert
      expect(thbSymbol).toBe('฿');
      expect(usdSymbol).toBe('$');
      expect(btcSymbol).toBe('₿');
    });
    
    it('should return the currency code with a space for unsupported currencies', () => {
      // Arrange & Act
      const result = getCurrencySymbol('XYZ');
      
      // Assert
      expect(result).toBe('XYZ ');
    });
  });
});
