# PactPay web — Vite/React build, served as static SPA
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* in at build time. Railway passes service variables as build args.
ARG VITE_API_BASE
ARG VITE_WEB3AUTH_CLIENT_ID
ARG VITE_WEB3AUTH_NETWORK
ARG VITE_USDC_ASA
ARG VITE_ESCROW_APP_ID
ARG VITE_LORA
# write them so Vite's loadEnv definitely picks them up (production mode)
RUN printf "VITE_API_BASE=%s\nVITE_WEB3AUTH_CLIENT_ID=%s\nVITE_WEB3AUTH_NETWORK=%s\nVITE_USDC_ASA=%s\nVITE_ESCROW_APP_ID=%s\nVITE_LORA=%s\n" \
    "$VITE_API_BASE" "$VITE_WEB3AUTH_CLIENT_ID" "$VITE_WEB3AUTH_NETWORK" "$VITE_USDC_ASA" "$VITE_ESCROW_APP_ID" "$VITE_LORA" > .env.production \
 && npm run build

# --- serve stage ---
FROM node:22-slim
WORKDIR /app
RUN npm i -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 8080
# Railway sets $PORT; -s = SPA fallback to index.html
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
