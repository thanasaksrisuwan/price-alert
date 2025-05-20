/**
 * บริการจัดการการแจ้งเตือน
 * จัดการการตรวจสอบและแจ้งเตือนเมื่อเงื่อนไขการแจ้งเตือนเป็นจริง
 */

const logger = require('../utils/logger').createModuleLogger('AlertService');
const AlertModel = require('../models/alert');
const UserModel = require('../models/user');
const PriceService = require('./priceService');
const { Telegraf } = require('telegraf');
const config = require('../config');

// สร้าง instance ของ Telegram bot เพื่อส่งการแจ้งเตือน
const bot = new Telegraf(config.telegram.token);

/**
 * ตรวจสอบการแจ้งเตือนทั้งหมดที่มีการเปิดใช้งาน
 * ฟังก์ชั่นนี้จะถูกเรียกเป็นช่วงๆ เพื่อเช็คเงื่อนไขการแจ้งเตือน
 */
async function checkAllAlerts() {
  try {
    logger.debug('Starting alert check cycle');
    
    // ดึงการแจ้งเตือนทั้งหมดที่เปิดใช้งาน
    const activeAlerts = await AlertModel.findAllActiveAlerts();
    
    if (!activeAlerts || activeAlerts.length === 0) {
      logger.debug('No active alerts to check');
      return;
    }
    
    logger.info(`Checking ${activeAlerts.length} active alerts`);
    
    // จัดกลุ่มการแจ้งเตือนตามเหรียญเพื่อลดการเรียก API
    const alertsBySymbol = groupAlertsBySymbol(activeAlerts);
    
    // ตรวจสอบการแจ้งเตือนตามเหรียญ
    for (const [symbol, alerts] of Object.entries(alertsBySymbol)) {
      await checkAlertsForSymbol(symbol, alerts);
    }
    
    logger.debug('Completed alert check cycle');
  } catch (error) {
    logger.error('Error in checkAllAlerts:', error);
  }
}

/**
 * จัดกลุ่มการแจ้งเตือนตามเหรียญ
 * @param {Array} alerts - รายการการแจ้งเตือน
 * @returns {Object} - การแจ้งเตือนที่จัดกลุ่มตามเหรียญ
 */
function groupAlertsBySymbol(alerts) {
  const grouped = {};
  
  alerts.forEach(alert => {
    if (!grouped[alert.symbol]) {
      grouped[alert.symbol] = [];
    }
    grouped[alert.symbol].push(alert);
  });
  
  return grouped;
}

/**
 * ตรวจสอบการแจ้งเตือนสำหรับเหรียญที่กำหนด
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {Array} alerts - รายการการแจ้งเตือนของเหรียญนั้น
 */
async function checkAlertsForSymbol(symbol, alerts) {
  try {
    // ดึงข้อมูลราคาล่าสุด (ใช้ USD เป็นสกุลเงินหลัก)
    const priceData = await PriceService.getPrice(symbol, 'USD');
    
    if (!priceData) {
      logger.warn(`Could not get price data for ${symbol}`);
      return;
    }
    
    const currentPrice = priceData.price;
    logger.debug(`Current price for ${symbol}: ${currentPrice} USD`);
    
    // ตรวจสอบแต่ละการแจ้งเตือน
    for (const alert of alerts) {
      await checkSingleAlert(alert, currentPrice, priceData);
    }
  } catch (error) {
    logger.error(`Error checking alerts for ${symbol}:`, error);
  }
}

/**
 * ตรวจสอบการแจ้งเตือนเดี่ยว
 * @param {Object} alert - ข้อมูลการแจ้งเตือน
 * @param {number} currentPrice - ราคาปัจจุบัน
 * @param {Object} priceData - ข้อมูลราคาและการเปลี่ยนแปลง
 */
