# Runner接続とセッション契約

## 現版の構成

foyer風の「名前付き仕事場＋継続する会話＋1回の実行記録」を参考にした独立実装です。foyerサーバーやfoyer npmパッケージは呼びません。Runnerは`src/adapters.mjs`に閉じ込め、管理側からはprofileとbindingを渡します。

```text
workId
  └─ logicalSessionId（role / owner / profile / fingerprint / generation）
       ├─ providerSessionId（ClaudeまたはCopilotの明示ID）
       ├─ runId A：最初の調査
       └─ runId B：追加質問・修正依頼
```

仕事の正本はSQLite、CLIの履歴はCLI側です。Vendor IDだけではCLI履歴が失われたホストで再開できません。移動時はCLI履歴を適切に移すか、状態チェックポイントで新しいセッションを作ります。

## 初回と継続

Claudeでは初回に`--session-id UUID`、継続に`--resume UUID`を使い、`-p --output-format stream-json --verbose`で出力します。Copilotでは`--session-id=UUID`／`--resume=UUID`と`--output-format=json`を使います。

プロンプトは両方とも標準入力から渡します。Copilotは公式のパイプ入力方式を使用し、`-p`は付けません。`-p`とパイプを同時に使うとパイプ側が無視されるためです。参考URLはSOURCES.mdに記載しています。

`--continue`や「一番最近のセッション」の選択は使いません。画面で論理IDとVendor IDを確認できます。モデル・cwd・許可ツール・実行ファイルなどが変わるとfingerprintが変わり、新しい論理セッションになります。ソフトウェアのバージョンやリポジトリ内の全設定ファイルの内容をfingerprintに含める実装ではないため、それらを変更したときは人間が新規セッションへ切り替えてください。

CLIが新規セッションIDを返した場合に検査して記録します。使える文字種／長さは検査しますが、CLI出力のすべてのバージョン差を網羅した汎用パーサではありません。エラー時は無断で別IDへ切り替えて再実行しません。

## APIの最小例

以下はローカル管理アプリのAPIであり、インターネット公開用のRunner APIではありません。

まず`GET /api/state`でCSRF値と状態を取得します。同一オリジンの書き込みは`Content-Type: application/json`と`X-Shiori-CSRF`が必要です。会話への投稿には`Idempotency-Key`も必要です。

| 呼出し | 役割 |
|---|---|
| POST /api/conversations | 相談を作る |
| POST /api/conversations/{id}/messages | Outerへ入力を渡す |
| POST /api/works | 仕事の正本の下書き |
| PATCH /api/works/{id} | revisionを確認して要求更新 |
| POST /api/works/{id}/dispatch | 実行の承認案を作る |
| POST /api/works/{id}/delegate | 範囲・回数・期限を指定して仕事を任せ、最初の実行を予約 |
| POST /api/works/{id}/stop-delegation | 残りの委任を取り消し、そのジョブと結果確認を停止 |
| POST /api/approvals/{id}/decision | approve/reject。人間UIから呼ぶ |
| GET /api/state | 状態・実行結果 |
| GET /api/events | SSEで変更通知。本文はstateで再取得 |
| POST /api/runs/{id}/cancel | 停止要求 |
| POST /api/runs/{id}/reconcile | 中断実行を人間が照合したことを記録 |
| POST /api/works/{id}/rotate-session | 次回のInnerを新しいセッションにする |
| POST /api/works/{id}/accept | 全条件を人間が確認して受け入れる |

実行依頼案の例：

```json
{
  "runnerId": "claude-dev",
  "mode": "read",
  "instruction": "既存仕様と現行コードの差を確認してください。変更はしないでください。"
}
```

返るapprovalには、仕事のrevision、接続先のfingerprint、依頼本文、期限、digestが含まれます。承認はその内容にだけ対応します。受理済み承認を再送しても新しいrunは作りません。

## 安定性

委任の本文例：`{"revision":1,"runnerId":"claude-read","mode":"read","maxRuns":3,"minutes":60,"instruction":"受け入れ条件に沿って調査してください"}`。最大回数は1〜20、有効時間は1〜1440分。返り値は `delegation` と最初の `job`。`GET /api/state` に `delegations` と `reviews` を含める。モデルの出力からこのAPIを直接呼ぶ経路はなく、UIで確定した委任だけを使う。

NodeスクリプトとしてCLIを起動する場合は、`command` にNode実行ファイル、`commandArgs` にスクリプトなどの固定引数配列を指定する。シェル文字列に変換しない。`commandArgs` と `restricted` の変更もfingerprintに含める。

ブラウザのHTTP接続はジョブの所有者ではありません。サーバーが所有し、画面切断後も継続します。同じ仕事場を編集する別セッションの衝突を避けるため、Innerはcwd単位でも排他します。

サーバーの電源断・killは別です。起動時に未終了runを`interrupted`とし、ロックを残します。外部副作用を一回だけにできた、という保証ではありません。記録PIDは照合の手掛かりで、PIDだけで他プロセスを殺す復旧機能は入れていません。

停止はSIGTERMを送り、猶予後にSIGKILLです。Unixではプロセスグループを対象にします。孤立した子プロセス、OSによる権限差、Windowsのツリー終了は完全には扱えていません。専用のプロセス管理基盤は今後の導入項目です。

出力はNDJSONとして検査し、上限を超えれば停止します。ツール引数や推論ブロックをUIへ展開しません。成果物本文に秘密が含まれない保証はなく、既知のトークンだけベストエフォートで伏せています。

## SDKや別ホストRunnerへ変更するとき

次の契約を維持すれば、CLIを置き換えても管理本体を変えずに済みます。

- 登録済みprofileと正本のrevisionで実行先を確定する。
- `logicalSessionId`と`providerSessionId`を分離する。
- 実行受付、状態取得、キャンセル、完了結果を個別に扱う。
- 起動の重複と、業務操作の重複を別に扱う。
- 信頼できるpermission callbackが使える場合も、仕事の承認とは区別する。
- remote runnerはmTLSなどの認証・認可・資格情報分離・結果の由来確認が必要。

現版にremote RunnerやSDK接続が実装されている、という意味ではありません。
