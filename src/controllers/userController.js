/**
 * คอนโทรลเลอร์จัดการผู้ใช้
 * จัดการเกี่ยวกับข้อมูลผู้ใช้และการโต้ตอบกับผู้ใช้
 */

const BaseController = require('./baseController');
const UserModel = require('../models/user');
const { getSupportedCurrencies } = require('../utils/currencyUtils');

/**
 * UserController class implementing SOLID principles
 * Extends BaseController to leverage common functionality
 */
class UserController extends BaseController {
  /**
   * Create a new UserController instance
   */
  constructor() {
    super('UserController');
    this.SUPPORTED_CURRENCIES = getSupportedCurrencies();
  }
  
  /**
   * จัดการคำสั่ง /start - เริ่มต้นการใช้งาน bot
   * @param {object} ctx - Telegraf context
   */
  async handleStart(ctx) {
    try {
      const { id: telegramId, username, first_name: firstName } = ctx.from;
      
      // บันทึกหรืออัพเดตข้อมูลผู้ใช้
      await UserModel.createUser({
        telegramId,
        username,
        firstName
      });
      
      // สร้างข้อความต้อนรับ
      const welcomeMessage = this._createWelcomeMessage(firstName || username || 'คุณ');
      
      // ส่งข้อความต้อนรับ
      await ctx.reply(welcomeMessage);
      
      this.logger.info(`New user registered: ${telegramId}, ${username}`);
    } catch (error) {
      this.handleError(error, ctx, 'handleStart');
    }
  }
  
  /**
   * จัดการคำสั่ง /help - แสดงข้อมูลความช่วยเหลือ
   * @param {object} ctx - Telegraf context
   */
  async handleHelp(ctx) {
    try {
      // Create help message
      const helpMessage = this._createHelpMessage();
      
      // ส่งข้อความช่วยเหลือในรูปแบบ Markdown
      await ctx.replyWithMarkdown(helpMessage);
    } catch (error) {
      this.handleError(error, ctx, 'handleHelp');
    }
  }
  
  /**
   * จัดการคำสั่ง /settings - ตั้งค่าส่วนตัว
   * @param {object} ctx - Telegraf context
   */
  async handleSettings(ctx) {
    try {
      // Get user with validation
      const user = await this.getUserWithValidation(ctx);
      if (!user) return;
      
      // Create settings message
      const settingsMessage = this._createSettingsMessage(user);
      
      // ส่งข้อความตั้งค่าในรูปแบบ Markdown
      await ctx.replyWithMarkdown(settingsMessage);
    } catch (error) {
      this.handleError(error, ctx, 'handleSettings');
    }
  }
  
