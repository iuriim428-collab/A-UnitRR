FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile

COPY lib/ lib/
COPY artifacts/wb-optimizer/ artifacts/wb-optimizer/

RUN pnpm --filter @workspace/wb-optimizer run build

FROM nginx:alpine
COPY --from=builder /app/artifacts/wb-optimizer/dist /usr/share/nginx/html

COPY artifacts/wb-optimizer/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
