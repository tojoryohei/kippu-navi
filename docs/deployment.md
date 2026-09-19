# デプロイ・運用手順

## デプロイ構成

GitHub Actionsの`deploy-frontend.yml`がフロントエンドを配信します。通常はmain以外がステージング、mainが本番に対応します。`workflow_dispatch`でproductionを選択すると、`kippu-navi.com`へ接続せず`workers.dev`で本番Workerを検証できます。

Go APIのCloud Runデプロイは`deploy-api.yml`が行います。

## Cloud Run認証の初期設定

Cloud RunはIAM認証を必須とし、Cloudflare Workerだけに`roles/run.invoker`を付与します。API実行用サービスアカウントにはプロジェクトロールを付与しません。以下は初回のみ、Google Cloud管理権限を持つ端末で実行します。`GITHUB_DEPLOY_SA`には`WIF_PROVIDER`から利用しているGitHub Actions用サービスアカウントを指定してください。

```sh
PROJECT_ID=bubbly-trail-470023-e4
REGION=asia-northeast1
GITHUB_DEPLOY_SA=github-actions-deployer@bubbly-trail-470023-e4.iam.gserviceaccount.com

gcloud iam service-accounts create calculation-engine-runtime --project="$PROJECT_ID" --display-name='Calculation Engine runtime (production)'
gcloud iam service-accounts create calculation-engine-stg-runtime --project="$PROJECT_ID" --display-name='Calculation Engine runtime (staging)'
gcloud iam service-accounts create cloudflare-api-invoker --project="$PROJECT_ID" --display-name='Cloudflare API invoker (production)'
gcloud iam service-accounts create cloudflare-api-invoker-stg --project="$PROJECT_ID" --display-name='Cloudflare API invoker (staging)'

for runtime_account in calculation-engine-runtime calculation-engine-stg-runtime; do
  gcloud iam service-accounts add-iam-policy-binding \
    "$runtime_account@$PROJECT_ID.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:$GITHUB_DEPLOY_SA" \
    --role='roles/iam.serviceAccountUser'
done

gcloud run services add-iam-policy-binding calculation-engine \
  --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:cloudflare-api-invoker@$PROJECT_ID.iam.gserviceaccount.com" \
  --role='roles/run.invoker'
gcloud run services add-iam-policy-binding calculation-engine-staging \
  --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:cloudflare-api-invoker-stg@$PROJECT_ID.iam.gserviceaccount.com" \
  --role='roles/run.invoker'
```

環境ごとに鍵を一時ファイルへ作成し、Cloudflare Secretsへ登録します。`mktemp`が表示したパスを`KEY_FILE`へ指定し、登録後は秘密鍵ファイルを安全に削除してください。

```sh
KEY_FILE=$(mktemp)
INVOKER_ACCOUNT=cloudflare-api-invoker-stg
WORKER_ENV=staging
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$INVOKER_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --project="$PROJECT_ID"
jq -r '.client_email' "$KEY_FILE" | npx wrangler secret put GCP_SERVICE_ACCOUNT_EMAIL --env "$WORKER_ENV"
jq -r '.private_key' "$KEY_FILE" | npx wrangler secret put GCP_SERVICE_ACCOUNT_PRIVATE_KEY --env "$WORKER_ENV"
```

ステージングでは`cloudflare-api-invoker-stg`と`staging`、本番では`cloudflare-api-invoker`と`production`を使います。初回設定では、両環境のWorker Secrets登録とフロントエンドデプロイを先に完了し、その後APIをデプロイしてIAM認証を有効化します。

## 鍵のローテーション

新しい鍵を作成して同じ2つのWorker Secretsを更新し、Cloudflare経由の疎通確認後に古い鍵を`gcloud iam service-accounts keys delete`で削除します。常に先に新しい鍵へ切り替え、障害時に戻せる状態で確認してください。

## Cloud Run認証の確認

- `run.app` URLへ認証なしでアクセスして403になることを確認します。IAMで拒否されたリクエストはコンテナログに到達しません。
- Cloudflareの対象環境から各`/api/*`を呼び、正常応答と`X-Request-ID`を確認します。トークン交換失敗時はWorkerが502を返します。
- `gcloud run services describe`の`spec.template.spec.serviceAccountName`が環境別ランタイムサービスアカウントになっていることを確認します。
- `gcloud run services get-iam-policy`に`allUsers`の`roles/run.invoker`がなく、対応するCloudflare Invokerだけが登録されていることを確認します。

## APIキャッシュのパージ

運賃・路線データまたは分割経路探索ロジックを更新した場合は、Cloudflare DashboardからAPIキャッシュを手動でパージします。WorkerのサブリクエストキャッシュはCloud Run側URLをキーにするため、Custom Purgeでは対象環境の`calculation-engine...run.app/api/` prefixを指定します。キャッシュと無関係なAPI変更ではパージ不要です。
