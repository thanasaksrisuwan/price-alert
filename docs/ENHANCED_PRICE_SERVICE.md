# การปรับปรุงระบบดึงข้อมูล Market Cap

## ภาพรวม

เนื่องจาก Binance API ไม่ได้ให้ข้อมูล Market Cap มาด้วย แต่เราต้องการแสดงข้อมูลนี้ให้ผู้ใช้ ทางทีมพัฒนาจึงได้เพิ่ม service ใหม่ ชื่อ `EnhancedPriceService` เพื่อเติมเต็มข้อมูลที่หายไป

## ตัวอย่างผลลัพธ์

ก่อนปรับปรุง:
```
🟢 BTC (BTC) 🟢

💰 ราคา: 3,350,782.26 ฿
📈 เปลี่ยนแปลง (24ชม): +1.04% (34,462.58 ฿)
〽️ สูงสุด/ต่ำสุด (24ชม): 3,401,529.08 ฿ / 3,281,818.68 ฿
💹 มูลค่าตลาด: 0.00000000 ฿
📊 ปริมาณซื้อขาย (24ชม): 79.52B ฿
```

หลังปรับปรุง:
```
🟢 WLD (WLD) 🟢

💰 ราคา: 34.87 ฿
📈 เปลี่ยนแปลง (24ชม): +0.00% (0.00000000 ฿)
〽️ สูงสุด/ต่ำสุด (24ชม): 36.07 ฿ / 33.45 ฿
💹 มูลค่าตลาด: 54.96B ฿
📊 ปริมาณซื้อขาย (24ชม): 1.19B ฿
```

## การทำงานของ EnhancedPriceService

1. เมื่อเรียกใช้ `enhancePriceData()` จะรับข้อมูลราคา, สัญลักษณ์เหรียญ และสกุลเงิน
2. ตรวจสอบว่ามีข้อมูล marketCap แล้วหรือไม่ (> 0)
   - ถ้ามีแล้ว ส่งคืนข้อมูลเดิมทันที
3. ตรวจสอบใน Redis Cache ด้วย key `marketcap:${symbol}:${currency}`
   - ถ้ามีใน cache ใช้ค่านั้น
4. ถ้าไม่มีใน cache ลองดึงจาก CoinGecko เพื่อเอาเฉพาะ market cap
   - ถ้าได้ข้อมูล เก็บใน cache และส่งคืน
5. ถ้า CoinGecko ไม่ทำงาน ลองใช้ CoinMarketCap
   - ถ้าได้ข้อมูล เก็บใน cache และส่งคืน
6. ถ้าทั้งหมดล้มเหลว ส่งคืนข้อมูลเดิม (marketCap = 0)

## ข้อดี

1. ไม่กระทบระบบเดิม - ยังคงใช้ "Binance First" approach สำหรับข้อมูลราคา
2. เพิ่มเฉพาะข้อมูลที่ขาดหาย - ไม่ได้แก้ไขหรือเปลี่ยนแปลงข้อมูลที่มีอยู่แล้ว
3. มีการ cache ข้อมูล - ไม่ต้องเรียก API บ่อยเกินไป
4. ความเสียหายต่ำ - หากไม่สามารถดึง market cap ได้ ข้อมูลอื่นๆ ยังคงแสดงได้ปกติ

## การนำไปใช้

ใช้งานโดยเรียกผ่าน controller:
```javascript
// ดึงข้อมูลราคาปกติ
let priceData = await PriceService.getPrice(symbol, currency);

// เสริมข้อมูล market cap
priceData = await EnhancedPriceService.enhancePriceData(priceData, symbol, currency);
```

## โครงสร้างโค้ดที่ใช้

ไฟล์ `src/services/enhancedPriceService.js`:
```javascript
async function enhancePriceData(priceData, symbol, currency) {
  try {
    // ถ้ามี market cap อยู่แล้วและไม่ใช่ 0 ไม่ต้องทำอะไร
    if (priceData.marketCap && priceData.marketCap > 0) {
      return priceData;
    }

    // ตรวจสอบ cache ก่อน
    const cacheKey = `marketcap:${symbol}:${currency}`;
    const cachedMarketCap = await redis.get(cacheKey);

    if (cachedMarketCap) {
      logger.debug(`Retrieved market cap for ${symbol} from cache: ${cachedMarketCap}`);
      priceData.marketCap = parseFloat(cachedMarketCap);
      return priceData;
    }

    // ลองดึงจาก CoinGecko
    try {
      logger.debug(`Fetching market cap for ${symbol} from CoinGecko`);
      const geckoData = await PriceService.getPriceFromCoinGecko(symbol, currency);
      
      if (geckoData && geckoData.marketCap && geckoData.marketCap > 0) {
        // บันทึก market cap ใน cache
        await redis.set(cacheKey, geckoData.marketCap.toString(), MARKET_CAP_CACHE_EXPIRY);
        
        // เพิ่มใน priceData
        priceData.marketCap = geckoData.marketCap;
        return priceData;
      }
    } catch (geckoError) {
      logger.warn(`Failed to get market cap from CoinGecko for ${symbol}: ${geckoError.message}`);
    }

    // ถ้า CoinGecko ล้มเหลว ลองดึงจาก CoinMarketCap
    try {
      logger.debug(`Fetching market cap for ${symbol} from CoinMarketCap`);
      const cmcData = await PriceService.getPriceFromCoinMarketCap(symbol, currency);
      
      if (cmcData && cmcData.marketCap && cmcData.marketCap > 0) {
        // บันทึก market cap ใน cache
        await redis.set(cacheKey, cmcData.marketCap.toString(), MARKET_CAP_CACHE_EXPIRY);
        
        // เพิ่มใน priceData
        priceData.marketCap = cmcData.marketCap;
        return priceData;
      }
    } catch (cmcError) {
      logger.warn(`Failed to get market cap from CoinMarketCap for ${symbol}: ${cmcError.message}`);
    }

    return priceData;
  } catch (error) {
    logger.error(`Error enhancing price data for ${symbol}:`, error);
    return priceData; // ส่งคืนข้อมูลเดิมหากมีข้อผิดพลาด
  }
}
```

## การทดสอบและการควบคุมคุณภาพ

ทีมได้สร้างไฟล์ทดสอบ `__tests__/services/enhancedPriceService.test.js` เพื่อทดสอบสถานการณ์ต่างๆ:

1. กรณีที่มี market cap อยู่แล้ว
2. กรณีที่มี market cap อยู่ใน cache
3. กรณีที่ต้องดึงข้อมูลจาก CoinGecko
4. กรณีที่ต้องดึงข้อมูลจาก CoinMarketCap
5. กรณีที่ทุก API ล้มเหลว

นอกจากนี้ยังมีสคริปต์ `test-market-cap.js` สำหรับทดสอบการทำงานในสภาพแวดล้อมจริง

## การพัฒนาต่อไป

- เพิ่มการรองรับข้อมูลเพิ่มเติมจากแหล่งอื่นๆ เช่น developer data, social stats
- ปรับปรุงให้ทำงานแบบ batch หรือ parallel เพื่อรองรับหลายเหรียญพร้อมกัน
- เพิ่มการเก็บข้อมูลสถิติการใช้งาน cache และอัตราความสำเร็จของ API
- ปรับระยะเวลา TTL ของ cache ให้เหมาะสมตามความนิยมของเหรียญ

---

*เอกสารนี้อัพเดทล่าสุดวันที่ 21 พฤษภาคม 2568*
