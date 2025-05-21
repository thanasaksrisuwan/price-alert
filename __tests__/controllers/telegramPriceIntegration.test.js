/**
 * ทดสอบการทำงานแบบบูรณาการของฟังก์ชัน Telegram ที่เกี่ยวข้องกับการแสดงราคาและการแจ้งเตือน
 */

const { Telegraf } = require('telegraf');
const priceController = require('../../src/controllers/priceController');
const alertController = require('../../src/controllers/alertController');
const PriceService = require('../../src/services/priceService');
const UserModel = require('../../src/models/user');
const AlertModel = require('../../src/models/alert');

// Mock dependencies
jest.mock('telegraf');
jest.mock('../../src/services/priceService');
jest.mock('../../src/models/user');
jest.mock('../../src/models/alert');
jest.mock('../../src/utils/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('Telegram Price Integration Tests', () => {
  let mockContext;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Create a mock Telegram context
    mockContext = {
      message: {
        text: ''
      },
      from: {
        id: 12345,
        username: 'testuser',
        first_name: 'Test User'
      },
      chat: {
        id: 12345
      },
      reply: jest.fn().mockResolvedValue({}),
      telegram: {
        editMessageText: jest.fn().mockResolvedValue({}),
        sendMessage: jest.fn().mockResolvedValue({})
      }
    };
  });

  /**
   * Test the price command flow in Telegram
   */
  describe('Price Command Tests', () => {
    it('should display price information when valid symbol is provided', async () => {
      // Arrange
      mockContext.message.text = '/price BTC';
      
      const mockUser = {
        id: 1,
        telegram_id: 12345,
        username: 'testuser',
        first_name: 'Test User',
        default_currency: 'USD'
      };
      
      const mockPriceData = {
        price: 50000.25,
        priceChange24h: 1500.75,
        priceChangePercentage24h: 3.1,
        marketCap: 950000000000,
        volume24h: 75000000000,
        high24h: 51000.5,
        low24h: 49500.75,
        lastUpdated: new Date().toISOString(),
        name: 'Bitcoin',
        imageUrl: 'https://example.com/btc.png'
      };
      
      // Setup mocks
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(mockUser);
      mockContext.reply = jest.fn().mockResolvedValue({ message_id: 100 });
      PriceService.getPrice = jest.fn().mockResolvedValue(mockPriceData);
      
      // Act
      await priceController.handlePriceCommand(mockContext);
      
      // Assert
      expect(UserModel.findUserByTelegramId).toHaveBeenCalledWith(12345);
      expect(PriceService.getPrice).toHaveBeenCalledWith('BTC', 'USD');
      expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('กำลังค้นหาราคา BTC'));
      expect(mockContext.telegram.editMessageText).toHaveBeenCalledWith(
        12345,
        100,
        null,
        expect.stringContaining('Bitcoin (BTC)'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
    });
    
    it('should handle invalid symbol format properly', async () => {
      // Arrange
      mockContext.message.text = '/price BTC$%';
      
      // Act
      await priceController.handlePriceCommand(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('สัญลักษณ์เหรียญไม่ถูกต้อง'));
      expect(PriceService.getPrice).not.toHaveBeenCalled();
    });
    
    it('should handle missing symbol properly', async () => {
      // Arrange
      mockContext.message.text = '/price';
      
      // Act
      await priceController.handlePriceCommand(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('กรุณาระบุสัญลักษณ์เหรียญ'));
      expect(PriceService.getPrice).not.toHaveBeenCalled();
    });
    
    it('should handle API error properly', async () => {
      // Arrange
      mockContext.message.text = '/price BTC';
      
      const mockUser = {
        id: 1,
        telegram_id: 12345,
        default_currency: 'USD'
      };
      
      // Setup mocks
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(mockUser);
      mockContext.reply = jest.fn().mockResolvedValue({ message_id: 100 });
      PriceService.getPrice = jest.fn().mockRejectedValue(new Error('API Error'));
      
      // Act
      await priceController.handlePriceCommand(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('เกิดข้อผิดพลาดในการดึงข้อมูลราคา'));
    });
    
    it('should handle not found price data properly', async () => {
      // Arrange
      mockContext.message.text = '/price UNKNOWN';
      
      const mockUser = {
        id: 1,
        telegram_id: 12345,
        default_currency: 'USD'
      };
      
      // Setup mocks
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(mockUser);
      mockContext.reply = jest.fn().mockResolvedValue({ message_id: 100 });
      PriceService.getPrice = jest.fn().mockResolvedValue(null);
      
      // Act
      await priceController.handlePriceCommand(mockContext);
      
      // Assert
      expect(mockContext.telegram.editMessageText).toHaveBeenCalledWith(
        12345,
        100,
        null,
        expect.stringContaining('ไม่พบข้อมูลราคาสำหรับ UNKNOWN')
      );
    });
    
    it('should use default currency when user is not found', async () => {
      // Arrange
      mockContext.message.text = '/price BTC';
      
      const mockPriceData = {
        price: 50000.25,
        priceChange24h: 1500.75,
        priceChangePercentage24h: 3.1,
        marketCap: 950000000000,
        volume24h: 75000000000,
        high24h: 51000.5,
        low24h: 49500.75,
        lastUpdated: new Date().toISOString(),
        name: 'Bitcoin',
        imageUrl: 'https://example.com/btc.png'
      };
      
      // Setup mocks
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(null);
      mockContext.reply = jest.fn().mockResolvedValue({ message_id: 100 });
      PriceService.getPrice = jest.fn().mockResolvedValue(mockPriceData);
      
      // Act
      await priceController.handlePriceCommand(mockContext);
      
      // Assert
      expect(PriceService.getPrice).toHaveBeenCalledWith('BTC', 'THB');
    });
  });

  /**
   * Test the price alert command flow in Telegram
   */
  describe('Price Alert Command Tests', () => {
    it('should create a price alert when valid parameters are provided', async () => {
      // Arrange
      mockContext.message.text = '/alert BTC above 55000';
      
      const mockUser = {
        id: 1,
        telegram_id: 12345,
        username: 'testuser',
        default_currency: 'USD'
      };
      
      const mockPriceData = {
        price: 50000.25,
        priceChange24h: 1500.75,
        priceChangePercentage24h: 3.1
      };
      
      const mockAlert = {
        id: 1,
        user_id: 1,
        symbol: 'BTC',
        alert_type: 'price_above',
        target_value: 55000,
        current_value: 50000.25,
        is_active: true
      };
      
      // Setup mocks
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(mockUser);
      PriceService.getPrice = jest.fn().mockResolvedValue(mockPriceData);
      AlertModel.createAlert = jest.fn().mockResolvedValue(mockAlert);
      
      // Act
      await alertController.handleSetAlert(mockContext);
      
      // Assert
      expect(UserModel.findUserByTelegramId).toHaveBeenCalledWith(12345);
      expect(PriceService.getPrice).toHaveBeenCalledWith('BTC', 'USD');
      expect(AlertModel.createAlert).toHaveBeenCalledWith({
        userId: 1,
        symbol: 'BTC',
        alertType: 'price_above',
        targetValue: 55000,
        currentValue: 50000.25
      });
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('ตั้งการแจ้งเตือนสำเร็จ')
      );
    });
    
    it('should handle invalid alert parameters properly', async () => {
      // Arrange
      mockContext.message.text = '/alert';
      
      // Act
      await alertController.handleSetAlert(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('รูปแบบคำสั่งไม่ถูกต้อง')
      );
      expect(AlertModel.createAlert).not.toHaveBeenCalled();
    });
    
    it('should handle invalid symbol format properly', async () => {
      // Arrange
      mockContext.message.text = '/alert BTC$%^ above 55000';
      
      // Act
      await alertController.handleSetAlert(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('สัญลักษณ์เหรียญไม่ถูกต้อง')
      );
      expect(AlertModel.createAlert).not.toHaveBeenCalled();
    });
    
    it('should handle invalid condition properly', async () => {
      // Arrange
      mockContext.message.text = '/alert BTC invalid 55000';
      
      // Act
      await alertController.handleSetAlert(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('เงื่อนไขต้องเป็น "above", "below" หรือ "percent_change" เท่านั้น')
      );
      expect(AlertModel.createAlert).not.toHaveBeenCalled();
    });
    
    it('should handle invalid target value properly', async () => {
      // Arrange
      mockContext.message.text = '/alert BTC above invalid';
      
      // Act
      await alertController.handleSetAlert(mockContext);
      
      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('ค่าเป้าหมายต้องเป็นตัวเลขเท่านั้น')
      );
      expect(AlertModel.createAlert).not.toHaveBeenCalled();
    });
    
    it('should handle below price alert properly', async () => {
      // Arrange
      mockContext.message.text = '/alert BTC below 45000';
      
      const mockUser = {
        id: 1,
        telegram_id: 12345,
        username: 'testuser',
        default_currency: 'USD'
      };
      
      const mockPriceData = {
        price: 50000.25,
        priceChange24h: 1500.75,
        priceChangePercentage24h: 3.1
      };
      
      const mockAlert = {
        id: 2,
        user_id: 1,
        symbol: 'BTC',
        alert_type: 'price_below',
        target_value: 45000,
        current_value: 50000.25,
        is_active: true
      };
      
      // Setup mocks
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(mockUser);
      PriceService.getPrice = jest.fn().mockResolvedValue(mockPriceData);
      AlertModel.createAlert = jest.fn().mockResolvedValue(mockAlert);
      
      // Act
      await alertController.handleSetAlert(mockContext);
      
      // Assert
      expect(AlertModel.createAlert).toHaveBeenCalledWith({
        userId: 1,
        symbol: 'BTC',
        alertType: 'price_below',
        targetValue: 45000,
        currentValue: 50000.25
      });
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('ตั้งการแจ้งเตือนสำเร็จ')
      );
    });
  });
});
