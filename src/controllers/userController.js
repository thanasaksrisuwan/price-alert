/**
 * คอนโทรลเลอร์จัดการผู้ใช้
 * จัดการเกี่ยวกับข้อมูลผู้ใช้และการโต้ตอบกับผู้ใช้
 */

const UserModel = require('../models/user');
const logger = require('../utils/logger').createModuleLogger('UserController');

// สกุลเงินที่รองรับ
const SUPPORTED_CURRENCIES = {
  USD: { name: 'ดอลลาร์สหรัฐ', symbol: '$' },
  EUR: { name: 'ยูโร', symbol: '€' },
  GBP: { name: 'ปอนด์สเตอร์ลิง', symbol: '£' },
  JPY: { name: 'เยนญี่ปุ่น', symbol: '¥' },
  THB: { name: 'บาทไทย', symbol: '฿' },
  BTC: { name: 'บิตคอยน์', symbol: '₿' }
};

/**
 * จัดการคำสั่ง /start - เริ่มต้นการใช้งาน bot
 * @param {object} ctx - Telegraf context
 */
async function handleStart(ctx) {
  try {
    const { id: telegramId, username, first_name: firstName } = ctx.from;
    
    // บันทึกหรืออัพเดตข้อมูลผู้ใช้
    await UserModel.createUser({
      telegramId,
      username,
      firstName
    });
    
    // สร้างข้อความต้อนรับ
    const welcomeMessage = `
สวัสดีคุณ ${firstName || username || 'คุณ'}! 🎉

ยินดีต้อนรับสู่ Crypto Price Alert Bot 🤖
บอทนี้จะช่วยให้คุณติดตามราคาและรับการแจ้งเตือนสำหรับสกุลเงินคริปโตที่คุณสนใจ

คำสั่งพื้นฐาน:
/price <symbol> - ดูราคาปัจจุบัน เช่น /price BTC
/alert <symbol> <condition> <value> - ตั้งการแจ้งเตือน
/portfolio - ดูพอร์ตการลงทุนของคุณ
/help - แสดงคำสั่งทั้งหมด

เริ่มต้นใช้งานง่ายๆ ด้วยการพิมพ์ /price BTC เพื่อดูราคา Bitcoin ปัจจุบัน
`;
    
    // ส่งข้อความต้อนรับ
    await ctx.reply(welcomeMessage);
    
    logger.info(`New user registered: ${telegramId}, ${username}`);
  } catch (error) {
    logger.error('Error in handleStart:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /help - แสดงข้อมูลความช่วยเหลือ
 * @param {object} ctx - Telegraf context
 */
async function handleHelp(ctx) {
  try {
    const helpMessage = `
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
    
    // ส่งข้อความช่วยเหลือในรูปแบบ Markdown
    await ctx.replyWithMarkdown(helpMessage);
  } catch (error) {
    logger.error('Error in handleHelp:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /settings - ตั้งค่าส่วนตัว
 * @param {object} ctx - Telegraf context
 */
async function handleSettings(ctx) {
  try {
    const { id: telegramId } = ctx.from;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    // แสดงการตั้งค่าปัจจุบัน
    const settingsMessage = `
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
    
    // สร้าง inline keyboard สำหรับการตั้งค่า
    await ctx.replyWithMarkdown(settingsMessage);
  } catch (error) {
    logger.error('Error in handleSettings:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /premium - อัพเกรดเป็นผู้ใช้พรีเมียม
 * @param {object} ctx - Telegraf context
 */
async function handlePremium(ctx) {
  try {
    const { id: telegramId } = ctx.from;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }
    
    if (user.premium) {
      return ctx.reply('คุณเป็นสมาชิกพรีเมียมอยู่แล้ว ✨');
    }
    
    // ในการใช้งานจริงจะเชื่อมต่อกับระบบชำระเงิน
    // สำหรับตัวอย่างนี้จะแสดงข้อความเกี่ยวกับการอัพเกรด
    const premiumMessage = `
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
    logger.error('Error in handlePremium:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /currency - ตั้งค่าสกุลเงินเริ่มต้น
 * @param {object} ctx - Telegraf context
 */
async function handleSetCurrency(ctx) {
  try {
    const { id: telegramId } = ctx.from;
    const user = await UserModel.findUserByTelegramId(telegramId);
    
    if (!user) {
      return ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
    }

    // แยกคำสั่งและรหัสสกุลเงิน
    const parts = ctx.message.text.split(' ');
    if (parts.length !== 2) {
      return ctx.reply('รูปแบบคำสั่งไม่ถูกต้อง โปรดใช้รูปแบบ /currency <code> เช่น /currency THB');
    }

    const currencyCode = parts[1].toUpperCase();
    
    // ตรวจสอบว่าเป็นสกุลเงินที่รองรับหรือไม่
    if (!SUPPORTED_CURRENCIES[currencyCode]) {
      return ctx.reply(`รหัสสกุลเงินไม่ถูกต้อง โปรดใช้รหัสที่รองรับ เช่น USD, EUR, THB\nดูรายการสกุลเงินที่รองรับได้ด้วยคำสั่ง /currencies`);
    }
    
    // บันทึกการตั้งค่าสกุลเงินใหม่
    await UserModel.updateUserCurrency(telegramId, currencyCode);
    
    const { name, symbol } = SUPPORTED_CURRENCIES[currencyCode];
    const successMessage = `✅ ตั้งค่าสกุลเงินเป็น ${currencyCode} (${name} ${symbol}) สำเร็จแล้ว`;
    
    ctx.reply(successMessage);
    
    logger.info(`User ${telegramId} set currency to ${currencyCode}`);
  } catch (error) {
    logger.error('Error in handleSetCurrency:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดการคำสั่ง /currencies - แสดงรายการสกุลเงินที่รองรับ
 * @param {object} ctx - Telegraf context
 */
async function handleListCurrencies(ctx) {
  try {
    let message = '*สกุลเงินที่รองรับ* 💲\n\n';
    
    for (const [code, { name, symbol }] of Object.entries(SUPPORTED_CURRENCIES)) {
      message += `• ${code} - ${name} (${symbol})\n`;
    }
    
    message += '\nสามารถตั้งค่าสกุลเงินเริ่มต้นด้วยคำสั่ง /currency <code>';
    
    await ctx.replyWithMarkdown(message);
  } catch (error) {
    logger.error('Error in handleListCurrencies:', error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }
}

module.exports = {
  handleStart,
  handleHelp,
  handleSettings,
  handlePremium,
  handleSetCurrency,
  handleListCurrencies
};
