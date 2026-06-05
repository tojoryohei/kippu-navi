# 1. ビルド環境 (コンパイル用)
FROM golang:1.24-alpine AS builder
WORKDIR /app

# 依存関係のキャッシュを効かせるため、先にgo.modとgo.sumをコピー
COPY go.mod go.sum ./
RUN go mod download

# ソースコード全体をコピー (go:embedされるJSONもここに含まれる)
COPY . .

# Wasmではなく、Cloud Run向けのAPIサーバーとしてビルド
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o server cmd/api/main.go

# 2. 実行環境 (本番用軽量イメージ)
FROM alpine:latest
# タイムゾーンデータとルート証明書（HTTPS通信用）のみインストール
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
# ビルド環境から生成されたバイナリのみを抽出
COPY --from=builder /app/server .

# Cloud Runが動的に割り当てるPORT環境変数を利用して起動
ENV PORT=8080
EXPOSE 8080

CMD ["/app/server"]
