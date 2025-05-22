/**
 * Currency Utility Module
 * 
 * Single responsibility module for handling currency-related operations
 * Follows the SOLID principles by focusing on a single task
 */

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
 * Gets the supported currencies object
 * @returns {Object} Map of supported currencies
 */
function getSupportedCurrencies() {
  return SUPPORTED_CURRENCIES;
}

/**
 * Gets the symbol for a currency code
 * @param {string} currency - Currency code
 * @returns {string} Currency symbol
 */
function getCurrencySymbol(currency) {
  return SUPPORTED_CURRENCIES[currency]?.symbol || `${currency} `;
}

/**
 * Formats a money value with appropriate currency symbol
 * @param {number} value - The value to format
 * @param {string} currency - Currency code
 * @param {boolean} compactFormat - Whether to use compact format for large numbers
 * @returns {string} Formatted money value
 */
function formatCurrency(value, currency, compactFormat = false) {
  // Handle null or undefined values
  if (value === null || value === undefined) {
    value = 0;
  }
  
  const currencySymbol = getCurrencySymbol(currency);
  
  // Format options
  const options = {
    notation: compactFormat && Math.abs(value) >= 1000000 ? 'compact' : 'standard',
    minimumFractionDigits: currency === 'BTC' ? 8 : 2,
    maximumFractionDigits: currency === 'BTC' ? 8 : 2
  };
  
  // Format the value
  const formattedValue = value.toLocaleString(currency === 'THB' ? 'th-TH' : undefined, options);
  
  // For Thai Baht, symbol comes after the number
  if (currency === 'THB') {
    return `${formattedValue} ${currencySymbol}`;
  }
  
  // For all other currencies, symbol comes before the number
  return `${currencySymbol}${formattedValue}`;
}

/**
 * Formats a money value with appropriate currency symbol for display in messages
 * @param {number} value - The value to format
 * @param {string} currency - Currency code
 * @param {string} [currencySymbol] - Optional currency symbol (will be retrieved if not provided)
 * @returns {string} Formatted money value
 */
function formatMoneyValue(value, currency, currencySymbol) {
  if (!currencySymbol) {
    currencySymbol = getCurrencySymbol(currency);
  }
  
  // Use the same formatting pattern that was used in portfolioController 
  const formattedValue = value.toLocaleString(currency === 'THB' ? 'th-TH' : undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // สำหรับสกุลเงินบาท แสดงสัญลักษณ์หลังตัวเลข
  if (currency === 'THB') {
    return `${formattedValue} ${currencySymbol}`;
  }
  
  // สำหรับสกุลเงินอื่นๆ แสดงสัญลักษณ์หน้าตัวเลข
  return `${currencySymbol}${formattedValue}`;
}

module.exports = {
  getSupportedCurrencies,
  getCurrencySymbol,
  formatCurrency,
  formatMoneyValue
};
