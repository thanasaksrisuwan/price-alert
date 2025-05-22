/**
 * คอนโทรลเลอร์จัดการพอร์ตโฟลิโอ
 * จัดการการเพิ่ม แสดง และจัดการพอร์ตโฟลิโอ
 */

const BaseController = require('./baseController');
const PortfolioModel = require('../models/portfolio');
const UserModel = require('../models/user');
const PriceService = require('../services/priceService');
const { isValidCryptoSymbol, isValidNumber } = require('../utils/validators');
const { formatMoneyValue, getCurrencySymbol } = require('../utils/currencyUtils');

/**
 * PortfolioController class implementing SOLID principles
 * Extends BaseController to leverage common functionality
 */
class PortfolioController extends BaseController {
  /**
   * Create a new PortfolioController instance
   */
  constructor() {
    super('PortfolioController');
  }
  
  /**
   * จัดการคำสั่ง /portfolio - แสดงพอร์ตโฟลิโอ
   * @param {object} ctx - Telegraf context
   */
  async handleShowPortfolio(ctx) {
    try {
      // Get user with validation
      const user = await this.getUserWithValidation(ctx);
      if (!user) return;
      
      // Load portfolio items
      const portfolioItems = await PortfolioModel.getPortfolioByUser(user.id);
      
      if (!portfolioItems || portfolioItems.length === 0) {
        return ctx.reply(
          'คุณยังไม่มีเหรียญในพอร์ตโฟลิโอ\n\n' +
          'เพิ่มเหรียญด้วยคำสั่ง /add <symbol> <quantity> <buy_price>\n' +
          'ตัวอย่าง: /add BTC 0.5 45000'
        );
      }
      
      // Show loading message
      const loadingMessage = await this.sendLoadingMessage(ctx, '⏳ กำลังโหลดข้อมูลพอร์ตโฟลิโอของคุณ...');
      if (!loadingMessage) return;
      
      // Get current price data for each coin
      const portfolioData = await this._getEnrichedPortfolioData(portfolioItems, user.default_currency);
      
      // Calculate totals
      const totals = this._calculatePortfolioTotals(portfolioData);
      
      // Format portfolio message
      const message = this._formatPortfolioMessage(
        portfolioData,
        user.default_currency,
        totals.totalValue,
        totals.totalInvestment,
        totals.totalProfitLoss,
        totals.totalProfitLossPercentage
      );
      
      // Update the loading message with portfolio data
      await this.updateLoadingMessage(ctx, loadingMessage, message);
      
      this.logger.info(`Portfolio viewed by user ${user.id}`);
    } catch (error) {
      this.handleError(error, ctx, 'handleShowPortfolio');
    }
  }
  
  /**
   * จัดการคำสั่ง /add <symbol> <quantity> <buy_price> - เพิ่มเหรียญในพอร์ตโฟลิโอ
   * @param {object} ctx - Telegraf context
   */
  async handleAddToPortfolio(ctx) {
    try {
      // Get and validate command parameters
      const params = this.getCommandParams(
        ctx, 
        4, 
        'รูปแบบคำสั่งไม่ถูกต้อง\n' +
        'การใช้งาน: /add <symbol> <quantity> <buy_price>\n' +
        'ตัวอย่าง: /add BTC 0.5 45000'
      );
      if (!params) return;
      
      // Parse parameters
      const symbol = params[1].toUpperCase();
      const quantity = parseFloat(params[2]);
      const buyPrice = parseFloat(params[3]);
      
      // Validate input values
      if (!this._validatePortfolioInput(ctx, symbol, quantity, buyPrice)) return;
      
      // Get user with validation
      const user = await this.getUserWithValidation(ctx);
      if (!user) return;
      
      // Validate the coin exists
      const priceData = await PriceService.getPrice(symbol, user.default_currency);
      if (!priceData) {
        return ctx.reply(`ไม่พบข้อมูลของเหรียญ ${symbol} โปรดตรวจสอบรหัสเหรียญอีกครั้ง`);
      }
      
      // Add or update portfolio
      const result = await this._addOrUpdateCoin(ctx, user, symbol, quantity, buyPrice);
      
      this.logger.info(`Portfolio updated for user ${user.id}: added/updated ${symbol}`);
      return result;
    } catch (error) {
      this.handleError(error, ctx, 'handleAddToPortfolio');
    }
  }
  
