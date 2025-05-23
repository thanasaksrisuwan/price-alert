# Environment Configuration Documentation

This document describes all environment variables used in the Price Alert application.

## Core Application Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Application environment | `development` | Yes |
| `PORT` | HTTP server port | `3000` | Yes |
| `LOG_LEVEL` | Logging verbosity | `debug` | Yes |
| `TELEGRAM_BOT_TOKEN` | Token from Telegram BotFather | - | Yes |

## Database Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5433/price_alert_db` | Yes |
| `REDIS_URL` | Redis connection string | `redis://localhost:6380` | Yes |

## External API Keys

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `COINGECKO_API_KEY` | CoinGecko Pro API key | - | No |
| `BINANCE_API_KEY` | Binance API key | - | No |
| `BINANCE_API_SECRET` | Binance API secret | - | No |
| `COINMARKETCAP_API_KEY` | CoinMarketCap API key | - | No |
| `NEWS_API_KEY` | NewsAPI key | - | No |

## Alert Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ALERT_CHECK_INTERVAL` | How often to check price alerts (ms) | `60000` | Yes |
| `MAX_FREE_ALERTS` | Maximum number of free alerts per user | `10` | Yes |

## Queue Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `QUEUE_CONCURRENCY` | Number of concurrent jobs in the main queue | `10` | Yes |
| `WEBSOCKET_CONCURRENCY` | Number of concurrent WebSocket connection jobs | `20` | No |

## WebSocket Basic Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MAX_WEBSOCKET_CONNECTIONS` | Maximum number of WebSocket connections | `50` | Yes |
| `WEBSOCKET_CONNECTION_POOL_SIZE` | Size of the WebSocket connection pool | `25` | Yes |
| `WEBSOCKET_RECONNECT_INTERVAL` | Time between reconnection attempts (ms) | `5000` | Yes |
| `WEBSOCKET_RECONNECT_ATTEMPTS` | Number of reconnection attempts before giving up | `5` | Yes |

## WebSocket Advanced Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WEBSOCKET_CONNECTION_TIMEOUT` | Connection timeout (ms) | `15000` | No |
| `WEBSOCKET_MAX_STREAMS_PER_CONNECTION` | Maximum streams per single WebSocket connection | `25` | No |
| `WEBSOCKET_KEEP_ALIVE_INTERVAL` | Interval for sending ping messages (ms) | `30000` | No |
| `WEBSOCKET_QUEUE_SIZE_THRESHOLD` | Queue size threshold before scaling connection pool | `10` | No |
| `WEBSOCKET_POOL_SCALE_DOWN_THRESHOLD` | Pool usage ratio for scaling down (0.0-1.0) | `0.3` | No |
| `WEBSOCKET_POOL_SCALE_UP_THRESHOLD` | Pool usage ratio for scaling up (0.0-1.0) | `0.7` | No |
| `WEBSOCKET_MONITOR_INTERVAL` | Interval for connection health monitoring (ms) | `60000` | No |

## WebSocket Batch Processing

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WEBSOCKET_BATCH_SIZE` | Number of connections to process in one batch | `5` | No |
| `WEBSOCKET_BATCH_DELAY` | Delay between processing batches (ms) | `1000` | No |

## Network Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `API_REQUEST_TIMEOUT` | API request timeout (ms) | `30000` | No |
| `API_MAX_RETRIES` | Maximum retries for failed API requests | `3` | No |
| `API_RETRY_DELAY` | Delay between retries (ms) | `1000` | No |

## Currency Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DEFAULT_CURRENCY` | Default currency code | `USD` | No |

## Caching Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PRICE_CACHE_TTL` | Price data cache time-to-live (seconds) | `60` | No |
| `COIN_METADATA_CACHE_TTL` | Coin metadata cache time-to-live (seconds) | `3600` | No |
| `NEWS_CACHE_TTL` | News data cache time-to-live (seconds) | `900` | No |

## Rate Limiting Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests per IP per minute | `60` | No |
| `RATE_LIMIT_BLOCK_DURATION` | Duration to block IPs that exceed the limit (seconds) | `300` | No |
| `RATE_LIMIT_STORE_SIZE` | Size of rate limiting data store (items) | `10000` | No |

## Security Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENABLE_CORS` | Enable Cross-Origin Resource Sharing | `true` | No |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:3000` | No |
| `JWT_EXPIRATION` | JWT token expiration time (seconds) | `86400` | No |
| `ACCOUNT_LOCKOUT_DURATION` | Account lockout duration after failed logins (seconds) | `300` | No |
| `MAX_FAILED_LOGIN_ATTEMPTS` | Maximum failed login attempts before lockout | `5` | No |

## Environment File Management

For local development, you can use either:
- `.env` - Main environment file
- `.env.extended` - Extended configuration with all options

For production, we recommend using environment variables directly on your hosting platform 
or a secure environment variable management service.

## Best Practices

1. **Never commit actual API keys** to version control
2. Use different values for development, testing, and production
3. When deploying, validate all required variables are set
4. Rotate API keys and secrets periodically
5. For high-security deployments, consider using a vault service
