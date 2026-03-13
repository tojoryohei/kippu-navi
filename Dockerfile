# 1. 依存関係のインストール用ステージ
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. ビルド用ステージ
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# テレメトリー（情報収集）を無効化してビルドを少しでも早くする
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. 本番実行用ステージ（ここが実際にCloud Runで動く超軽量な環境になります）
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# セキュリティのため、rootユーザーではなくnodeユーザーで実行
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# publicフォルダ（ads.txtなど）をコピー
COPY --from=builder /app/public ./public

# standaloneで生成された必要最小限のファイルだけをコピー
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# サーバーの起動
CMD ["node", "server.js"]