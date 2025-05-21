/**
 * Manual test script for verifying Telegram bot commands
 * This file simulates the Telegraf context to test bot commands
 */

const fs = require('fs');
const UserController = require('./src/controllers/userController');
const PriceController = require('./src/controllers/priceController');
const AlertController = require('./src/controllers/alertController');
const PortfolioController = require('./src/controllers/portfolioController');
const NewsController = require('./src/controllers/newsController');

// Create logs directory if it doesn't exist
if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs');
}

// Create a log file for the test results
const logStream = fs.createWriteStream('./logs/bot-commands-test.log');

// Helper function to log results
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} - ${message}\n`;
  console.log(formattedMessage);
  logStream.write(formattedMessage);
}

// Mock Telegraf context
class MockContext {
  constructor(messageText, userId = 12345, username = 'testuser', firstName = 'Test User') {
    this.message = { text: messageText };
    this.from = {
      id: userId,
      username,
      first_name: firstName
    };
    this.chat = { id: userId };
    this.replies = [];
    this.markdownReplies = [];
    this.editedMessages = [];
  }

  async reply(message) {
    this.replies.push(message);
    log(`Reply: ${message}`);
    return { message_id: this.replies.length };
  }

  async replyWithMarkdown(message) {
    this.markdownReplies.push(message);
    log(`Markdown Reply: ${message}`);
    return { message_id: this.markdownReplies.length };
  }

  get telegram() {
    return {
      editMessageText: async (chatId, messageId, inlineId, text, extra) => {
        this.editedMessages.push({ chatId, messageId, text, extra });
        log(`Edited Message: ${text}`);
        return { message_id: messageId };
      },
      sendMessage: async (chatId, text, extra) => {
        log(`Send Message: ${text}`);
        return { message_id: this.replies.length + 1 };
      }
    };
  }
}

// Test runner
async function runTests() {
  try {
    log('STARTING BOT COMMAND TESTS');
    log('=======================');
    
    // Test /start command
    log('\nTesting /start command:');
    const startCtx = new MockContext('/start');
    await UserController.handleStart(startCtx);
    log('✅ /start command test completed');
    
    // Test /help command
    log('\nTesting /help command:');
    const helpCtx = new MockContext('/help');
    await UserController.handleHelp(helpCtx);
    log('✅ /help command test completed');
    
    // Test /price command with valid symbol
    log('\nTesting /price BTC command:');
    const priceCtx = new MockContext('/price BTC');
    await PriceController.handlePriceCommand(priceCtx);
    log('✅ /price BTC command test completed');
    
    // Test /price command with invalid symbol
    log('\nTesting /price invalidSymbol command:');
    const invalidPriceCtx = new MockContext('/price invalid$Symbol');
    await PriceController.handlePriceCommand(invalidPriceCtx);
    log('✅ /price invalidSymbol command test completed');
    
    // Test /alert command
    log('\nTesting /alert BTC above 50000 command:');
    const alertCtx = new MockContext('/alert BTC above 50000');
    await AlertController.handleSetAlert(alertCtx);
    log('✅ /alert command test completed');
    
    // Test /alerts command
    log('\nTesting /alerts command:');
    const alertsCtx = new MockContext('/alerts');
    await AlertController.handleListAlerts(alertsCtx);
    log('✅ /alerts command test completed');
    
    // Test /remove command
    log('\nTesting /remove 1 command:');
    const removeCtx = new MockContext('/remove 1');
    await AlertController.handleRemoveAlert(removeCtx);
    log('✅ /remove command test completed');
    
    // Test /portfolio command
    log('\nTesting /portfolio command:');
    const portfolioCtx = new MockContext('/portfolio');
    await PortfolioController.handleShowPortfolio(portfolioCtx);
    log('✅ /portfolio command test completed');
    
    // Test /add command
    log('\nTesting /add BTC 0.5 45000 command:');
    const addCtx = new MockContext('/add BTC 0.5 45000');
    await PortfolioController.handleAddToPortfolio(addCtx);
    log('✅ /add command test completed');
    
    // Test /news command
    log('\nTesting /news BTC command:');
    const newsCtx = new MockContext('/news BTC');
    await NewsController.handleGetNews(newsCtx);
    log('✅ /news command test completed');
    
    // Test /settings command
    log('\nTesting /settings command:');
    const settingsCtx = new MockContext('/settings');
    await UserController.handleSettings(settingsCtx);
    log('✅ /settings command test completed');
    
    // Test /currency command
    log('\nTesting /currency THB command:');
    const currencyCtx = new MockContext('/currency THB');
    await UserController.handleSetCurrency(currencyCtx);
    log('✅ /currency command test completed');
    
    // Test /currencies command
    log('\nTesting /currencies command:');
    const currenciesCtx = new MockContext('/currencies');
    await UserController.handleListCurrencies(currenciesCtx);
    log('✅ /currencies command test completed');

    log('\nALL TESTS COMPLETED SUCCESSFULLY');
  } catch (error) {
    log(`❌ ERROR: ${error.message}`);
    log(error.stack);
  } finally {
    logStream.end();
  }
}

// Run the tests
runTests()
  .then(() => {
    console.log('Tests completed. See logs/bot-commands-test.log for details.');
  })
  .catch(error => {
    console.error('Test run failed:', error);
  });
