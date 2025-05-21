/**
 * ทดสอบการทำงานของ alertService ในการตรวจสอบและส่งการแจ้งเตือนราคา
 */

// Import the original module - we'll mock its internal functions
const alertServiceModule = require('../../src/services/alertService');
const AlertModel = require('../../src/models/alert');
const UserModel = require('../../src/models/user');
const PriceService = require('../../src/services/priceService');
const { Telegraf } = require('telegraf');

// Accessing the non-exported functions for testing using a mock implementation
// This is a technique to test private functions in modules
const path = require('path');
const fs = require('fs');
const alertServiceFilePath = path.join(__dirname, '../../src/services/alertService.js');
const alertServiceCode = fs.readFileSync(alertServiceFilePath, 'utf8');

// Mock dependencies
jest.mock('../../src/models/alert');
jest.mock('../../src/models/user');
jest.mock('../../src/services/priceService');
jest.mock('telegraf');

// Mock the bot instance
const mockBot = {
  telegram: {
    sendMessage: jest.fn().mockResolvedValue({})
  }
};

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('Alert Service Tests', () => {  // Get handles to the internal functions
  const alertService = alertServiceModule;
  const { checkSingleAlert, checkAlertsForSymbol, getExchangeRate } = alertServiceModule.__test__;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Create a mock implementation of the bot
    Telegraf.mockImplementation(() => mockBot);
  });

  describe('sendAlertNotification', () => {
    it('should send alert notification via Telegram', async () => {
      // Arrange
      const telegramId = 456789;
      const message = '🚨 Test alert message 🚨';
      
      // Act
      const result = await alertService.sendAlertNotification(telegramId, message);
      
      // Assert
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        telegramId, 
        message, 
        { parse_mode: 'Markdown' }
      );
      expect(result).toBe(true);
    });

    it('should not trigger price_above alert when price is below target', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 50000,
        current_value: 49000,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 49500; // Price not above target
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.fn().mockResolvedValue(true);
      
      // Act
      await alertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(UserModel.getUserById).toHaveBeenCalledWith(mockAlert.user_id);
      expect(alertService.sendAlertNotification).not.toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).not.toHaveBeenCalled();
    });

    it('should trigger price_below alert when price is below target', async () => {
      // Arrange
      const mockAlert = {
        id: 2,
        user_id: 123,
        symbol: 'ETH',
        alert_type: 'price_below',
        target_value: 2000,
        current_value: 2500,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 1950; // Price below target
      const priceData = { price: currentPrice, priceChangePercentage24h: -5 };
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.fn().mockResolvedValue(true);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Act
      await alertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });

    it('should not trigger price_below alert when price is above target', async () => {
      // Arrange
      const mockAlert = {
        id: 2,
        user_id: 123,
        symbol: 'ETH',
        alert_type: 'price_below',
        target_value: 2000,
        current_value: 2500,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 2100; // Price not below target
      const priceData = { price: currentPrice, priceChangePercentage24h: -2 };
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.fn().mockResolvedValue(true);
      
      // Act
      await alertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(alertService.sendAlertNotification).not.toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).not.toHaveBeenCalled();
    });

    it('should trigger percent_change alert when percent change exceeds target', async () => {
      // Arrange
      const mockAlert = {
        id: 3,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'percent_change',
        target_value: 5, // Target: 5% change
        current_value: null,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 52000;
      const priceData = { price: currentPrice, priceChangePercentage24h: 7.5 }; // 7.5% change, exceeds 5% target
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.fn().mockResolvedValue(true);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Act
      await alertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });

    it('should handle currency conversion when user default currency is not USD', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 1650000, // Target in THB
        current_value: 1600000,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'THB' // Thai Baht as default currency
      };
      
      const currentPrice = 52000; // USD price
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Assuming exchange rate of ~33 THB to 1 USD
      alertService.getExchangeRate = jest.fn().mockReturnValue(33);
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.fn().mockResolvedValue(true);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Act
      await alertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(alertService.getExchangeRate).toHaveBeenCalledWith('USD', 'THB');
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });

    it('should handle when user is not found', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 999, // Non-existent user
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 50000,
        current_value: 49000,
        is_active: true
      };
      
      const currentPrice = 51000;
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Mock getUserById to return null (user not found)
      UserModel.getUserById = jest.fn().mockResolvedValue(null);
      alertService.sendAlertNotification = jest.fn();
      
      // Act
      await alertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(UserModel.getUserById).toHaveBeenCalledWith(mockAlert.user_id);
      expect(alertService.sendAlertNotification).not.toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).not.toHaveBeenCalled();
    });
    
    it('should handle error during alert checking', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 50000,
        current_value: 49000,
        is_active: true
      };
      
      const currentPrice = 51000;
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Simulate an error during processing
      UserModel.getUserById = jest.fn().mockRejectedValue(new Error('Database error'));
      
      // Act & Assert - should not throw error
      await expect(alertService.checkSingleAlert(mockAlert, currentPrice, priceData))
        .resolves.not.toThrow();
    });
  });

  describe('checkSingleAlert (internal)', () => {
    it('should trigger price_above alert when price is above target', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 50000,
        current_value: 49000,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 51000;
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      alertService.sendAlertNotification = jest.spyOn(alertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      
      // Act
      await checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(UserModel.getUserById).toHaveBeenCalledWith(mockAlert.user_id);
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });

    it('should not trigger price_above alert when price is below target', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 50000,
        current_value: 49000,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 49500; // Price not above target
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.spyOn(alertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      
      // Act
      await checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(UserModel.getUserById).toHaveBeenCalledWith(mockAlert.user_id);
      expect(alertService.sendAlertNotification).not.toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).not.toHaveBeenCalled();
    });

    it('should trigger price_below alert when price is below target', async () => {
      // Arrange
      const mockAlert = {
        id: 2,
        user_id: 123,
        symbol: 'ETH',
        alert_type: 'price_below',
        target_value: 2000,
        current_value: 2500,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 1950; // Price below target
      const priceData = { price: currentPrice, priceChangePercentage24h: -5 };
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.spyOn(alertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Act
      await checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });

    it('should trigger percent_change alert when percent change exceeds target', async () => {
      // Arrange
      const mockAlert = {
        id: 3,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'percent_change',
        target_value: 5, // Target: 5% change
        current_value: null,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'USD'
      };
      
      const currentPrice = 52000;
      const priceData = { price: currentPrice, priceChangePercentage24h: 7.5 }; // 7.5% change, exceeds 5% target
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.spyOn(alertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Act
      await checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });

    it('should handle currency conversion when user default currency is not USD', async () => {
      // Arrange
      const mockAlert = {
        id: 1,
        user_id: 123,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 1650000, // Target in THB
        current_value: 1600000,
        is_active: true
      };
      
      const mockUser = {
        id: 123,
        telegram_id: 456789,
        default_currency: 'THB' // Thai Baht as default currency
      };
      
      const currentPrice = 52000; // USD price
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Mock the getExchangeRate function to simulate THB conversion
      const getExchangeRateSpy = jest.spyOn(alertServiceModule.__test__, 'getExchangeRate')
        .mockReturnValue(33); // 33 THB per 1 USD
      
      // Mock dependencies
      UserModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      alertService.sendAlertNotification = jest.spyOn(alertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Act
      await checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(getExchangeRateSpy).toHaveBeenCalledWith('USD', 'THB');
      expect(alertService.sendAlertNotification).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });
  });

  describe('checkAlertsForSymbol (internal)', () => {
    it('should check all alerts for a symbol', async () => {
      // Arrange
      const symbol = 'BTC';
      const mockAlerts = [
        {
          id: 1,
          user_id: 123,
          symbol: 'BTC',
          alert_type: 'price_above',
          target_value: 50000,
          current_value: 49000,
          is_active: true
        },
        {
          id: 2,
          user_id: 456,
          symbol: 'BTC',
          alert_type: 'price_below',
          target_value: 45000,
          current_value: 49000,
          is_active: true
        }
      ];
      
      const mockPriceData = {
        price: 51000,
        priceChangePercentage24h: 5
      };
      
      // Mock price service
      PriceService.getPrice = jest.fn().mockResolvedValue(mockPriceData);
      
      // Mock the checkSingleAlert function
      const checkSingleAlertSpy = jest.spyOn(alertServiceModule.__test__, 'checkSingleAlert')
        .mockResolvedValue(undefined);
      
      // Act
      await checkAlertsForSymbol(symbol, mockAlerts);
      
      // Assert
      expect(PriceService.getPrice).toHaveBeenCalledWith(symbol, 'USD');
      expect(checkSingleAlertSpy).toHaveBeenCalledTimes(2);
      expect(checkSingleAlertSpy).toHaveBeenCalledWith(mockAlerts[0], mockPriceData.price, mockPriceData);
      expect(checkSingleAlertSpy).toHaveBeenCalledWith(mockAlerts[1], mockPriceData.price, mockPriceData);
    });
  });

  describe('checkAlertsForSymbol', () => {
    it('should check all alerts for a symbol', async () => {
      // Arrange
      const symbol = 'BTC';
      const mockAlerts = [
        {
          id: 1,
          user_id: 123,
          symbol: 'BTC',
          alert_type: 'price_above',
          target_value: 50000,
          current_value: 49000,
          is_active: true
        },
        {
          id: 2,
          user_id: 456,
          symbol: 'BTC',
          alert_type: 'price_below',
          target_value: 45000,
          current_value: 49000,
          is_active: true
        }
      ];
      
      const mockPriceData = {
        price: 51000,
        priceChangePercentage24h: 5
      };
      
      // Mock price service
      PriceService.getPrice = jest.fn().mockResolvedValue(mockPriceData);
      
      // Spy on checkSingleAlert
      const checkSingleAlertSpy = jest.spyOn(alertService, 'checkSingleAlert')
        .mockResolvedValue(undefined);
      
      // Act
      await alertService.checkAlertsForSymbol(symbol, mockAlerts);
      
      // Assert
      expect(PriceService.getPrice).toHaveBeenCalledWith(symbol);
      expect(checkSingleAlertSpy).toHaveBeenCalledTimes(2);
      expect(checkSingleAlertSpy).toHaveBeenCalledWith(mockAlerts[0], mockPriceData.price, mockPriceData);
      expect(checkSingleAlertSpy).toHaveBeenCalledWith(mockAlerts[1], mockPriceData.price, mockPriceData);
    });

    it('should handle error when fetching price data fails', async () => {
      // Arrange
      const symbol = 'BTC';
      const mockAlerts = [
        {
          id: 1,
          user_id: 123,
          symbol,
          alert_type: 'price_above',
          target_value: 50000,
          current_value: 49000,
          is_active: true
        }
      ];
      
      // Mock price service to throw error
      PriceService.getPrice = jest.fn().mockRejectedValue(new Error('API error'));
      
      // Spy on checkSingleAlert
      const checkSingleAlertSpy = jest.spyOn(alertService, 'checkSingleAlert');
      
      // Act & Assert - should not throw error
      await expect(alertService.checkAlertsForSymbol(symbol, mockAlerts))
        .resolves.not.toThrow();
      
      expect(checkSingleAlertSpy).not.toHaveBeenCalled();
    });
  });
  
  describe('sendAlertNotification', () => {
    it('should send alert notification via Telegram', async () => {
      // Arrange
      const telegramId = 456789;
      const message = '🚨 Test alert message 🚨';
      
      // Mock bot.telegram.sendMessage
      bot.telegram.sendMessage = jest.fn().mockResolvedValue({});
      
      // Act
      const result = await alertService.sendAlertNotification(telegramId, message);
      
      // Assert
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        telegramId, 
        message, 
        { parse_mode: 'Markdown' }
      );
      expect(result).toBe(true);
    });    it('should handle error when sending notification fails', async () => {
      // Arrange
      const telegramId = 456789;
      const message = '🚨 Test alert message 🚨';
      
      // Mock bot.telegram.sendMessage to fail
      mockBot.telegram.sendMessage.mockRejectedValueOnce(new Error('Telegram API error'));
      
      // Act
      const result = await alertService.sendAlertNotification(telegramId, message);
      
      // Assert
      expect(result).toBe(false);
    });
  });
  
  describe('checkAllAlerts', () => {
    it('should check all active alerts', async () => {
      // Arrange
      const mockAlerts = [
        { id: 1, symbol: 'BTC', alert_type: 'price_above', target_value: 50000 },
        { id: 2, symbol: 'ETH', alert_type: 'price_below', target_value: 2000 }
      ];
      
      // Setup mocks
      AlertModel.findAllActiveAlerts = jest.fn().mockResolvedValue(mockAlerts);
      PriceService.getPrice = jest.fn().mockImplementation((symbol) => {
        if (symbol === 'BTC') {
          return Promise.resolve({ price: 51000, priceChangePercentage24h: 5 });
        } else {
          return Promise.resolve({ price: 1900, priceChangePercentage24h: -3 });
        }
      });
      
      UserModel.getUserById = jest.fn().mockResolvedValue({
        id: 1,
        telegram_id: 123456,
        default_currency: 'USD'
      });

      // Act
      await alertService.checkAllAlerts();
      
      // Assert
      expect(AlertModel.findAllActiveAlerts).toHaveBeenCalled();
      expect(PriceService.getPrice).toHaveBeenCalledWith('BTC', 'USD');
      expect(PriceService.getPrice).toHaveBeenCalledWith('ETH', 'USD');
    });
    
    it('should handle the case when there are no active alerts', async () => {
      // Arrange
      AlertModel.findAllActiveAlerts = jest.fn().mockResolvedValue([]);
      
      // Act
      await alertService.checkAllAlerts();
      
      // Assert
      expect(AlertModel.findAllActiveAlerts).toHaveBeenCalled();
      expect(PriceService.getPrice).not.toHaveBeenCalled();
    });
    
    it('should handle errors during alert checking', async () => {
      // Arrange
      AlertModel.findAllActiveAlerts = jest.fn().mockRejectedValue(new Error('Database error'));
      
      // Act & Assert - should not throw
      await expect(alertService.checkAllAlerts()).resolves.not.toThrow();
    });
  });
  
  describe('startAlertChecker', () => {
    let originalSetInterval;
    
    beforeEach(() => {
      // Save original setInterval
      originalSetInterval = global.setInterval;
      // Mock setInterval
      global.setInterval = jest.fn();
    });
    
    afterEach(() => {
      // Restore original setInterval
      global.setInterval = originalSetInterval;
    });
    
    it('should start the alert checker with correct interval', () => {
      // Arrange
      const mockConfig = { alerts: { checkInterval: 30000 } }; // 30 seconds
      jest.mock('../../src/config', () => mockConfig, { virtual: true });
      
      // Act
      alertService.startAlertChecker();
      
      // Assert
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), mockConfig.alerts.checkInterval);
    });
  });
});
