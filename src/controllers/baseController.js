/**
 * Base Controller
 * 
 * This file provides common functionality for all controllers
 * following the Single Responsibility and DRY principles.
 */

const logger = require('../utils/logger').createModuleLogger('BaseController');
const UserModel = require('../models/user');

/**
 * Base controller class to provide common methods for controllers
 */
class BaseController {
  /**
   * Create a new instance of BaseController
   * @param {string} name - Name of the controller for logging
   */
  constructor(name) {
    this.logger = require('../utils/logger').createModuleLogger(name);
  }

  /**
   * Handles common errors in controllers
   * @param {Error} error - The error that occurred
   * @param {object} ctx - Telegraf context
   * @param {string} methodName - Name of the method where error occurred
   */
  handleError(error, ctx, methodName) {
    this.logger.error(`Error in ${methodName}:`, error);
    ctx.reply('เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง');
  }

  /**
   * Gets a user by their Telegram ID with validation
   * @param {object} ctx - Telegraf context
   * @returns {Promise<object|null>} User object or null if validation fails
   */
  async getUserWithValidation(ctx) {
    try {
      const telegramId = ctx.from.id;
      const user = await UserModel.findUserByTelegramId(telegramId);
      
      if (!user) {
        await ctx.reply('โปรดเริ่มต้นใช้งานบอทด้วยคำสั่ง /start');
        return null;
      }
      
      return user;
    } catch (error) {
      this.handleError(error, ctx, 'getUserWithValidation');
      return null;
    }
  }

  /**
   * Extracts and validates command parameters
   * @param {object} ctx - Telegraf context
   * @param {number} minParams - Minimum number of parameters required
   * @param {string} usage - Usage message to display if validation fails
   * @returns {Array|null} Array of parameters or null if validation fails
   */
  getCommandParams(ctx, minParams, usage) {
    try {
      const params = ctx.message.text.split(' ').filter(Boolean);
      
      if (params.length < minParams) {
        ctx.reply(usage);
        return null;
      }
      
      return params;
    } catch (error) {
      this.handleError(error, ctx, 'getCommandParams');
      return null;
    }
  }

  /**
   * Sends a message with loading status and returns the message for later updating
   * @param {object} ctx - Telegraf context
   * @param {string} loadingMessage - Loading message to display
   * @returns {Promise<object>} Message object for updating later
   */
  async sendLoadingMessage(ctx, loadingMessage) {
    try {
      return await ctx.reply(loadingMessage);
    } catch (error) {
      this.handleError(error, ctx, 'sendLoadingMessage');
      return null;
    }
  }

  /**
   * Updates a loading message with final content
   * @param {object} ctx - Telegraf context
   * @param {object} loadingMessage - Loading message to update
   * @param {string} finalMessage - Final message content
   * @param {object} options - Additional options for the message
   * @returns {Promise<boolean>} Success status
   */
  async updateLoadingMessage(ctx, loadingMessage, finalMessage, options = { parse_mode: 'Markdown' }) {
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        null,
        finalMessage,
        options
      );
      return true;
    } catch (error) {
      this.logger.error('Error updating loading message:', error);
      
      // Try sending as a new message if updating fails
      try {
        await ctx.reply(finalMessage, options);
        return true;
      } catch (secondError) {
        this.handleError(secondError, ctx, 'updateLoadingMessage');
        return false;
      }
    }
  }
}

module.exports = BaseController;
