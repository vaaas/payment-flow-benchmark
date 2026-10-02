FROM node:22.19.0-bookworm-slim AS application
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["npm", "run", "start"]

FROM application AS mutation
RUN apt-get update \
  && apt-get install --yes --no-install-recommends procps \
  && rm -rf /var/lib/apt/lists/*
