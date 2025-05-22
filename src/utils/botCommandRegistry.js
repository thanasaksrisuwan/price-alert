/**
 * Bot Command Registry
 * 
 * Module for registering bot commands in a modular and organized way.
 * This follows the Open/Closed principle by being open for extension.
 */

class BotCommandRegistry {
  /**
   * Create a new command registry
   */
  constructor() {
    this.commandGroups = [];
    this.middlewares = [];
    this.errorHandlers = [];
    this.messageHandlers = [];
  }

  /**
   * Add a middleware to the bot
   * @param {Function} middleware - Middleware function to add
   * @returns {BotCommandRegistry} This registry for chaining
   */
  addMiddleware(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Add an error handler to the bot
   * @param {Function} errorHandler - Error handler function to add
   * @returns {BotCommandRegistry} This registry for chaining
   */
  addErrorHandler(errorHandler) {
    this.errorHandlers.push(errorHandler);
    return this;
  }

  /**
   * Add a command group to the registry
   * @param {string} name - Name of the command group
   * @param {Array<{command: string, handler: Function}>} commands - Commands in this group
   * @returns {BotCommandRegistry} This registry for chaining
   */
  addCommandGroup(name, commands) {
    this.commandGroups.push({
      name,
      commands
    });
    return this;
  }

  /**
   * Add a message handler for text messages
   * @param {Function} handler - Handler for text messages
   * @returns {BotCommandRegistry} This registry for chaining
   */
  addMessageHandler(handler) {
    this.messageHandlers.push(handler);
    return this;
  }

  /**
   * Register all commands and middlewares with a bot
   * @param {object} bot - Telegraf bot instance
   */
  registerWith(bot) {
    // Register middlewares
    this.middlewares.forEach(middleware => {
      bot.use(middleware);
    });
    
    // Register error handlers
    this.errorHandlers.forEach(errorHandler => {
      bot.catch(errorHandler);
    });
    
    // Register command groups
    this.commandGroups.forEach(group => {
      group.commands.forEach(command => {
        if (command.command === 'start') {
          bot.start(command.handler);
        } else if (command.command === 'help') {
          bot.help(command.handler);
        } else {
          bot.command(command.command, command.handler);
        }
      });
    });
    
    // Register message handlers
    this.messageHandlers.forEach(handler => {
      bot.on('text', handler);
    });
  }
}

module.exports = BotCommandRegistry;
