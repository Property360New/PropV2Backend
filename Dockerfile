FROM node:20-slim

WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files first (for layer caching)
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Generate Prisma client + Build NestJS
RUN npx prisma generate && npm run build

# Verify dist exists
RUN ls -la dist/src/main.js

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "dist/src/main"]