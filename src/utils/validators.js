/**
 * ฟังก์ชันช่วยเหลือสำหรับการตรวจสอบข้อมูลนำเข้า
 * ใช้สำหรับตรวจสอบความถูกต้องของข้อมูลและป้องกันการโจมตี
 */

/**
 * ตรวจสอบว่าสตริงไม่ว่างเปล่า
 * @param {string} str - สตริงที่ต้องการตรวจสอบ
 * @returns {boolean} - true ถ้าไม่ว่างเปล่า, false ถ้าว่างเปล่าหรือไม่ใช่สตริง
 */
function isNonEmptyString(str) {
  return typeof str === 'string' && str.trim().length > 0;
}

/**
 * ตรวจสอบว่าเป็นตัวเลขที่ถูกต้อง
 * @param {any} value - ค่าที่ต้องการตรวจสอบ
 * @returns {boolean} - true ถ้าเป็นตัวเลขที่ถูกต้อง
 */
function isValidNumber(value) {
  if (typeof value === 'number' && !isNaN(value)) {
    return true;
  }
  
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return !isNaN(num);
  }
  
  return false;
}

/**
 * ตรวจสอบสัญลักษณ์เหรียญคริปโตว่าถูกต้อง
 * @param {string} symbol - สัญลักษณ์ที่ต้องการตรวจสอบ
 * @returns {boolean} - true ถ้าเป็นสัญลักษณ์ที่ถูกต้อง
 */
function isValidCryptoSymbol(symbol) {
  // ตรวจสอบว่าเป็นสตริงและตรงตามรูปแบบที่คาดหวัง (ตัวอักษรและตัวเลขเท่านั้น)
  return typeof symbol === 'string' && /^[A-Za-z0-9]+$/.test(symbol);
}

/**
 * ตรวจสอบและทำความสะอาดข้อความ input เพื่อป้องกัน SQL Injection
 * @param {string} input - ข้อความที่ต้องการตรวจสอบ
 * @returns {string} - ข้อความที่ทำความสะอาดแล้ว
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  // ลบอักขระพิเศษที่อาจใช้ใน SQL Injection
  return input
    .replace(/'/g, "''")
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
}

/**
 * ตรวจสอบว่าค่าอยู่ในช่วงที่กำหนด
 * @param {number} value - ค่าที่ต้องการตรวจสอบ
 * @param {number} min - ค่าต่ำสุดที่ยอมรับได้
 * @param {number} max - ค่าสูงสุดที่ยอมรับได้
 * @returns {boolean} - true ถ้าค่าอยู่ในช่วงที่กำหนด
 */
function isInRange(value, min, max) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * ตรวจสอบว่าข้อมูลเป็น JSON ที่ถูกต้องหรือไม่
 * @param {string} jsonString - สตริง JSON ที่ต้องการตรวจสอบ
 * @returns {boolean} - true ถ้าเป็น JSON ที่ถูกต้อง
 */
function isValidJson(jsonString) {
  try {
    if (typeof jsonString !== 'string') {
      return false;
    }
    JSON.parse(jsonString);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  isNonEmptyString,
  isValidNumber,
  isValidCryptoSymbol,
  sanitizeInput,
  isInRange,
  isValidJson,
};
