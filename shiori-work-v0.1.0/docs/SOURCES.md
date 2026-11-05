# 参照と採用範囲

## ユーザー提供資料

- `shiori-poc-v0.0.1(1).zip`：会話中心の画面、静かな配色、アイコンレール、必要時にパネルを開く発想の参考。アバター画像を縮小して使用。元PoCの業務機能を全て保持するコピーではない。
- `macro_harness_overview_v0.2.md`／`macro_harness_uiux_muse_v0.2.md`：前回の設計を見直す出発点。
- 『次世代：今までのハーネス設計のその先…』（2026-03-08）：マクロ／ミクロ／状態基盤、3人格に分けない考え方を参照。原文の「ミクロは分業中心」は今回の必須条件として採用しない。
- 『ケルベロス設計の再構成』：複数入口の共通実行基盤と会話ID／ベンダーセッションIDの分離を参考。
- foyer記事・コード：名前付き仕事場、セッションと実行の分離を参考。コードは転用・同梱していない。foyer互換APIを名乗らない。
- beads資料：受け入れ条件・依存・記憶の発想を参考。本実装でbeadsは導入せず、当面は独立したSQLiteの管理状態を正本にした。

提供された有料記事・画像資料・ZIP全体は再配布物に含めていません。本アプリの設計は資料の復元ではなく、今回の業務用途向けの実装案です。

## 公式技術資料（作成時に確認）

1. Claude Code — Run programmatically
   https://code.claude.com/docs/en/headless
   `-p`、構造化出力、SDKとの違い、通常実行の設定読込み、bareの挙動を確認。

2. Claude Code — CLI reference
   https://code.claude.com/docs/en/cli-reference
   session-id、resume、tools、disallowedTools、safe-mode、MCP制約を確認。

3. GitHub Copilot — Programmatic execution
   https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically
   -pとstdinの選択、両方指定時のstdin無視、最小権限を確認。

4. GitHub Copilot — Command reference
   https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
   session-id／resume、JSON出力、ツール制限、認証の選択肢を確認。

5. GitHub Copilot — Programmatic reference
   https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
   非対話実行とJSONL出力の仕様を確認。

6. Grok Bot — Skills and routines
   https://docs.x.ai/grok-bot/skills-routines-and-automations
   継続担当、起動条件、承認境界、まず単発を安定させてから定期化する考え方を参考。Grok Botの機能をすべて実装したという意味ではない。

## 検証上の注意

公式文書で説明される仕様と、利用者のインストール済みCLIの挙動は同じとは限りません。バージョンの固定、ヘルプ検査、実アカウントでの小さな結合試験が必要です。特定の料金プランを利用できるという保証は、この試作には含めません。
