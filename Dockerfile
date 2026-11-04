# Transmission Portal — single container: static site + data API
# Stage 1 builds the React islands (dock, network events, demands) into assets/react/;
# the runtime stage stays dependency-free (plain Node servers).
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.mts components.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY . .
COPY --from=build /src/assets/react ./assets/react

ENV PUBLIC_PORT=5454 \
    API_PORT=5455 \
    PORT=5455 \
    DATA_DIR=/app/server/data \
    TZ=UTC

# data (JSON files + Zabbix token) lives on a volume so it survives image updates;
# runs as root so a bind-mounted ./data created by Docker is always writable
RUN mkdir -p /app/server/data
VOLUME ["/app/server/data"]

EXPOSE 5454
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5454/api/demands >/dev/null || exit 1

CMD ["node", "docker/start.js"]
