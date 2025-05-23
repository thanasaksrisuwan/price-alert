FROM node:20-alpine

# Install wget for health check and provide shell utilities
RUN apk --no-cache add wget

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Make startup script executable
RUN chmod +x docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["./docker-entrypoint.sh"]
