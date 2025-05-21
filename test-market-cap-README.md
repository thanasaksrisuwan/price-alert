# Market Cap Enhancement Test Tool

This script helps test the enhanced price service functionality that adds market cap information for cryptocurrencies when not available from the primary API (Binance).

## Usage

```powershell
# Test with default values (BTC in THB)
node test-market-cap.js

# Test with specific cryptocurrency
node test-market-cap.js ETH

# Test with specific cryptocurrency and currency
node test-market-cap.js BTC USD
```

## What It Does

1. Fetches price data using our standard "Binance First" approach
2. Shows the initial price data, including any missing market cap
3. Runs the enhanced price service to supplement the market cap
4. Shows the enhanced price data with market cap included

## Expected Output

The script will output JSON data showing before and after enhancement, with market cap values. A successful enhancement will show a non-zero market cap in the enhanced data, even if it was zero in the original data.

## Requirements

- Redis must be running
- API connections to CoinGecko and/or CoinMarketCap must be configured

## Troubleshooting

If you encounter any issues:
- Check that Redis is running and properly configured
- Verify API configurations in your .env file
- Check network connectivity to the external APIs

For any further assistance, please contact the development team.
