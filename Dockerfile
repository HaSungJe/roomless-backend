# syntax=docker/dockerfile:1
# 앱 하나를 이미지 하나로 — APP 인자로 고른다 (gateway | user-service)
#   docker build --build-arg APP=gateway -t roomless/gateway .
# 베이스는 Debian slim: bcrypt 가 glibc 용 prebuild 만 제공한다(Alpine/musl 이면 소스 빌드가 필요).

ARG NODE_IMAGE=node:24-slim

# ── 1. 전체 의존성 ──
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 2. 앱 빌드 ──
FROM deps AS build
ARG APP
COPY tsconfig.json nest-cli.json ./
COPY apps ./apps
COPY libs ./libs
RUN test -n "$APP" || (echo "APP build-arg 가 필요합니다 (gateway | user-service)" && exit 1)
RUN npx nest build "$APP"

# ── 3. 운영 의존성만 ──
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── 4. 실행 이미지 ──
FROM ${NODE_IMAGE} AS runtime
ARG APP
ENV NODE_ENV=production \
    APP=${APP}
WORKDIR /app
# package.json 의 "type": "module" 이 있어야 dist 의 .js 가 ESM 으로 실행된다
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/${APP} ./dist/apps/${APP}
USER node
CMD ["sh", "-c", "exec node dist/apps/${APP}/apps/${APP}/src/main.js"]
