# 再現可能な開発環境

Windowsのコマンドは、ルートの [dev.cmd](../dev.cmd) を経由して実行する。
既存のmise版Node 24.19.0を絶対パスで起動し、PowerShellのプロファイルを読み込まず、子プロセスの環境を正規化する。

```powershell
.\dev.cmd doctor
.\dev.cmd test-env
.\dev.cmd node --test tools/sandbox-policy.test.mjs
.\dev.cmd node tools/check-sandbox.mjs
```

- [toolchain.json](toolchain.json)：この端末のツール配置。Nodeを変更するときは [dev.cmd](../dev.cmd)、[mise.toml](../mise.toml)、アプリの [.node-version](../shiori-work-v0.1.0/.node-version) も揃える。
- [dev.mjs](dev.mjs)：PATHの大小文字重複を除去し、ツールを固定。npm・mise・一時ファイルの書き込み先はworkspace内の `.cache/`。
- [sandbox-policy.json](sandbox-policy.json)：継続的な読み取り許可が必要な8対象。ユーザーフォルダー全体への許可は追加しない。
- [setup-sandbox.mjs](setup-sandbox.mjs)：VS Codeの `chat.agent.sandbox.fileSystem.userConfiguredPaths` に読み取り対象だけを追加。
- [setup-codex-reads.mjs](setup-codex-reads.mjs)：Codexの `permissions.vscode-workspace.filesystem` に同じ読み取り対象を追加。
- [check-sandbox.mjs](check-sandbox.mjs)：設定の存在ではなく、現在のsandboxで実際に読めるかを検査。ファイルの内容は出力しない。

セットアップは `--apply` なしで変更内容を表示し、付けるとバックアップ後に適用する。通常の開発や毎回の起動で再適用しない。
エージェントの読み取りには `dev.cmd rg -n` と明示的な対象を使い、その場で組み立てた `node -e` は使わない。コードが必要な診断は目的を限定したファイルにし、テストは既存のnpmスクリプトを実行する。Node全体・インラインコード・dev.cmd全体を包括的な恒久許可の対象にしない。ホスト側の承認は別に判定されるため、将来の承認が一切不要とは保証しない。
エージェントの読み取りには `dev.cmd rg -n` と明示的な対象を使い、その場で組み立てた `node -e` は使わない。コードが必要な診断は目的を限定したファイルにし、テストは既存のnpmスクリプトを実行する。Node全体・インラインコード・dev.cmd全体を包括的な恒久許可の対象にしない。ホスト側の承認は別に判定されるため、将来の承認が一切不要とは保証しない。
既存の書き込み許可・拒否規則・承認方式・ネットワーク設定は変更しない。

設定を保存しても、起動済みのAgent Hostが持つ権限に反映されない場合がある。VS Codeで `Developer: Reload Window` を実行してから、**通常のsandbox実行**で `check-sandbox` と `doctor` を再検証する。管理ポリシーが上書きする場合は失敗をそのまま報告し、sandbox外での成功を代用しない。

2026-10-29の再読み込み後の検証では、Node・mise・Git・ripgrep・Codex設定の5対象は読み取り可能。VS Codeのユーザー設定、SDKキャッシュ、プラグイン格納先の3対象は、管理プロファイルに記載されていても `EPERM` となった。原因は未確定。再読み込みや設定の再適用を繰り返さず、この制限を残したまま利用可能な開発ツールで作業する。これら3対象の読み取りはアプリの実行・テストには必要ない。

`doctor` は子の `cmd.exe` がPATHから実際に起動したNodeの絶対パスを検証する。このsandboxでは `where node` が失敗してもNodeの起動は成功するため、探索コマンドの成否を実行可否の代用にしない。

通常のアプリ操作例：アプリのディレクトリで `C:\workspace\gaogaobot\dev.cmd npm start`。
Nodeの再インストール、OS全体のPATH変更、shell profileの編集は不要。

CLIをNodeスクリプトとして起動する場合、アプリのプロファイルで `command` にNode実行ファイル、`commandArgs` にスクリプトの絶対パスなどの固定引数の配列を指定できる。シェルを介さず引数を渡し、固定引数の変更も承認対象のプロファイル識別に含める。統合テストはこの方式でテスト用CLIを起動し、Windowsでもshebangの直接実行に依存しない。
