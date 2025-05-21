/**
 * คอนโทรลเลอร์จัดการราคาคริปโต
 * ไฟล์นี้จัดการการดึงและแสดงข้อมูลราคาเหรียญคริปโต
 */

const logger = require('../utils/logger').createModuleLogger('PriceController');
const { isValidCryptoSymbol } = require('../utils/validators');
const PriceService = require('../services/priceService');
const EnhancedPriceService = require('../services/enhancedPriceService');
const UserModel = require('../models/user');

/**
 * จัดการคำสั่ง /price <symbol> - แสดงราคาปัจจุบันของเหรียญ
 * @param {object} ctx - Telegraf context
 */
async function handlePriceCommand(ctx) {
  try {
    // รับพารามิเตอร์จากข้อความ
    const params = ctx.message.text.split(' ').filter(Boolean);
    
    if (params.length < 2) {
      return ctx.reply('กรุณาระบุสัญลักษณ์เหรียญ เช่น /price BTC');
    }
    
    const symbol = params[1].toUpperCase();
    
    // ตรวจสอบความถูกต้องของสัญลักษณ์
    if (!isValidCryptoSymbol(symbol)) {
      return ctx.reply(`สัญลักษณ์เหรียญไม่ถูกต้อง: ${symbol}`);
    }
    
    // ดึงข้อมูลผู้ใช้เพื่อเลือกสกุลเงินที่ต้องการแสดง
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    const currency = user?.default_currency || 'THB';
    
    // เริ่มแสดงการโหลดข้อมูล
    const loadingMessage = await ctx.reply(`กำลังค้นหาราคา ${symbol}...`);
      // ดึงข้อมูลราคา
    let priceData = await PriceService.getPrice(symbol, currency);
    
    if (!priceData) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMessage.message_id, 
        null, 
        `ไม่พบข้อมูลราคาสำหรับ ${symbol}`
      );
      return;
    }
    
    // เสริมข้อมูล market cap ถ้าจำเป็น
    priceData = await EnhancedPriceService.enhancePriceData(priceData, symbol, currency);
    
    // สร้างข้อความแสดงราคาและข้อมูลเพิ่มเติม
    const message = formatPriceMessage(priceData, symbol, currency);
    
    // อัพเดตข้อความจากกำลังโหลดเป็นข้อมูลราคา
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      loadingMessage.message_id, 
      null, 
      message,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
    
    logger.info(`Price data fetched for ${symbol} by user ${telegramId}`);
  } catch (error) {
    logger.error('Error in handlePriceCommand:', error);
    ctx.reply('เกิดข้อผิดพลาดในการดึงข้อมูลราคา โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดรูปแบบข้อความแสดงราคา
 * @param {object} priceData - ข้อมูลราคาและรายละเอียดเหรียญ
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงินที่ใช้แสดงราคา
 * @returns {string} - ข้อความที่จัดรูปแบบแล้ว
 */
function formatPriceMessage(priceData, symbol, currency) {
  const {
    price,
    priceChange24h,
    priceChangePercentage24h,
    marketCap,
    volume24h,
    high24h,
    low24h,
    lastUpdated,
    name,
    imageUrl
  } = priceData;
  
  // ตรวจสอบค่าที่จำเป็นและกำหนดค่าเริ่มต้น
  const safeName = name || symbol;
  const safePrice = price || 0;
  const safePriceChange24h = priceChange24h || 0;
  const safePriceChangePercentage24h = priceChangePercentage24h || 0;
  const safeMarketCap = marketCap || 0;
  const safeVolume24h = volume24h || 0;
  const safeHigh24h = high24h || 0;
  const safeLow24h = low24h || 0;
  const safeLastUpdated = lastUpdated || new Date();
  
  // สร้างตัวบ่งชี้แนวโน้มราคา
  const trendIndicator = safePriceChangePercentage24h >= 0 ? '🟢' : '🔴';
  
  // จัดรูปแบบราคา
  const formattedPrice = formatCurrency(safePrice, currency);
  const formattedMarketCap = formatCurrency(safeMarketCap, currency, true);
  const formattedVolume = formatCurrency(safeVolume24h, currency, true);
  const formattedHigh = formatCurrency(safeHigh24h, currency);
  const formattedLow = formatCurrency(safeLow24h, currency);
  
  // จัดรูปแบบการเปลี่ยนแปลงราคา
  const changePrefix = safePriceChangePercentage24h >= 0 ? '+' : '';
  const formattedChange = `${changePrefix}${safePriceChangePercentage24h.toFixed(2)}%`;
  const formattedPriceChange = formatCurrency(safePriceChange24h, currency);
  
  // สร้างข้อความ
  return `
${trendIndicator} *${name} (${symbol})* ${trendIndicator}

💰 *ราคา:* ${formattedPrice}
📈 *เปลี่ยนแปลง (24ชม):* ${formattedChange} (${formattedPriceChange})
〽️ *สูงสุด/ต่ำสุด (24ชม):* ${formattedHigh} / ${formattedLow}
💹 *มูลค่าตลาด:* ${formattedMarketCap}
📊 *ปริมาณซื้อขาย (24ชม):* ${formattedVolume}
🕒 *อัพเดตเมื่อ:* ${formatDateTime(lastUpdated)}

*ตั้งการแจ้งเตือนราคา:*
/alert ${symbol} above [ราคา] - แจ้งเตือนเมื่อราคาสูงกว่า
/alert ${symbol} below [ราคา] - แจ้งเตือนเมื่อราคาต่ำกว่า
`;
}

/**
 * จัดรูปแบบค่าเงิน
 * @param {number} value - มูลค่าที่ต้องการจัดรูปแบบ
 * @param {string} currency - สกุลเงิน
 * @param {boolean} [compact=false] - จัดรูปแบบแบบย่อหรือไม่
 * @returns {string} - ค่าเงินที่จัดรูปแบบแล้ว
 */
function formatCurrency(value, currency, compact = false) {
  // ตรวจสอบค่า null หรือ undefined
  if (value === null || value === undefined) {
    logger.warn(`Attempted to format undefined or null value as currency: ${currency}`);
    return `${getCurrencySymbol(currency)}0.00`;
  }
    const currencySymbol = getCurrencySymbol(currency);
  
  if (compact && value >= 1e9) {
    // Thai Baht shows symbol after the number
    return currency === 'THB'
      ? `${(value / 1e9).toFixed(2)}B ${currencySymbol}`
      : `${currencySymbol}${(value / 1e9).toFixed(2)}B`;
  } else if (compact && value >= 1e6) {
    // Thai Baht shows symbol after the number
    return currency === 'THB'
      ? `${(value / 1e6).toFixed(2)}M ${currencySymbol}`
      : `${currencySymbol}${(value / 1e6).toFixed(2)}M`;
  } else if (compact && value >= 1e3) {
    // Thai Baht shows symbol after the number
    return currency === 'THB'
      ? `${(value / 1e3).toFixed(2)}K ${currencySymbol}`
      : `${currencySymbol}${(value / 1e3).toFixed(2)}K`;
  }
  
  // จัดรูปแบบโดยใช้ locale ที่เหมาะสมตามสกุลเงิน
  const locale = currency === 'THB' ? 'th-TH' : undefined;
  
  // กำหนดจำนวนทศนิยม
  const decimalPlaces = value < 1 ? 8 : 2;
  
  // จัดรูปแบบจำนวนเงิน
  const formattedNumber = value.toLocaleString(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  });
  
  // สำหรับสกุลเงินบาท (THB) แสดงสัญลักษณ์หลังตัวเลขตามมาตรฐานไทย
  if (currency === 'THB') {
    return `${formattedNumber} ${currencySymbol}`;
  }
  
  // สำหรับสกุลเงินอื่นๆ แสดงสัญลักษณ์ตามมาตรฐานสากล (หน้าตัวเลข)
  return `${currencySymbol}${formattedNumber}`;
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
  handlePriceCommand,
  // Export for testing
  __testExports: {
    formatCurrency,
    getCurrencySymbol,
    formatPriceMessage,
    formatDateTime
  }
};
