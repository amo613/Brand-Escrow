# PactPay backend — Hono x402 oracle + agentic escrow API (run via tsx, no build step)
FROM node:22-slim
WORKDIR /app

# deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# app source (src/ incl. vendored generated/EscrowClient.ts; .env is .dockerignore'd)
COPY . .

ENV NODE_ENV=production
# Railway provides $PORT; server.ts binds 0.0.0.0:$PORT
EXPOSE 8080
CMD ["npm", "run", "start"]
