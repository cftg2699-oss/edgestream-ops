FROM node:18-alpine

LABEL maintainer="EdgeStream OPS v2.1"
LABEL description="Ultra-low latency event visualization — Shadow Duel Mode"

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Create output directories
RUN mkdir -p recordings metrics

# Expose WebSocket server port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8080 || exit 1

# Default: start WebSocket server
CMD ["node", "src/server/server.js"]
