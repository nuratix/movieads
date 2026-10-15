FROM node:22-alpine

WORKDIR /app

# Install dependencies first for fast layer caching
COPY package.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure storage directories exist with write permissions
RUN mkdir -p /app/data /app/uploads

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
