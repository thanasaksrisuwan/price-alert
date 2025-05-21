/**
 * คอนโทรลเลอร์จัดการการแจ้งเตือนราคา
 * จัดการการตั้งค่า แสดงรายการ และลบการแจ้งเตือน
 */

const logger = require('../utils/logger').createModuleLogger('AlertController');
const AlertModel = require('../models/alert');
const UserModel = require('../models/user');
const PriceService = require('../services/priceService');
const { isValidCryptoSymbol, isValidNumber } = require('../utils/validators');

/**
 * จัดการคำสั่ง /alert <symbol> <condition> <value> - ตั้งค่าการแจ้งเตือน
 * @param {object} ctx - Telegraf context
 */
async function handleSetAlert(ctx) {
  try {
    // รับพารามิเตอร์จากข้อความ
    const params = ctx.message.text.split(' ').filter(Boolean);
    
    if (params.length < 4) {
      return ctx.reply(
        'รูปแบบคำสั่งไม่ถูกต้อง\n' +
        'การใช้งาน: /alert <symbol> <condition> <value>\n' +
        'ตัวอย่าง: /alert BTC above 50000 หรือ /alert ETH below 3000'
      );
    }
    
    const symbol = params[1].toUpperCase();
    const condition = params[2].toLowerCase();
    const targetValue = parseFloat(params[3]);
    
    // ตรวจสอบความถูกต้องของข้อมูล
    if (!isValidCryptoSymbol(symbol)) {
      return ctx.reply(`สัญลักษณ์เหรียญไม่ถูกต้อง: ${symbol}`);
    }
    
    if (!['above', 'below', 'percent_change'].includes(condition)) {
      return ctx.reply('เงื่อนไขต้องเป็น "above", "below" หรือ "percent_change" เท่านั้น');
    }
    
    if (!isValidNumber(targetValue)) {
      return ctx.reply('ค่าเป้าหมายต้องเป็นตัวเลขเท่านั้น');
    }
    
    // ดึงข้อมูลผู้ใช้
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // ดึงข้อมูลราคาปัจจุบัน
    const priceData = await PriceService.getPrice(symbol, user.default_currency);
    
    if (!priceData) {
      return ctx.reply(`ไม่พบข้อมูลราคาสำหรับ ${symbol}`);
    }
    
    // สร้างการแจ้งเตือนใหม่
    const alertType = `price_${condition}`;
    
    try {
      const alert = await AlertModel.createAlert({
        userId: user.id,
        symbol,
        alertType,
        targetValue,
        currentValue: priceData.price
      });
      
      // สร้างข้อความยืนยัน
      const direction = condition === 'above' ? 'สูงกว่า' : 'ต่ำกว่า';
      const confirmationMessage = `
✅ ตั้งการแจ้งเตือนสำเร็จ (ID: ${alert.id})

${symbol} ${direction} ${targetValue} ${user.default_currency}
ราคาปัจจุบัน: ${priceData.price.toFixed(2)} ${user.default_currency}

เมื่อเงื่อนไขเป็นจริง คุณจะได้รับการแจ้งเตือนทันที
`;
      
      await ctx.reply(confirmationMessage);
      logger.info(`Alert created: ${symbol} ${alertType} ${targetValue} by user ${user.id}`);
    } catch (error) {
      if (error.message.includes('maxFreeAlerts')) {
        await ctx.reply(
          '⚠️ คุณไม่สามารถสร้างการแจ้งเตือนเพิ่มได้\n' +
          'ผู้ใช้ฟรีสามารถตั้งการแจ้งเตือนได้สูงสุด 10 รายการ\n' +
          'อัพเกรดเป็นพรีเมียมเพื่อตั้งการแจ้งเตือนไม่จำกัด\n\n' +
          'พิมพ์ /premium เพื่อดูรายละเอียดการอัพเกรด'
        );
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error('Error in handleSetAlert:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /alerts - แสดงรายการแจ้งเตือนที่เปิดใช้งาน
 * @param {object} ctx - Telegraf context
 */
async function handleListAlerts(ctx) {
  try {
    // ดึงข้อมูลผู้ใช้
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // ดึงข้อมูลการแจ้งเตือน
    const alerts = await AlertModel.findActiveAlertsByUser(user.id);
    
    if (!alerts || alerts.length === 0) {
      return ctx.reply('คุณยังไม่มีการแจ้งเตือนที่ตั้งไว้\n\nใช้คำสั่ง /alert เพื่อตั้งการแจ้งเตือนใหม่');
    }
      // สร้างข้อความแสดงรายการการแจ้งเตือนแบบไม่ใช้ Markdown เพื่อป้องกัน parsing errors
    let message = '📊 รายการแจ้งเตือนที่เปิดใช้งาน 📊\n\n';
    
    for (const alert of alerts) {      const condition = alert.alert_type.includes('above') 
        ? 'สูงกว่า' 
        : alert.alert_type.includes('below') 
          ? 'ต่ำกว่า' 
          : 'เปลี่ยนแปลง';
      
      // Ensure consistent formatting and properly escape any special markdown characters
      const alertInfo = `ID: ${alert.id} - ${alert.symbol} ${condition} ${alert.target_value} ${user.default_currency}\n` +
                       `ราคาตั้งต้น: ${alert.current_value || 'N/A'} ${user.default_currency}\n` +
                       `ตั้งเมื่อ: ${new Date(alert.created_at).toLocaleString()}\n\n`;
      
      message += alertInfo;
    }
    
    message += `\nลบการแจ้งเตือน: /remove <alert_id>\nตัวอย่าง: /remove ${alerts[0].id}`;
      try {
      // Use regular reply instead of Markdown to avoid parsing issues with Thai characters
      await ctx.reply(message);
      logger.info(`Listed alerts for user ${user.id}`);
    } catch (telegramError) {
      logger.error('Error sending alerts message:', telegramError);
      
      // Fallback: Try sending without any formatting as a last resort
      try {
        const plainMessage = 'รายการแจ้งเตือนที่เปิดใช้งาน\n\n' + 
          alerts.map(alert => {
            const condition = alert.alert_type.includes('above') 
              ? 'สูงกว่า' 
              : alert.alert_type.includes('below') 
                ? 'ต่ำกว่า' 
                : 'เปลี่ยนแปลง';
            return `ID: ${alert.id} - ${alert.symbol} ${condition} ${alert.target_value} ${user.default_currency}\n` +
                  `ราคาตั้งต้น: ${alert.current_value || 'N/A'} ${user.default_currency}\n` +
                  `ตั้งเมื่อ: ${new Date(alert.created_at).toLocaleString()}\n`;
          }).join('\n') +
          `\nลบการแจ้งเตือน: /remove <alert_id>\nตัวอย่าง: /remove ${alerts[0].id}`;
        
        await ctx.reply(plainMessage);
      } catch (fallbackError) {
        logger.error('Even fallback message failed:', fallbackError);
        await ctx.reply('เกิดข้อผิดพลาดในการแสดงรายการแจ้งเตือน โปรดลองอีกครั้งในภายหลัง');
      }
    }
  } catch (error) {
    logger.error('Error in handleListAlerts:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /remove <alert_id> - ลบการแจ้งเตือน
 * @param {object} ctx - Telegraf context
 */
async function handleRemoveAlert(ctx) {
  try {
    // รับพารามิเตอร์จากข้อความ
    const params = ctx.message.text.split(' ').filter(Boolean);
    
    if (params.length < 2) {
      return ctx.reply('รูปแบบคำสั่งไม่ถูกต้อง\nการใช้งาน: /remove <alert_id>');
    }
    
    const alertId = parseInt(params[1]);
    
    if (isNaN(alertId)) {
      return ctx.reply('รหัสการแจ้งเตือนต้องเป็นตัวเลขเท่านั้น');
    }
    
    // ดึงข้อมูลผู้ใช้
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // ตรวจสอบว่าการแจ้งเตือนเป็นของผู้ใช้นี้หรือไม่
    const alert = await AlertModel.findAlertById(alertId);
    
    if (!alert) {
      return ctx.reply(`ไม่พบการแจ้งเตือนรหัส ${alertId}`);
    }
    
    if (alert.user_id !== user.id) {
      return ctx.reply('คุณไม่มีสิทธิ์ลบการแจ้งเตือนนี้');
    }
      // ลบการแจ้งเตือน
    await AlertModel.deleteAlert(alertId, user.id);
    
    await ctx.reply(`✅ ลบการแจ้งเตือนรหัส ${alertId} สำเร็จ`);
    logger.info(`Alert ${alertId} deleted by user ${user.id}`);
  } catch (error) {
    logger.error('Error in handleRemoveAlert:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

module.exports = {
  handleSetAlert,
  handleListAlerts,
  handleRemoveAlert
};
