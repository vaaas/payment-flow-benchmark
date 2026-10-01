FROM node:22.19.0-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["npm", "run", "start"]
