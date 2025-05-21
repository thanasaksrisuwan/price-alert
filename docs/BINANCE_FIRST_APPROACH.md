# Binance-First Price Data Approach

## Overview

The price-alert system has been configured to prioritize Binance as the primary data source for cryptocurrency price information. This approach offers several advantages:

1. **Real-time Data**: Binance WebSockets provide millisecond-level price updates
2. **Reduced Latency**: WebSocket connections maintain persistent connections
3. **Higher Rate Limits**: Binance offers generous rate limits compared to other APIs
4. **Comprehensive Trading Pair Coverage**: Access to a wide range of trading pairs

## How It Works

The price data retrieval system now follows this priority order:

1. **Local Cache** (Redis) - For fastest responses
2. **Binance WebSocket** - For real-time data that's already streaming
3. **Binance REST API** - Primary external API source
4. **CoinGecko API** - Secondary fallback when Binance doesn't have the data
5. **CoinMarketCap API** - Final fallback option

## Enhanced Features

### 1. Automatic WebSocket Subscription for Popular Coins

The system now automatically subscribes to WebSocket streams for popular cryptocurrencies on startup:
- Bitcoin (BTC), Ethereum (ETH), Binance Coin (BNB), etc.
- Full list available in `src/services/binanceInitializer.js`

### 2. Multiple Trading Pair Fallback

When querying Binance REST API, the system will try multiple trading pairs:
1. USDT pair first (e.g., BTCUSDT)
2. BUSD pair if USDT fails (e.g., BTCBUSD)
3. BTC pair for altcoins (e.g., XRPBTC)
4. ETH pair as final option (e.g., XRPETH)

### 3. Dynamic Price Conversion

The system handles price conversion across different trading pairs:
- For BTC/ETH-based pairs, prices are automatically converted to USD
- Currency conversion to requested currency (THB, EUR, etc.)

## Benefits

1. **Faster Alerts**: Real-time price triggers for more timely alerts
2. **Higher Reliability**: Multiple fallback mechanisms ensure price data availability
3. **Better Scaling**: Reduced external API dependency
4. **Lower Operating Costs**: Fewer paid API calls to CoinGecko/CoinMarketCap

## Configuration

No additional configuration is required. The system will automatically prefer Binance data sources over others.
