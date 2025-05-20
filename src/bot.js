/**
 * โมดูลหลักสำหรับการตั้งค่า Telegram bot
 * ไฟล์นี้กำหนดการจัดการคำสั่ง Telegram bot และคำสั่งต่างๆ
 */

const config = require('./config');
const UserController = require('./controllers/userController');
const PriceController = require('./controllers/priceController');
const AlertController = require('./controllers/alertController');
const PortfolioController = require('./controllers/portfolioController');
const NewsController = require('./controllers/newsController');
const logger = require('./utils/logger').createModuleLogger('Bot');

/**
 * ตั้งค่า bot middleware และ command handlers
 * @param {object} bot - อินสแตนซ์ Telegraf bot
 */
module.exports = (bot) => {
  // Middleware เพื่อบันทึกข้อมูลการใช้งาน
  bot.use(async (ctx, next) => {
    const startTime = new Date();
    
    // บันทึกข้อมูลการใช้งาน
    logger.info('Bot request', {
      userId: ctx.from?.id,
      username: ctx.from?.username,
      chatId: ctx.chat?.id,
      message: ctx.message?.text,
      update: ctx.updateType
    });
    
    // ดำเนินการต่อไป
    await next();
    
    // บันทึกเวลาที่ใช้ในการตอบสนอง
    const responseTime = new Date() - startTime;
    logger.debug(`Response time: ${responseTime}ms`);
  });
  
  // ตั้งค่า error handling
  bot.catch((err, ctx) => {
    logger.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  });
  
  // =========== คำสั่งพื้นฐาน ===========
  
  // คำสั่ง /start - เริ่มต้นใช้งาน bot
  bot.start(UserController.handleStart);
  
  // คำสั่ง /help - แสดงความช่วยเหลือ
  bot.help(UserController.handleHelp);
  
  // คำสั่ง /settings - ตั้งค่าผู้ใช้
  bot.command('settings', UserController.handleSettings);
  
  // คำสั่ง /premium - อัพเกรดเป็นผู้ใช้พรีเมียม
  bot.command('premium', UserController.handlePremium);
  
  // คำสั่ง /currency <code> - ตั้งค่าสกุลเงินเริ่มต้น
  bot.command('currency', UserController.handleSetCurrency);
  
  // คำสั่ง /currencies - แสดงรายการสกุลเงินที่รองรับ
  bot.command('currencies', UserController.handleListCurrencies);
  
  // =========== คำสั่งตรวจสอบราคา ===========
  
  // คำสั่ง /price <symbol> - ดูราคาปัจจุบัน
  bot.command('price', PriceController.handlePriceCommand);
  
  // =========== คำสั่งจัดการการแจ้งเตือน ===========
  
  // คำสั่ง /alert <symbol> <condition> <value> - ตั้งค่าการแจ้งเตือนราคา
  bot.command('alert', AlertController.handleSetAlert);
  
  // คำสั่ง /alerts - แสดงรายการแจ้งเตือนที่เปิดใช้งาน
  bot.command('alerts', AlertController.handleListAlerts);
  
  // คำสั่ง /remove <alert_id> - ลบการแจ้งเตือน
  bot.command('remove', AlertController.handleRemoveAlert);
  
  // =========== คำสั่งพอร์ตโฟลิโอ ===========
  
  // คำสั่ง /portfolio - แสดงพอร์ตโฟลิโอ
  bot.command('portfolio', PortfolioController.handleShowPortfolio);
  
  // คำสั่ง /add <symbol> <quantity> <buy_price> - เพิ่มเหรียญในพอร์ตโฟลิโอ
  bot.command('add', PortfolioController.handleAddToPortfolio);
  
  // =========== คำสั่งข่าวและการวิเคราะห์ ===========
  
  // คำสั่ง /news <symbol> - แสดงข่าวล่าสุด
  bot.command('news', NewsController.handleGetNews);
  
  // รับมือกับข้อความที่ไม่มีการรองรับ
  bot.on('text', (ctx) => {
    ctx.reply('คำสั่งไม่ถูกต้อง พิมพ์ /help เพื่อดูคำสั่งที่รองรับ');
  });
  
  // เริ่มต้นการทำงานของบอท
  logger.info('Bot commands and middleware registered');
};