  /**
   * Validates the input values for adding to portfolio
   * @param {object} ctx - Telegraf context
   * @param {string} symbol - Coin symbol
   * @param {number} quantity - Coin quantity
   * @param {number} buyPrice - Buy price
   * @returns {boolean} Validation result
   * @private
   */
  _validatePortfolioInput(ctx, symbol, quantity, buyPrice) {
    if (!isValidCryptoSymbol(symbol)) {
      ctx.reply(`สัญลักษณ์เหรียญไม่ถูกต้อง: ${symbol}`);
      return false;
    }
    
    if (!isValidNumber(quantity) || quantity <= 0) {
      ctx.reply('จำนวนต้องเป็นตัวเลขที่มีค่ามากกว่า 0');
      return false;
    }
    
    if (!isValidNumber(buyPrice) || buyPrice <= 0) {
      ctx.reply('ราคาซื้อต้องเป็นตัวเลขที่มีค่ามากกว่า 0');
      return false;
    }
    
    return true;
  }
  
  /**
   * Adds or updates a coin in the portfolio
   * @param {object} ctx - Telegraf context
   * @param {object} user - User object
   * @param {string} symbol - Coin symbol
   * @param {number} quantity - Coin quantity
   * @param {number} buyPrice - Buy price
   * @returns {Promise<void>}
   * @private
   */
  async _addOrUpdateCoin(ctx, user, symbol, quantity, buyPrice) {
    const existingItem = await PortfolioModel.getPortfolioItemBySymbol(user.id, symbol);
    
    if (existingItem) {
      return this._updateExistingCoin(ctx, user, existingItem, symbol, quantity, buyPrice);
    } else {
      return this._addNewCoin(ctx, user, symbol, quantity, buyPrice);
    }
  }
  
  /**
   * Updates an existing coin in the portfolio
   * @param {object} ctx - Telegraf context
   * @param {object} user - User object
   * @param {object} existingItem - Existing portfolio item
   * @param {string} symbol - Coin symbol
   * @param {number} quantity - Coin quantity to add
   * @param {number} buyPrice - Buy price
   * @returns {Promise<void>}
   * @private
   */
  async _updateExistingCoin(ctx, user, existingItem, symbol, quantity, buyPrice) {
    // Calculate new quantity and average price
    const newQuantity = existingItem.quantity + quantity;
    const newTotalCost = (existingItem.quantity * existingItem.buy_price) + (quantity * buyPrice);
    const newAvgPrice = newTotalCost / newQuantity;
    
    // Update portfolio item
    await PortfolioModel.addOrUpdatePortfolioItem({
      userId: user.id,
      symbol,
      quantity: newQuantity,
      buyPrice: newAvgPrice
    });
    
    // Send confirmation
    await ctx.reply(
      `✅ อัพเดตเหรียญ ${symbol} ในพอร์ตโฟลิโอสำเร็จ\n\n` +
      `จำนวนรวมใหม่: ${newQuantity}\n` +
      `ราคาซื้อเฉลี่ย: ${newAvgPrice.toFixed(2)} ${user.default_currency}\n\n` +
      `ดูพอร์ตโฟลิโอทั้งหมด: /portfolio`
    );
  }
  
  /**
   * Adds a new coin to the portfolio
   * @param {object} ctx - Telegraf context
   * @param {object} user - User object
   * @param {string} symbol - Coin symbol
   * @param {number} quantity - Coin quantity
   * @param {number} buyPrice - Buy price
   * @returns {Promise<void>}
   * @private
   */
  async _addNewCoin(ctx, user, symbol, quantity, buyPrice) {
    // Add new portfolio item
    await PortfolioModel.addOrUpdatePortfolioItem({
      userId: user.id,
      symbol,
      quantity,
      buyPrice
    });
    
    // Send confirmation
    await ctx.reply(
      `✅ เพิ่มเหรียญ ${symbol} ในพอร์ตโฟลิโอสำเร็จ\n\n` +
      `จำนวน: ${quantity}\n` +
      `ราคาซื้อ: ${buyPrice} ${user.default_currency}\n\n` +
      `ดูพอร์ตโฟลิโอทั้งหมด: /portfolio`
    );
  }
  
