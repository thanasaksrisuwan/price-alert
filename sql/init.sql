-- ไฟล์สำหรับสร้างและเตรียมฐานข้อมูลสำหรับแอปพลิเคชัน Crypto Price Alert Bot

-- สร้างฐานข้อมูล (ต้องรันด้วยสิทธิ์ของ superuser)
-- CREATE DATABASE price_alert_db;

-- สร้างตาราง users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    premium BOOLEAN DEFAULT FALSE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    default_currency VARCHAR(10) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- สร้างตาราง alerts
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    symbol VARCHAR(20) NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'price_above', 'price_below', 'percent_change'
    target_value DECIMAL(20,8) NOT NULL,
    current_value DECIMAL(20,8),
    is_active BOOLEAN DEFAULT TRUE,
    triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- สร้างตาราง portfolio
CREATE TABLE IF NOT EXISTS portfolio (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    symbol VARCHAR(20) NOT NULL,
    quantity DECIMAL(20,8) NOT NULL,
    buy_price DECIMAL(20,8) NOT NULL,
    buy_date TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

-- สร้าง index เพื่อเพิ่มประสิทธิภาพการค้นหา
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio(user_id);

-- สร้าง index compound
CREATE INDEX IF NOT EXISTS idx_alerts_user_active ON alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_portfolio_user_symbol ON portfolio(user_id, symbol);

-- คำสั่ง SQL การใช้งาน (ตัวอย่าง):
-- 
-- # เพิ่มผู้ใช้ใหม่
-- INSERT INTO users (telegram_id, username, first_name) VALUES (12345, 'john_doe', 'John');
-- 
-- # เพิ่มการแจ้งเตือน
-- INSERT INTO alerts (user_id, symbol, alert_type, target_value, current_value) 
-- VALUES (1, 'BTC', 'price_above', 50000, 48000);
-- 
-- # เพิ่มรายการในพอร์ตโฟลิโอ
-- INSERT INTO portfolio (user_id, symbol, quantity, buy_price) 
-- VALUES (1, 'BTC', 0.5, 45000);
