# 検証結果 — v0.2.0

## 検証環境

自動試験は、Windows 11、Node.js v24.19.0（workspaceの `dev.cmd` で固定したmise版）、組込みnode:sqliteで実行しました。実行用npmパッケージは追加していません。v0.2をmacOS・Linuxで再試験していません。

画面試験はv0.1.0時点のもので、Linux、Node.js v22.16.0、Python Playwright、Chromiumを使用しました。

## 自動試験：96件成功

2026-11-10に `npm test` で**96件、失敗0件**を確認しました。テストは以下の7ファイルです。

- `tests/core.test.mjs`：管理ロジック・状態・承認・セッション・外ループ
- `tests/delegation.test.mjs`：委任・条件ごとの確認・自動続行の停止
- `tests/integration.test.mjs`：実サブプロセスを使う模擬CLIとHTTP・SQLiteの結合
- `tests/codex.test.mjs`：Codex execの引数・イベント・厳密スキーマ・HTTP経由の会話
- `tests/codex-runtime.test.mjs`：プロジェクト固定のCodex CLIの選択
- `tests/models.test.mjs`：モデル候補と接続先ごとのモデル選択
- `tests/command-args.test.mjs`：`commandArgs` の引数分離とfingerprint

主な検証内容：

| 領域 | 確認したこと |
|---|---|
| 仕事と承認 | 目的／条件の保持、revision競合、変更時の無効化、承認期限、対象digest、再送、却下 |
| 委任 | 同一セッションでの続行、回数・期限の上限、停止・キャンセル、条件変更・設定変更での失効、読取りから変更への拡大の拒否、失敗・権限不足で自動再試行しない、古い結果の拒否 |
| 結果確認 | 全条件を一度ずつ評価、デモ結果を達成根拠にしない、reviewがない結果での停止 |
| 受け入れ | CLI成功だけでは完了しない、全条件確認、判断記録 |
| 実行 | 無効Runner拒否、変更権限拒否、キュー一時停止、回数上限、キャンセル、cwd排他 |
| セッション | 初回の明示IDと継続ID、ローテーション、仕事間の分離 |
| 復旧 | 中断実行を自動再発注しない、ロックを残す、人間の照合 |
| 外ループ | 定期確認の集約、Outerだけ起動、イベントIDの重複排除、不明な会話への拒否 |
| モデル応答 | 不正操作の拒否、受け入れ条件必須、資料引継ぎ、複数アクションのロールバック |
| モデル選択 | CLIからの候補取得、取得失敗の明示、接続先ごとの保存、待機中の依頼のモデル維持、Innerへの非波及 |
| CLI接続 | argvとstdin、JSONL正規化、エラー、壊れた出力、タイムアウト、実プロセスの停止、CLIの自動フォールバックなし |
| Codex | 新規／継続の権限プロファイル、読取り専用での変更拒否、厳密スキーマ、スレッドIDの継続、推論・コマンド内容の非表示 |
| HTTP | state取得、CSRF／Origin／Host／JSON制約、パス、イベント用トークン |
| 永続化 | SQLiteの再接続後に状態が残る |

模擬CLIは本物の子プロセスですが、Claude／Copilot／Codexのサービスには接続していません。mockの成功は、公式CLIの全バージョンへの適合性やモデル性能の証明ではありません。

## 画面：オフラインUIで10項目確認（v0.1.0時点）

`node scripts/build-preview.mjs`で生成した単独HTMLを、Playwrightの`page.set_content`でレンダリングしました。v0.2で追加した委任・モデル選択の画面はこの試験の対象外です。自動試験ではHTTPでのUI資産の配信だけを確認しています。

1. 初期画面と会話の入口。
2. 相談から仕事の下書き、専用会話へ移動。
3. 実行承認、模擬実行、成果物表示。自動完了しない。
4. 同じ仕事での追加依頼。
5. 全条件を確認した明示的受け入れ。
6. 定期確認の登録と有効化／停止。
7. ライブラリとキーボード検索。
8. 画面移動後の入力下書き保持。
9. 幅390pxのモバイル表示で横はみ出しがない。
10. 上記操作中にブラウザのJavaScript例外がない。

結果は`browser-preview-results.json`、画像は`screenshots/01-home.png`〜`05-mobile.png`にあります。

**この環境ではブラウザからlocalhostへ移動する操作が管理上の制約でブロックされました。** そのため、HTTPの結合試験はNodeのクライアントで、ブラウザのUI検証はオフラインHTMLで分けて実施しています。実サーバーとブラウザをつないだ一気通貫のE2E試験とは呼んでいません。制約を迂回する設定変更はしていません。

## 実CLIとの疎通

Claude CodeのWindows既存ログインでの実応答・構造化JSON・同一セッション継続と、Codex execのWindows sandbox内でのファイル作成の失敗は、[README](../README.md)の記録です。本報告の作成時には `smoke:*` を再実行していません。

## 未検証

Copilotの実アカウント結合、実CLIでの実資料の送信と実ファイル編集、課金・利用枠、pstackの実読込み、実リポジトリでの変更とテスト、企業プロキシ、v0.2のmacOS・Linux、遠隔接続、長時間連続運転、侵入試験、全ての障害タイミングは未検証です。

デモに書かれた「整理した」「検証結果」などはUIのサンプルであり、実際のコードに対する検証結果ではありません。本報告の96件はアプリ実装自体に対する自動試験です。

## 再実行

```powershell
# Windows：このアプリのディレクトリから
..\dev.cmd npm test
..\dev.cmd npm run doctor
..\dev.cmd npm run preview:build
```

```sh
# 他のOS
npm test
npm run doctor
npm run preview:build
# 画面テストのみ：別途Python playwrightとChromiumが必要
python tests/browser-preview.py
```

ブラウザ試験のChromiumパスは`/usr/bin/chromium`です。他環境では試験スクリプト側を調整してください。これらはアプリ本体の起動に必要な依存ではありません。
