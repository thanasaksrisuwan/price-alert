#!/bin/sh
set -e

echo "Starting price-alert application..."

# Wait for Redis to be ready
echo "Waiting for Redis connection..."
timeout=30
counter=0
while ! node -e "
const client = require('redis').createClient({url: process.env.REDIS_URL});
client.on('error', err => {
  console.error('Redis connection failed:', err);
  process.exit(1);
});
client.on('connect', () => {
  console.log('Redis connection successful');
  client.quit();
  process.exit(0);
});
client.connect();" 2>/dev/null
do
  if [ $counter -gt $timeout ]; then
    echo "Redis connection timed out, continuing anyway..."
    break
  fi
  echo "Waiting for Redis... ($counter/$timeout)"
  counter=$((counter + 1))
  sleep 1
done

# Wait for Postgres to be ready
echo "Waiting for PostgreSQL connection..."
timeout=30
counter=0
while ! node -e "
const { Pool } = require('pg');
const pool = new Pool({connectionString: process.env.DATABASE_URL});
pool.query('SELECT 1')
  .then(() => {
    console.log('PostgreSQL connection successful');
    pool.end();
    process.exit(0);
  })
  .catch(err => {
    console.error('PostgreSQL connection failed:', err);
    process.exit(1);
  });" 2>/dev/null
do
  if [ $counter -gt $timeout ]; then
    echo "PostgreSQL connection timed out, continuing anyway..."
    break
  fi
  echo "Waiting for PostgreSQL... ($counter/$timeout)"
  counter=$((counter + 1))
  sleep 1
done

# Start the application with proper output redirection
echo "Starting Node.js application..."
exec node --unhandled-rejections=strict index.js
