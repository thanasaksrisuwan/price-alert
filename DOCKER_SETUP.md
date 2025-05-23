# Docker Setup Guide for Crypto Price Alert Bot

This guide explains how to set up and run the Crypto Price Alert Bot using Docker and Docker Compose.

## Prerequisites

- Docker (version 20.10 or later recommended)
- Docker Compose (version 2.0 or later recommended)

## Setup Instructions

### 1. Environment Configuration

First, create a `.env` file from the provided `.env.docker` template:

```bash
cp .env.docker .env
```

Then, edit the `.env` file and fill in your actual values:

```bash
# Open with your favorite editor
nano .env
```

Make sure to set:
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather
- `POSTGRES_PASSWORD`: A secure password for the PostgreSQL database
- `COINGECKO_API_KEY`: Your CoinGecko API key
- `BINANCE_API_KEY` and `BINANCE_API_SECRET`: Your Binance API credentials
- `COINMARKETCAP_API_KEY`: Your CoinMarketCap API key
- `NEWS_API_KEY`: Your News API key

### 2. Building and Starting the Services

Use Docker Compose to build and start all services:

```bash
docker-compose up -d
```

This will start:
- The Price Alert Bot application on port 3000
- PostgreSQL database on port 5432
- Redis instance on port 6379

### 3. Verifying the Setup

Check if all services are running correctly:

```bash
docker-compose ps
```

View application logs:

```bash
docker-compose logs -f app
```

### 4. Stopping the Services

To stop all services:

```bash
docker-compose down
```

To stop and remove all data volumes (this will delete all data):

```bash
docker-compose down -v
```

## Data Persistence

The application is configured to persist data in Docker volumes:
- `postgres_data`: PostgreSQL database data
- `redis_data`: Redis data

The application logs are mounted from the host's `./logs` directory to the container's `/app/logs` directory.

## Customization

You can customize the Docker setup by modifying the following files:
- `Dockerfile`: For application container configuration
- `docker-compose.yml`: For service orchestration
- `.env`: For environment variables

## Troubleshooting

If you encounter any issues:

1. Check the application logs:
   ```bash
   docker-compose logs -f app
   ```

2. Verify that all required environment variables are set correctly in your `.env` file.

3. Make sure the PostgreSQL initialization script runs properly:
   ```bash
   docker-compose logs db
   ```

4. Ensure Redis is connecting properly:
   ```bash
   docker-compose logs redis
   ```

5. If the database connection fails, you might need to wait a few moments for PostgreSQL to initialize completely.
