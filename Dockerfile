# 多阶段构建：deps → build → 运行时（standalone 产物，镜像小）
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# data/ 存放连接配置（含密钥），挂载卷持久化
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME /app/data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