  /**
   * Enriches portfolio data with current price information
   * @param {Array} portfolioItems - Portfolio items from database
   * @param {string} currency - User's default currency
   * @returns {Promise<Array>} Enriched portfolio data
   * @private
   */
  async _getEnrichedPortfolioData(portfolioItems, currency) {
    return Promise.all(
      portfolioItems.map(async (item) => {
        const priceData = await PriceService.getPrice(item.symbol, currency);
        
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
  }
  
  /**
   * Calculates portfolio totals
   * @param {Array} portfolioData - Enriched portfolio data
   * @returns {Object} Portfolio totals
   * @private
   */
  _calculatePortfolioTotals(portfolioData) {
    const totalValue = portfolioData.reduce((sum, item) => sum + item.currentValue, 0);
    const totalInvestment = portfolioData.reduce((sum, item) => sum + (item.buy_price * item.quantity), 0);
    const totalProfitLoss = totalValue - totalInvestment;
    const totalProfitLossPercentage = (totalProfitLoss / totalInvestment) * 100;
    
    return {
      totalValue,
      totalInvestment,
      totalProfitLoss,
      totalProfitLossPercentage
    };
  }
  
  /**
   * Formats portfolio message
   * @param {Array} portfolioData - Enriched portfolio data
   * @param {string} currency - User's currency
   * @param {number} totalValue - Total portfolio value
   * @param {number} totalInvestment - Total investment
   * @param {number} totalProfitLoss - Total profit/loss
   * @param {number} totalProfitLossPercentage - Total profit/loss percentage
   * @returns {string} Formatted message
   * @private
   */
  _formatPortfolioMessage(portfolioData, currency, totalValue, totalInvestment, totalProfitLoss, totalProfitLossPercentage) {
    const currencySymbol = getCurrencySymbol(currency);
    const isProfitable = totalProfitLoss >= 0;
    const profitIndicator = isProfitable ? '📈' : '📉';
    
    // Header section
    let message = `💼 *พอร์ตโฟลิโอของคุณ* 💼\n\n`;
    
    // Summary section
    message += `*มูลค่ารวม:* ${formatMoneyValue(totalValue, currency, currencySymbol)}\n`;
    message += `*เงินลงทุน:* ${formatMoneyValue(totalInvestment, currency, currencySymbol)}\n`;
    message += `*กำไร/ขาดทุน:* ${profitIndicator} ${totalProfitLoss >= 0 ? '+' : ''}${formatMoneyValue(totalProfitLoss, currency, currencySymbol)} (${totalProfitLossPercentage.toFixed(2)}%)\n\n`;
    
    message += `*รายละเอียดเหรียญ:*\n`;
    
    // Coins section
    portfolioData.forEach((item, index) => {
      const itemProfitIndicator = item.profitLoss >= 0 ? '🟢' : '🔴';
      
      message += `\n${itemProfitIndicator} *${item.symbol}*\n`;
      message += `จำนวน: ${item.quantity}\n`;
      
      if (item.priceAvailable) {
        message += `ราคาปัจจุบัน: ${formatMoneyValue(item.currentPrice, currency, currencySymbol)}\n`;
        message += `มูลค่า: ${formatMoneyValue(item.currentValue, currency, currencySymbol)}\n`;
        message += `ราคาซื้อ: ${formatMoneyValue(item.buy_price, currency, currencySymbol)}\n`;
        message += `กำไร/ขาดทุน: ${item.profitLoss >= 0 ? '+' : ''}${formatMoneyValue(item.profitLoss, currency, currencySymbol)} (${item.profitLossPercentage.toFixed(2)}%)\n`;
      } else {
        message += `ราคาปัจจุบัน: ไม่สามารถดึงข้อมูลได้\n`;
        message += `ราคาซื้อ: ${formatMoneyValue(item.buy_price, currency, currencySymbol)}\n`;
      }
    });
    
    // Footer section
    message += `\n\nเพิ่มเหรียญ: /add <symbol> <quantity> <buy_price>`;
    
    return message;
  }
}

// Create an instance
const portfolioController = new PortfolioController();

module.exports = {
  handleShowPortfolio: portfolioController.handleShowPortfolio.bind(portfolioController),
  handleAddToPortfolio: portfolioController.handleAddToPortfolio.bind(portfolioController),
  // Export for testing
  __testExports: {
    formatPortfolioMessage: portfolioController._formatPortfolioMessage.bind(portfolioController),
    getCurrencySymbol
  }
};
