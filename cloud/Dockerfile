FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY src/ ./src/
EXPOSE 4000
CMD ["node", "src/index.js"]
