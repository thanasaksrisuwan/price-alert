/**
 * ไฟล์ทดสอบสำหรับ Alert Service
 */

const AlertService = require('../../services/alertService');
const AlertModel = require('../../models/alert');
const PriceService = require('../../services/priceService');

// Mock dependencies
jest.mock('../../models/alert');
jest.mock('../../services/priceService');
jest.mock('telegraf');

describe('AlertService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('checkSingleAlert', () => {
    test('should trigger price_above alert when condition is met', async () => {
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
      AlertModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      AlertModel.markAlertAsTriggered = jest.fn().mockResolvedValue({ ...mockAlert, is_active: false });
      
      // Create a spy on the sendAlertNotification function
      const sendNotificationSpy = jest.spyOn(AlertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      
      // Act
      await AlertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(AlertModel.getUserById).toHaveBeenCalledWith(mockAlert.user_id);
      expect(sendNotificationSpy).toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).toHaveBeenCalledWith(mockAlert.id, currentPrice);
    });
    
    test('should not trigger price_above alert when condition is not met', async () => {
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
      
      const currentPrice = 49000; // Price not above target
      const priceData = { price: currentPrice, priceChangePercentage24h: 5 };
      
      // Mock dependencies
      AlertModel.getUserById = jest.fn().mockResolvedValue(mockUser);
      
      // Create a spy on the sendAlertNotification function
      const sendNotificationSpy = jest.spyOn(AlertService, 'sendAlertNotification')
        .mockResolvedValue(true);
      
      // Act
      await AlertService.checkSingleAlert(mockAlert, currentPrice, priceData);
      
      // Assert
      expect(AlertModel.getUserById).toHaveBeenCalledWith(mockAlert.user_id);
      expect(sendNotificationSpy).not.toHaveBeenCalled();
      expect(AlertModel.markAlertAsTriggered).not.toHaveBeenCalled();
    });
  });
});
