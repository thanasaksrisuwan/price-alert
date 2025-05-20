/**
 * คอนโทรลเลอร์จัดการพอร์ตโฟลิโอ
 * จัดการการเพิ่ม แสดง และจัดการพอร์ตโฟลิโอ
 */

const logger = require('../utils/logger').createModuleLogger('PortfolioController');
const PortfolioModel = require('../models/portfolio');
const UserModel = require('../models/user');
const PriceService = require('../services/priceService');
const { isValidCryptoSymbol, isValidNumber } = require('../utils/validators');

/**
 * จัดการคำสั่ง /portfolio - แสดงพอร์ตโฟลิโอ
 * @param {object} ctx - Telegraf context
 */
async function handleShowPortfolio(ctx) {
  try {
    // ดึงข้อมูลผู้ใช้
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // ดึงข้อมูลพอร์ตโฟลิโอของผู้ใช้
    const portfolioItems = await PortfolioModel.getPortfolioByUser(user.id);
    
    if (!portfolioItems || portfolioItems.length === 0) {
      return ctx.reply(
        'คุณยังไม่มีเหรียญในพอร์ตโฟลิโอ\n\n' +
        'เพิ่มเหรียญด้วยคำสั่ง /add <symbol> <quantity> <buy_price>\n' +
        'ตัวอย่าง: /add BTC 0.5 45000'
      );
    }
    
    // แสดงข้อความกำลังโหลด
    const loadingMessage = await ctx.reply('⏳ กำลังโหลดข้อมูลพอร์ตโฟลิโอของคุณ...');
    
    // ดึงข้อมูลราคาปัจจุบันของทุกเหรียญ
    const portfolioData = await Promise.all(
      portfolioItems.map(async (item) => {
        const priceData = await PriceService.getPrice(item.symbol, user.default_currency);
        
        if (!priceData) {
          return {
            ...item,
            currentPrice: 0,
            currentValue: 0,
            profitLoss: 0,
            profitLossPercentage: 0,
            priceAvailable: false
          };
        }
        
        const currentPrice = priceData.price;
        const currentValue = currentPrice * item.quantity;
        const buyValue = item.buy_price * item.quantity;
        const profitLoss = currentValue - buyValue;
        const profitLossPercentage = (profitLoss / buyValue) * 100;
        
        return {
          ...item,
          currentPrice,
          currentValue,
          profitLoss,
          profitLossPercentage,
          priceAvailable: true
        };
      })
    );
    
    // คำนวณมูลค่ารวม
    const totalValue = portfolioData.reduce((sum, item) => sum + item.currentValue, 0);
    const totalInvestment = portfolioData.reduce((sum, item) => sum + (item.buy_price * item.quantity), 0);
    const totalProfitLoss = totalValue - totalInvestment;
    const totalProfitLossPercentage = (totalProfitLoss / totalInvestment) * 100;
    
    // จัดรูปแบบข้อความพอร์ตโฟลิโอ
    const message = formatPortfolioMessage(
      portfolioData,
      user.default_currency,
      totalValue,
      totalInvestment,
      totalProfitLoss,
      totalProfitLossPercentage
    );
    
    // อัพเดตข้อความจากกำลังโหลดเป็นข้อมูลพอร์ตโฟลิโอ
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      loadingMessage.message_id, 
      null, 
      message,
      { parse_mode: 'Markdown' }
    );
    
    logger.info(`Portfolio viewed by user ${user.id}`);
  } catch (error) {
    logger.error('Error in handleShowPortfolio:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /add <symbol> <quantity> <buy_price> - เพิ่มเหรียญในพอร์ตโฟลิโอ
 * @param {object} ctx - Telegraf context
 */
async function handleAddToPortfolio(ctx) {
  try {
    // รับพารามิเตอร์จากข้อความ
    const params = ctx.message.text.split(' ').filter(Boolean);
    
    if (params.length < 4) {
      return ctx.reply(
        'รูปแบบคำสั่งไม่ถูกต้อง\n' +
        'การใช้งาน: /add <symbol> <quantity> <buy_price>\n' +
        'ตัวอย่าง: /add BTC 0.5 45000'
      );
    }
    
    const symbol = params[1].toUpperCase();
    const quantity = parseFloat(params[2]);
    const buyPrice = parseFloat(params[3]);
    
    // ตรวจสอบความถูกต้องของข้อมูล
    if (!isValidCryptoSymbol(symbol)) {
      return ctx.reply(`สัญลักษณ์เหรียญไม่ถูกต้อง: ${symbol}`);
    }
    
    if (!isValidNumber(quantity) || quantity <= 0) {
      return ctx.reply('จำนวนต้องเป็นตัวเลขที่มีค่ามากกว่า 0');
    }
    
    if (!isValidNumber(buyPrice) || buyPrice <= 0) {
      return ctx.reply('ราคาซื้อต้องเป็นตัวเลขที่มีค่ามากกว่า 0');
    }
    
    // ดึงข้อมูลผู้ใช้
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // ตรวจสอบว่าเหรียญมีอยู่จริง
    const priceData = await PriceService.getPrice(symbol, user.default_currency);
    
    if (!priceData) {
      return ctx.reply(`ไม่พบข้อมูลของเหรียญ ${symbol} โปรดตรวจสอบรหัสเหรียญอีกครั้ง`);
    }
    
    // เพิ่มหรืออัพเดตเหรียญในพอร์ตโฟลิโอ
    const existingItem = await PortfolioModel.getPortfolioItemBySymbol(user.id, symbol);
    
    let resultItem;
    if (existingItem) {
      // ถ้ามีเหรียญนี้อยู่แล้ว ให้เพิ่มจำนวนและคำนวณราคาซื้อเฉลี่ยใหม่
      const newQuantity = existingItem.quantity + quantity;
      const newTotalCost = (existingItem.quantity * existingItem.buy_price) + (quantity * buyPrice);
      const newAvgPrice = newTotalCost / newQuantity;
      
      resultItem = await PortfolioModel.addOrUpdatePortfolioItem({
        userId: user.id,
        symbol,
        quantity: newQuantity,
        buyPrice: newAvgPrice
      });
      
      await ctx.reply(
        `✅ อัพเดตเหรียญ ${symbol} ในพอร์ตโฟลิโอสำเร็จ\n\n` +
        `จำนวนรวมใหม่: ${newQuantity}\n` +
        `ราคาซื้อเฉลี่ย: ${newAvgPrice.toFixed(2)} ${user.default_currency}\n\n` +
        `ดูพอร์ตโฟลิโอทั้งหมด: /portfolio`
      );
    } else {
      // ถ้ายังไม่มีเหรียญนี้ ให้เพิ่มใหม่
      resultItem = await PortfolioModel.addOrUpdatePortfolioItem({
        userId: user.id,
        symbol,
        quantity,
        buyPrice
      });
      
      await ctx.reply(
        `✅ เพิ่มเหรียญ ${symbol} ในพอร์ตโฟลิโอสำเร็จ\n\n` +
        `จำนวน: ${quantity}\n` +
        `ราคาซื้อ: ${buyPrice} ${user.default_currency}\n\n` +
        `ดูพอร์ตโฟลิโอทั้งหมด: /portfolio`
      );
    }
    
    logger.info(`Portfolio updated for user ${user.id}: added/updated ${symbol}`);
  } catch (error) {
    logger.error('Error in handleAddToPortfolio:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดรูปแบบข้อความพอร์ตโฟลิโอ
 * @param {Array} portfolioData - ข้อมูลพอร์ตโฟลิโอ
 * @param {string} currency - สกุลเงิน
 * @param {number} totalValue - มูลค่ารวม
 * @param {number} totalInvestment - การลงทุนรวม
 * @param {number} totalProfitLoss - กำไร/ขาดทุนรวม
 * @param {number} totalProfitLossPercentage - เปอร์เซ็นต์กำไร/ขาดทุนรวม
 * @returns {string} - ข้อความที่จัดรูปแบบแล้ว
 */
function formatPortfolioMessage(portfolioData, currency, totalValue, totalInvestment, totalProfitLoss, totalProfitLossPercentage) {
  const currencySymbol = getCurrencySymbol(currency);
  const isProfitable = totalProfitLoss >= 0;
  const profitIndicator = isProfitable ? '📈' : '📉';
  
  // ส่วนหัวของข้อความ
  let message = `💼 *พอร์ตโฟลิโอของคุณ* 💼\n\n`;
  
  // ส่วนสรุปรวม
  message += `*มูลค่ารวม:* ${currencySymbol}${totalValue.toFixed(2)}\n`;
  message += `*เงินลงทุน:* ${currencySymbol}${totalInvestment.toFixed(2)}\n`;
  message += `*กำไร/ขาดทุน:* ${profitIndicator} ${totalProfitLoss >= 0 ? '+' : ''}${currencySymbol}${totalProfitLoss.toFixed(2)} (${totalProfitLossPercentage.toFixed(2)}%)\n\n`;
  
  message += `*รายละเอียดเหรียญ:*\n`;
  
  // ส่วนรายการเหรียญ
  portfolioData.forEach((item, index) => {
    const itemProfitIndicator = item.profitLoss >= 0 ? '🟢' : '🔴';
    
    message += `\n${itemProfitIndicator} *${item.symbol}*\n`;
    message += `จำนวน: ${item.quantity}\n`;
    
    if (item.priceAvailable) {
      message += `ราคาปัจจุบัน: ${currencySymbol}${item.currentPrice.toFixed(2)}\n`;
      message += `มูลค่า: ${currencySymbol}${item.currentValue.toFixed(2)}\n`;
      message += `ราคาซื้อ: ${currencySymbol}${item.buy_price.toFixed(2)}\n`;
      message += `กำไร/ขาดทุน: ${item.profitLoss >= 0 ? '+' : ''}${currencySymbol}${item.profitLoss.toFixed(2)} (${item.profitLossPercentage.toFixed(2)}%)\n`;
    } else {
      message += `ราคาปัจจุบัน: ไม่สามารถดึงข้อมูลได้\n`;
      message += `ราคาซื้อ: ${currencySymbol}${item.buy_price.toFixed(2)}\n`;
    }
  });
  
  // ส่วนท้ายของข้อความ
  message += `\n\nเพิ่มเหรียญ: /add <symbol> <quantity> <buy_price>`;
  
  return message;
}

/**
 * รับสัญลักษณ์สกุลเงิน
 * @param {string} currency - รหัสสกุลเงิน
 * @returns {string} - สัญลักษณ์สกุลเงิน
 */
function getCurrencySymbol(currency) {
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    THB: '฿',
    BTC: '₿'
  };
  
  return symbols[currency] || `${currency} `;
}

module.exports = {
  handleShowPortfolio,
  handleAddToPortfolio
};