  /**
   * จัดการคำสั่ง /premium - อัพเกรดเป็นผู้ใช้พรีเมียม
   * @param {object} ctx - Telegraf context
   */
  async handlePremium(ctx) {
    try {
      // Get user with validation
      const user = await this.getUserWithValidation(ctx);
      if (!user) return;
      
      if (user.premium) {
        return ctx.reply('คุณเป็นสมาชิกพรีเมียมอยู่แล้ว ✨');
      }
      
      // Create premium information message
      const premiumMessage = this._createPremiumMessage();
      
      // สร้าง inline keyboard สำหรับการชำระเงิน (ในการใช้งานจริงจะเชื่อมต่อกับระบบชำระเงิน)
      await ctx.replyWithMarkdown(premiumMessage, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 ชำระเงินรายเดือน', callback_data: 'premium_monthly' }],
            [{ text: '💰 ชำระเงินรายปี (ประหยัด 20%)', callback_data: 'premium_yearly' }]
          ]
        }
      });
    } catch (error) {
      this.handleError(error, ctx, 'handlePremium');
    }
  }
  
  /**
   * จัดการคำสั่ง /currency - ตั้งค่าสกุลเงินเริ่มต้น
   * @param {object} ctx - Telegraf context
   */
  async handleSetCurrency(ctx) {
    try {
      // Get user with validation
      const user = await this.getUserWithValidation(ctx);
      if (!user) return;
  
      // Get and validate command parameters
      const params = this.getCommandParams(
        ctx, 
        2, 
        'รูปแบบคำสั่งไม่ถูกต้อง โปรดใช้รูปแบบ /currency <code> เช่น /currency THB'
      );
      if (!params) return;
  
      const currencyCode = params[1].toUpperCase();
      
      // Validate currency code
      if (!this._validateCurrencyCode(ctx, currencyCode)) return;
      
      // Update user currency
      await UserModel.updateUserCurrency(user.telegramId, currencyCode);
      
      // Send confirmation
      const { name, symbol } = this.SUPPORTED_CURRENCIES[currencyCode];
      const successMessage = `✅ ตั้งค่าสกุลเงินเป็น ${currencyCode} (${name} ${symbol}) สำเร็จแล้ว`;
      
      ctx.reply(successMessage);
      
      this.logger.info(`User ${user.telegramId} set currency to ${currencyCode}`);
    } catch (error) {
      this.handleError(error, ctx, 'handleSetCurrency');
    }
  }
  
  /**
   * จัดการคำสั่ง /currencies - แสดงรายการสกุลเงินที่รองรับ
   * @param {object} ctx - Telegraf context
   */
  async handleListCurrencies(ctx) {
    try {
      // Create currency list message
      const message = this._createCurrencyListMessage();
      
      await ctx.replyWithMarkdown(message);
    } catch (error) {
      this.handleError(error, ctx, 'handleListCurrencies');
    }
  }
  
  /**
   * Creates welcome message for new users
   * @param {string} name - User's name or username
   * @returns {string} Welcome message
   * @private
   */
  _createWelcomeMessage(name) {
    return `
สวัสดีคุณ ${name}! 🎉

ยินดีต้อนรับสู่ Crypto Price Alert Bot 🤖
บอทนี้จะช่วยให้คุณติดตามราคาและรับการแจ้งเตือนสำหรับสกุลเงินคริปโตที่คุณสนใจ

คำสั่งพื้นฐาน:
/price <symbol> - ดูราคาปัจจุบัน เช่น /price BTC
/alert <symbol> <condition> <value> - ตั้งการแจ้งเตือน
/portfolio - ดูพอร์ตการลงทุนของคุณ
/help - แสดงคำสั่งทั้งหมด

เริ่มต้นใช้งานง่ายๆ ด้วยการพิมพ์ /price BTC เพื่อดูราคา Bitcoin ปัจจุบัน
`;
  }
  
  /**
   * Creates help message with all commands
   * @returns {string} Help message
   * @private
   */
  _createHelpMessage() {
    return `
📚 *คำสั่งที่สามารถใช้ได้* 📚

*คำสั่งพื้นฐาน:*
/start - เริ่มต้นใช้งานบอท
/help - แสดงรายการคำสั่ง
/settings - ตั้งค่าส่วนตัว
/premium - อัพเกรดเป็นสมาชิกพรีเมียม

*ราคาและการแจ้งเตือน:*
/price <symbol> - ดูราคาปัจจุบัน เช่น /price BTC
/alert <symbol> <condition> <value> - ตั้งการแจ้งเตือน
     เช่น /alert BTC above 50000
     หรือ /alert ETH below 3000
/alerts - ดูรายการแจ้งเตือนที่ตั้งไว้
/remove <alert_id> - ลบการแจ้งเตือน

*พอร์ตโฟลิโอ:*
/portfolio - ดูพอร์ตการลงทุน
/add <symbol> <quantity> <buy_price> - เพิ่มเหรียญ
     เช่น /add BTC 0.5 45000

*ข่าวและข้อมูล:*
/news <symbol> - ดูข่าวล่าสุดเกี่ยวกับเหรียญ

สมาชิกฟรีสามารถตั้งการแจ้งเตือนได้สูงสุด 10 รายการ
อัพเกรดเป็นพรีเมียมเพื่อรับการแจ้งเตือนไม่จำกัด และฟีเจอร์เพิ่มเติม
`;
  }
  
  /**
   * Creates settings message for a user
   * @param {object} user - User object
   * @returns {string} Settings message
   * @private
   */
  _createSettingsMessage(user) {
    return `
⚙️ *การตั้งค่าของคุณ* ⚙️

🌐 โซนเวลา: ${user.timezone}
💲 สกุลเงินเริ่มต้น: ${user.default_currency}
👤 สถานะ: ${user.premium ? 'พรีเมียม 🌟' : 'ฟรี'}

*การตั้งค่าโซนเวลา:*
พิมพ์ /timezone <zone> เพื่อตั้งค่า
เช่น /timezone Asia/Bangkok

*การตั้งค่าสกุลเงิน:*
พิมพ์ /currency <code> เพื่อตั้งค่า
เช่น /currency THB

อัพเกรดเป็นพรีเมียมด้วยคำสั่ง /premium
`;
  }
  
  /**
   * Creates premium information message
   * @returns {string} Premium message
   * @private
   */
  _createPremiumMessage() {
    return `
⭐ *อัพเกรดเป็นสมาชิกพรีเมียม* ⭐

สิทธิประโยชน์:
✅ การแจ้งเตือนไม่จำกัด (ฟรีจำกัดแค่ 10 รายการ)
✅ การแจ้งเตือนพิเศษ (การแจ้งเตือนปริมาณการซื้อขาย, แนวรับแนวต้าน)
✅ ข้อมูลวิเคราะห์ตลาดเชิงลึก
✅ การสนับสนุนจากทีมงานโดยตรง
✅ อัพเดทข่าวสารก่อนใคร

ราคา:
• รายเดือน: 9.99 USD/เดือน
• รายปี: 99.99 USD/ปี (ประหยัด 20%)

*วิธีการชำระเงิน*
กรุณากดปุ่มด้านล่างเพื่อดำเนินการชำระเงิน
`;
  }
  
  /**
   * Creates currency list message
   * @returns {string} Currency list message
   * @private
   */
  _createCurrencyListMessage() {
    let message = '*สกุลเงินที่รองรับ* 💲\n\n';
    
    for (const [code, { name, symbol }] of Object.entries(this.SUPPORTED_CURRENCIES)) {
      message += `• ${code} - ${name} (${symbol})\n`;
    }
    
    message += '\nสามารถตั้งค่าสกุลเงินเริ่มต้นด้วยคำสั่ง /currency <code>';
    
    return message;
  }
  
  /**
   * Validates currency code
   * @param {object} ctx - Telegraf context
   * @param {string} currencyCode - Currency code to validate
   * @returns {boolean} Validation result
   * @private
   */
  _validateCurrencyCode(ctx, currencyCode) {
    if (!this.SUPPORTED_CURRENCIES[currencyCode]) {
      ctx.reply(`รหัสสกุลเงินไม่ถูกต้อง โปรดใช้รหัสที่รองรับ เช่น USD, EUR, THB\nดูรายการสกุลเงินที่รองรับได้ด้วยคำสั่ง /currencies`);
      return false;
    }
    return true;
  }
}

// Create an instance
const userController = new UserController();

module.exports = {
  handleStart: userController.handleStart.bind(userController),
  handleHelp: userController.handleHelp.bind(userController),
  handleSettings: userController.handleSettings.bind(userController),
  handlePremium: userController.handlePremium.bind(userController),
  handleSetCurrency: userController.handleSetCurrency.bind(userController),
  handleListCurrencies: userController.handleListCurrencies.bind(userController)
};