async function checkSingleAlert(alert, currentPrice, priceData) {
  try {
    // ดึงข้อมูลผู้ใช้เพื่อใช้ในการส่งการแจ้งเตือนและการตั้งค่า
    const user = await UserModel.getUserById(alert.user_id);
    
    if (!user) {
      logger.warn(`User not found for alert ID ${alert.id}`);
      return;
    }
    
    // ทำการแปลงราคาตามสกุลเงินที่ผู้ใช้ต้องการ (ถ้าไม่ใช่ USD)
    let displayPrice = currentPrice;
    let displayTargetValue = alert.target_value;
    
    if (user.default_currency !== 'USD') {
      // ในการใช้งานจริงควรแปลงราคาตามอัตราแลกเปลี่ยน
      // ตัวอย่างแบบง่ายๆ:
      displayPrice = currentPrice * getExchangeRate('USD', user.default_currency);
      displayTargetValue = alert.target_value * getExchangeRate('USD', user.default_currency);
    }
    
    // ตรวจสอบเงื่อนไขการแจ้งเตือน
    let isTriggered = false;
    let alertMessage = '';
    
    switch (alert.alert_type) {
      case 'price_above':
        if (currentPrice >= alert.target_value && (alert.current_value < alert.target_value || alert.current_value === null)) {
          isTriggered = true;
          alertMessage = `🚨 **การแจ้งเตือนราคา** 🚨\n\n${alert.symbol} ราคาสูงกว่า ${displayTargetValue} ${user.default_currency} แล้ว!\n\nราคาปัจจุบัน: ${displayPrice.toFixed(2)} ${user.default_currency}`;
        }
        break;
        
      case 'price_below':
        if (currentPrice <= alert.target_value && (alert.current_value > alert.target_value || alert.current_value === null)) {
          isTriggered = true;
          alertMessage = `🚨 **การแจ้งเตือนราคา** 🚨\n\n${alert.symbol} ราคาต่ำกว่า ${displayTargetValue} ${user.default_currency} แล้ว!\n\nราคาปัจจุบัน: ${displayPrice.toFixed(2)} ${user.default_currency}`;
        }
        break;
        
      case 'percent_change':
        const percentChange = priceData.priceChangePercentage24h;
        if (Math.abs(percentChange) >= alert.target_value) {
          isTriggered = true;
          const direction = percentChange >= 0 ? 'เพิ่มขึ้น' : 'ลดลง';
          alertMessage = `🚨 **การแจ้งเตือนการเปลี่ยนแปลงราคา** 🚨\n\n${alert.symbol} ราคา${direction} ${Math.abs(percentChange).toFixed(2)}% ในรอบ 24 ชั่วโมง!\n\nราคาปัจจุบัน: ${displayPrice.toFixed(2)} ${user.default_currency}`;
        }
        break;
    }
    
    // หากเงื่อนไขเป็นจริงให้ส่งการแจ้งเตือนและอัพเดตสถานะ
    if (isTriggered) {
      logger.info(`Alert triggered: ${alert.id} (${alert.symbol} ${alert.alert_type})`);
      
      // ส่งการแจ้งเตือนไปยังผู้ใช้
      await sendAlertNotification(user.telegram_id, alertMessage);
      
      // อัพเดตการแจ้งเตือนเป็นไม่ใช้งาน (เพราะได้แจ้งเตือนแล้ว)
      await AlertModel.markAlertAsTriggered(alert.id, currentPrice);
    }
  } catch (error) {
    logger.error(`Error checking alert ID ${alert.id}:`, error);
  }
}

/**
 * ส่งการแจ้งเตือนไปยังผู้ใช้ผ่าน Telegram
 * @param {number} telegramId - รหัส Telegram ของผู้ใช้
 * @param {string} message - ข้อความแจ้งเตือน
 */
async function sendAlertNotification(telegramId, message) {
  try {
    await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
    logger.debug(`Notification sent to user ${telegramId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send notification to ${telegramId}:`, error);
    return false;
  }
}

/**
 * ตัวอย่างฟังก์ชันอัตราแลกเปลี่ยนแบบง่าย (ในการใช้งานจริงควรดึงจาก API)
 * @param {string} from - สกุลเงินต้นทาง
 * @param {string} to - สกุลเงินปลายทาง
 * @returns {number} - อัตราแลกเปลี่ยน
 */
function getExchangeRate(from, to) {
  const rates = {
    'USD_THB': 31.5,
    'USD_EUR': 0.85,
    'USD_JPY': 110.5,
    'USD_GBP': 0.73
  };
  
  const key = `${from}_${to}`;
  
  if (rates[key]) {
    return rates[key];
  } else if (from === to) {
    return 1;
  } else {
    // ค่าเริ่มต้นถ้าไม่พบอัตราแลกเปลี่ยน
    logger.warn(`Exchange rate for ${key} not found, using 1`);
    return 1;
  }
}

/**
 * เริ่มต้นระบบการตรวจสอบการแจ้งเตือน
 */
function startAlertChecker() {
  const checkInterval = config.alerts.checkInterval || 60000; // ค่าเริ่มต้น 1 นาที
  
  logger.info(`Starting alert checker with interval: ${checkInterval}ms`);
  
  // เริ่มตรวจสอบตามช่วงเวลาที่กำหนด
  setInterval(checkAllAlerts, checkInterval);
  
  // ตรวจสอบครั้งแรกทันทีที่เริ่มต้น
  checkAllAlerts();
}

module.exports = {
  startAlertChecker,
  checkAllAlerts,
  sendAlertNotification
};
