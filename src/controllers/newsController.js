/**
 * คอนโทรลเลอร์จัดการข่าวและข้อมูลตลาด
 * จัดการการดึงข่าวและข้อมูลวิเคราะห์ตลาด
 */

const logger = require('../utils/logger').createModuleLogger('NewsController');
const UserModel = require('../models/user');
const { isValidCryptoSymbol } = require('../utils/validators');
const NewsService = require('../services/newsService');

/**
 * จัดการคำสั่ง /news <symbol> - แสดงข่าวล่าสุด
 * @param {object} ctx - Telegraf context
 */
async function handleGetNews(ctx) {
  try {
    // รับพารามิเตอร์จากข้อความ
    const params = ctx.message.text.split(' ').filter(Boolean);
    
    if (params.length < 2) {
      return ctx.reply(
        'รูปแบบคำสั่งไม่ถูกต้อง\n' +
        'การใช้งาน: /news <symbol>\n' +
        'ตัวอย่าง: /news BTC'
      );
    }
    
    const symbol = params[1].toUpperCase();
    
    // ตรวจสอบความถูกต้องของสัญลักษณ์
    if (!isValidCryptoSymbol(symbol)) {
      return ctx.reply(`สัญลักษณ์เหรียญไม่ถูกต้อง: ${symbol}`);
    }
    
    // ดึงข้อมูลผู้ใช้
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // แสดงข้อความกำลังโหลด
    const loadingMessage = await ctx.reply(`⏳ กำลังค้นหาข่าวล่าสุดเกี่ยวกับ ${symbol}...`);
    
    // ดึงข่าว
    const news = await NewsService.getNewsForCoin(symbol);
    
    if (!news || news.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMessage.message_id, 
        null, 
        `ไม่พบข่าวล่าสุดสำหรับ ${symbol}`
      );
      return;
    }
    
    // แสดงข่าวล่าสุด (5 รายการ)
    const formattedNews = formatNewsMessage(news.slice(0, 5), symbol);
    
    // อัพเดตข้อความจากกำลังโหลดเป็นข่าว
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      loadingMessage.message_id, 
      null, 
      formattedNews,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
    
    logger.info(`News fetched for ${symbol} by user ${user.id}`);
  } catch (error) {
    logger.error('Error in handleGetNews:', error);
    ctx.reply('เกิดข้อผิดพลาดในการดึงข่าว โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดรูปแบบข้อความข่าว
 * @param {Array} news - รายการข่าว
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @returns {string} - ข้อความที่จัดรูปแบบแล้ว
 */
function formatNewsMessage(news, symbol) {
  let message = `📰 *ข่าวล่าสุดเกี่ยวกับ ${symbol}* 📰\n\n`;
  
  news.forEach((item, index) => {
    // ตัดรายละเอียดข่าวให้ไม่ยาวเกินไป
    const truncatedDescription = item.description && item.description.length > 100
      ? `${item.description.substring(0, 100)}...`
      : item.description;
    
    message += `${index + 1}. *${item.title}*\n`;
    if (truncatedDescription) {
      message += `${truncatedDescription}\n`;
    }
    message += `[อ่านเพิ่มเติม](${item.url})\n`;
    message += `📅 ${formatDateTime(item.publishedAt)}\n\n`;
  });
  
  return message;
}

/**
 * จัดรูปแบบวันที่และเวลา
 * @param {string|Date} dateTime - วันที่และเวลา
 * @returns {string} - วันที่และเวลาที่จัดรูปแบบแล้ว
 */
function formatDateTime(dateTime) {
  const date = new Date(dateTime);
  return date.toLocaleString();
}

module.exports = {
  handleGetNews
};
