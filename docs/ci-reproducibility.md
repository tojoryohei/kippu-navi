# CIの再現性とworkflow検査

## 固定とRenovate更新

外部Actionは40桁のコミットSHAに固定し、同じ行にタグをコメントで残します。同じActionは全workflowで同じSHAを使用します。Renovateの`github-actions` managerはコメントからバージョンを認識し、`pinDigests: true`でタグ更新とSHA更新を管理します。ローカルの再利用workflow参照は対象外です。

golangci-lint本体の`with.version`も完全なバージョンで指定し、標準の`github-actions` managerで更新します。初期値`v2.15.0`は成功CIの実行ログで確認したバージョンです。

actionlintとShellCheckは`.github/workflows/test.yml`の`ACTIONLINT_VERSION`と`SHELLCHECK_VERSION`に固定します。Renovateの`custom.regex` managerがGitHub Releasesから更新を検出します。更新時間帯、公開後3日待機、自動マージ条件は既存の設定に従います。

## ローカルでの検査

以下はリポジトリのルートで実行するLinux x86_64用のコマンドです。CIと同じバージョンをworkflowから読み取り、リポジトリ外へインストールします。

```bash
ACTIONLINT_VERSION=$(sed -n 's/^      ACTIONLINT_VERSION: //p' .github/workflows/test.yml)
SHELLCHECK_VERSION=$(sed -n 's/^      SHELLCHECK_VERSION: //p' .github/workflows/test.yml)
tool_dir=$(mktemp -d)
curl --fail --location --retry 3 \
  "https://github.com/rhysd/actionlint/releases/download/$ACTIONLINT_VERSION/actionlint_${ACTIONLINT_VERSION#v}_linux_amd64.tar.gz" \
  --output "$tool_dir/actionlint.tar.gz"
tar -xzf "$tool_dir/actionlint.tar.gz" -C "$tool_dir" actionlint
curl --fail --location --retry 3 \
  "https://github.com/koalaman/shellcheck/releases/download/$SHELLCHECK_VERSION/shellcheck-$SHELLCHECK_VERSION.linux.x86_64.tar.xz" \
  --output "$tool_dir/shellcheck.tar.xz"
tar -xJf "$tool_dir/shellcheck.tar.xz" -C "$tool_dir"
"$tool_dir/actionlint" -shellcheck "$tool_dir/shellcheck-$SHELLCHECK_VERSION/shellcheck"
```

Apple SiliconのmacOSでは、actionlintの`linux_amd64`を`darwin_arm64`へ、ShellCheckの`linux.x86_64`を`darwin.aarch64`へ置き換えます。

actionlintは全workflowの構文・式・Action入力・再利用workflowの整合性と、`run`内のShellCheck検査を行います。「Validate workflows and deployment scripts」で毎回実行し、ツールには公式リリースのビルド済みバイナリを使用します。警告は原則修正し、意図的なシェル記法の抑制は対象箇所に理由を記載します。

CIでは `renovate.json`、`.github/workflows/test.yml`、`.node-version`、`.npmrc` の変更時にRenovate設定を検証します。

Renovate validatorのインストール先を`RENOVATE_PACKAGE_ROOT`に設定すると、既存の設定検証も再現できます。validatorのバージョンはworkflowの`RENOVATE_VALIDATOR_VERSION`に合わせてください。

```bash
RENOVATE_X_IGNORE_RE2=true node "$RENOVATE_PACKAGE_ROOT/dist/config-validator.js" --strict --no-global renovate.json
node --test tests/automation/*.test.mjs
node scripts/check-runtime-versions.mjs
```

## キャンセルとタイムアウト

同じPRのCIとCodeQLは新しい実行で古い実行をキャンセルします。別PR同士は独立し、CodeQLのmain・定期実行にはrun IDで別グループを割り当てます。本番・stagingデプロイの既存の排他制御とキャンセル無効設定は維持します。

タイムアウトはESLint・Knip・Workerの統合ジョブ、Go lint、Go testが各15分、ブラウザ回帰が30分、workflow・デプロイスクリプト検証が20分、CodeQLが30分、release-pleaseが10分、stagingの対象解決が5分です。frontend/APIデプロイは既存の30分／40分を使用します。
