/**
 * โมดูลหลักสำหรับการตั้งค่า Telegram bot
 * ไฟล์นี้กำหนดการจัดการคำสั่ง Telegram bot และคำสั่งต่างๆ
 * Refactored to use modular approach with SOLID principles
 */

const config = require('./config');
const UserController = require('./controllers/userController');
const PriceController = require('./controllers/priceController');
const AlertController = require('./controllers/alertController');
const PortfolioController = require('./controllers/portfolioController');
const NewsController = require('./controllers/newsController');
const BotCommandRegistry = require('./utils/botCommandRegistry');
const logger = require('./utils/logger').createModuleLogger('Bot');

/**
 * ตั้งค่า bot middleware และ command handlers
 * @param {object} bot - อินสแตนซ์ Telegraf bot
 */
module.exports = (bot) => {
  // Create a command registry
  const registry = new BotCommandRegistry();
  
  // Add logging middleware
  registry.addMiddleware(async (ctx, next) => {
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
  
  // Add error handler
  registry.addErrorHandler((err, ctx) => {
    logger.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  });
  
  // Add command groups - basic commands
  registry.addCommandGroup('Basic Commands', [
    { command: 'start', handler: UserController.handleStart },
    { command: 'help', handler: UserController.handleHelp },
    { command: 'settings', handler: UserController.handleSettings },
    { command: 'premium', handler: UserController.handlePremium },
    { command: 'currency', handler: UserController.handleSetCurrency },
    { command: 'currencies', handler: UserController.handleListCurrencies },
  ]);
  
  // Add command groups - price commands
  registry.addCommandGroup('Price Commands', [
    { command: 'price', handler: PriceController.handlePriceCommand },
  ]);
  
  // Add command groups - alert commands
  registry.addCommandGroup('Alert Commands', [
    { command: 'alert', handler: AlertController.handleSetAlert },
    { command: 'alerts', handler: AlertController.handleListAlerts },
    { command: 'remove', handler: AlertController.handleRemoveAlert },
  ]);
  
  // Add command groups - portfolio commands
  registry.addCommandGroup('Portfolio Commands', [
    { command: 'portfolio', handler: PortfolioController.handleShowPortfolio },
    { command: 'add', handler: PortfolioController.handleAddToPortfolio },
  ]);
  
  // Add command groups - news commands
  registry.addCommandGroup('News Commands', [
    { command: 'news', handler: NewsController.handleGetNews },
  ]);
  
  // Add handler for unknown text messages
  registry.addMessageHandler((ctx) => {
    ctx.reply('คำสั่งไม่ถูกต้อง พิมพ์ /help เพื่อดูคำสั่งที่รองรับ');
  });
  
  // Register everything with the bot
  registry.registerWith(bot);
  
  // Log bot initialization
  logger.info('Bot commands and middleware registered');
};
