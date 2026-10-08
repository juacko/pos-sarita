# ─── Stage 1: Build dependencies ───
FROM node:20-slim AS deps

WORKDIR /app

# better-sqlite3 necesita compilar binarios nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ─── Stage 2: Runtime ───
FROM node:20-slim

WORKDIR /app

# Copiar dependencias compiladas
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copiar código de la aplicación
COPY server/ ./server/
COPY public/ ./public/
COPY printers-config.json ./

# Crear directorios necesarios
RUN mkdir -p data prints

# Usuario no-root para seguridad
RUN groupadd -r posapp && useradd -r -g posapp posapp \
    && chown -R posapp:posapp /app
USER posapp

EXPOSE 3000

# Health check básico
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/usuarios').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
