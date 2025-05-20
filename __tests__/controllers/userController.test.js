/**
 * ทดสอบสำหรับ userController.js
 */

const userController = require('../../src/controllers/userController');
const UserModel = require('../../src/models/user');

// Mock Telegraf context
const createMockContext = (userId, username = 'testuser', firstName = 'Test User') => {
  return {
    from: {
      id: userId,
      username,
      first_name: firstName
    },
    reply: jest.fn().mockResolvedValue({}),
    replyWithMarkdown: jest.fn().mockResolvedValue({})
  };
};

// Mock UserModel
jest.mock('../../src/models/user');

describe('User Controller Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('handleSetCurrency', () => {
    it('should update user currency preference', async () => {
      // Arrange
      const ctx = createMockContext(12345);
      ctx.message = {
        text: '/currency THB'
      };
      
      const mockUser = {
        telegramId: 12345,
        username: 'testuser',
        firstName: 'Test User',
        default_currency: 'USD'
      };
      
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(mockUser);
      UserModel.updateUserCurrency = jest.fn().mockResolvedValue({ 
        ...mockUser, 
        default_currency: 'THB' 
      });
      
      // Act
      await userController.handleSetCurrency(ctx);
        // Assert
      expect(UserModel.findUserByTelegramId).toHaveBeenCalledWith(12345);
      expect(UserModel.updateUserCurrency).toHaveBeenCalledWith(12345, 'THB');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('ตั้งค่าสกุลเงินเป็น THB'));
    });
    it('should handle invalid currency code', async () => {
      // Arrange
      const ctx = createMockContext(12345);
      ctx.message = {
        text: '/currency XYZ'
      };
      
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue({
        telegramId: 12345,
        default_currency: 'USD'
      });
      
      // Act
      await userController.handleSetCurrency(ctx);
      
      // Assert
      expect(UserModel.updateUserCurrency).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('รหัสสกุลเงินไม่ถูกต้อง'));
    });
    
    it('should handle user not found', async () => {
      // Arrange
      const ctx = createMockContext(12345);
      ctx.message = {
        text: '/currency THB'
      };
      
      UserModel.findUserByTelegramId = jest.fn().mockResolvedValue(null);
      
      // Act
      await userController.handleSetCurrency(ctx);
      
      // Assert
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('โปรดเริ่มต้นใช้งานบอท'));
    });
  });
  
  describe('handleListCurrencies', () => {
    it('should display supported currencies', async () => {
      // Arrange
      const ctx = createMockContext(12345);
      
      // Act
      await userController.handleListCurrencies(ctx);
      
      // Assert
      expect(ctx.replyWithMarkdown).toHaveBeenCalledWith(
        expect.stringContaining('*สกุลเงินที่รองรับ*')
      );
      expect(ctx.replyWithMarkdown).toHaveBeenCalledWith(
        expect.stringContaining('THB - บาทไทย (฿)')
      );
    });
  });
});
