# 1. ビルド環境 (コンパイル用)
FROM golang:1.24-alpine AS builder
WORKDIR /app
ENV GOPROXY=https://golang.flatt.tech

# 依存関係のキャッシュを効かせるため、先にgo.modとgo.sumをコピー
COPY go.mod go.sum* ./
RUN go mod download

# ソースコード全体をコピー (go:embedされるJSONもここに含まれる)
COPY . .

# Wasmではなく、Cloud Run向けのAPIサーバーとしてビルド
ARG DEPLOY_COMMIT=local
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-X main.deploymentCommit=${DEPLOY_COMMIT}" -o server ./cmd/api

# 2. 実行環境 (本番用軽量イメージ)
FROM alpine:latest@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
# タイムゾーンデータとルート証明書（HTTPS通信用）のみインストール
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
# ビルド環境から生成されたバイナリと事前計算データを抽出
COPY --from=builder /app/server .
COPY --from=builder /app/data/precomputed/pass.bin ./data/precomputed/pass.bin
COPY --from=builder /app/data/precomputed/ticket.bin ./data/precomputed/ticket.bin

# Cloud Runが動的に割り当てるPORT環境変数を利用して起動
ENV PORT=8080
ENV PRECOMPUTED_DATA_DIR=/app/data/precomputed
EXPOSE 8080

CMD ["/app/server"]
