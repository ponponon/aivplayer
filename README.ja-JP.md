<p align="center">
  <img src="brand/icon.png" width="120" alt="AIVPlayer Logo">
</p>

<h1 align="center">AIVPlayer</h1>

<p align="center">
  <strong>再生、字幕、ビジュアルメディアライブラリ、ショートドラマ制作に対応したローカルファーストの AI 動画ワークステーション</strong>
</p>

<p align="center">
  <a href="https://aivplayer.pages.dev/">製品サイト</a> ·
  <a href="https://github.com/ponponon/aivplayer/releases">GitHub からダウンロード</a> ·
  <a href="https://gitee.com/ponponon/aivplayer/releases">Gitee からダウンロード</a>
</p>

<p align="center">
  <a href="https://github.com/ponponon/aivplayer/releases">
    <img src="https://img.shields.io/github/v/release/ponponon/aivplayer" alt="Release">
  </a>
  <a href="https://github.com/ponponon/aivplayer/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ponponon/aivplayer" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> ·
  <a href="#機能">機能</a> ·
  <a href="#コマンドラインインターフェース">CLI</a> ·
  <a href="#ソースからの開発">開発</a> ·
  <a href="#トラブルシューティング">トラブルシューティング</a> ·
  <a href="#コントリビューション">コントリビューション</a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko-KR.md">한국어</a>
</p>

---

## 概要

AIVPlayer は Electron ベースのクロスプラットフォーム・デスクトップ動画ワークステーションです。ローカル動画再生、オフライン ASR 字幕、字幕翻訳、AI コンテンツ要約、ビジュアルメディアライブラリ、画像処理、AI ショートドラマのテキスト制作を一つのアプリにまとめています。

製品紹介、機能デモ、ダウンロードリンクは **[aivplayer.pages.dev](https://aivplayer.pages.dev/)** にあります。デスクトップ版は [GitHub Releases](https://github.com/ponponon/aivplayer/releases) からダウンロードできます。中国本土から GitHub へのアクセスが遅い場合は、[Gitee Releases](https://gitee.com/ponponon/aivplayer/releases) を利用してください。

### ローカルファーストと AI リクエストの境界

- 再生、メディア解析、字幕キャッシュ、ビジュアルライブラリのインデックス作成、大部分の処理はローカルで行います。
- ASR にはローカルの [whisper.cpp](https://github.com/ggerganov/whisper.cpp) エンジンを使用するため、動画をオンライン文字起こしサービスへアップロードする必要はありません。
- 字幕翻訳、コンテンツ要約、AI ショートドラマのテキスト生成には OpenAI 互換サービスの設定が必要です。有効にした場合、該当するテキストが設定したプロバイダーへ送信されます。
- ビジュアルメディアライブラリはローカルの SigLIP2 モデルと LanceDB にインデックスを保存します。元の動画や画像はアップロードされません。

## クイックスタート

### 1. ダウンロードとインストール

[製品サイト](https://aivplayer.pages.dev/) で機能を確認するか、以下のリリースページからプラットフォームに合ったインストーラーをダウンロードしてください。

- [GitHub Releases](https://github.com/ponponon/aivplayer/releases)
- [Gitee Releases](https://gitee.com/ponponon/aivplayer/releases)

macOS、Windows、Linux に対応しています。パッケージ形式と `aivcli` コマンドのインストール方法は[インストール](#インストール)を参照してください。

### 2. 動画を開く

インストール後、動画をウィンドウへドラッグするか、ファイルピッカーで開きます。プレイヤーはプレイリスト、再生履歴、レジューム、字幕トラック、クリップ書き出し、スクリーンショット、画面録画に対応しています。

### 3. 初回のローカル字幕生成

字幕パネルを開き、ガイドに従って whisper.cpp ランタイムと ASR モデルを準備します。モデルは ModelScope または Hugging Face からダウンロードできます。言語を選んで字幕を生成すると、結果はローカルにキャッシュされ、同じ動画を次回開いたときに再利用できます。

### 4. 必要に応じてクラウド AI を設定

字幕翻訳、コンテンツ要約、AI ショートドラマスタジオを利用する場合は、設定または該当パネルで OpenAI 互換 API を設定してください。API Key はローカルデバイスに安全に保存されます。CLI の `provider show/test` はマスク済みの状態だけを表示し、Key をコマンドライン引数に直接渡すことはできません。

## 機能

### 再生とメディア処理

- MP4、WebM、MOV、MKV、AVI、FLV、WMV、MPEG-TS、3GP、VOB、MXF、RMVB、MPEG elementary stream、F4V、OGM、NUT、DV、GXF、CAVS、Dirac、R3D、WTV、FLI/FLC、RoQ、Smacker、Motion JPEG、Bink、Y4M、raw H.264/H.265 stream など、一般的な形式とプロ向け形式に対応しています。ブラウザー非対応のメディアは自動変換でき、ドラッグ＆ドロップとプレイリストにも対応します。
- LAN 内限定の Web 再生を起動できます。Chrome、Firefox、Safari、スマートフォンのブラウザーから、デスクトップアプリが共有するプレイリストや選択したディレクトリへアクセスできます。メディアは HTTP Range でストリーミングされ、Web ページでディレクトリを更新して新しいファイルを見つけられます。複数のネットワークインターフェースがある端末では利用可能なアドレスとローカル QR コードを表示し、スマートフォンやタブレットではホーム画面に追加できます。
- LAN Web メディアライブラリはディレクトリツリー、検索、並べ替え、お気に入り、複数選択に対応します。選択したファイルを一括ダウンロードしたり、現在のディレクトリを ZIP にまとめたりできます。ZIP 内のディレクトリ構造は保持されます。
- LAN Web のディレクトリスキャンは一般的な画像形式にも対応します。画像はリスト / グリッドのメディアライブラリでプレビュー、お気に入り登録、リンクのコピー、ダウンロードができ、動画と同じディレクトリ閲覧・一括操作を利用できます。
- LAN Web にはセッション単位のタスクセンターがあり、動画変換の待機中、実行中、完了、失敗をまとめて表示します。失敗したタスクは直接再試行でき、タスクを選ぶと対応するメディアへ戻れます。
- ブラウザー非対応のメディアは、必要に応じてローカルで H.264 + AAC MP4 に変換できます。元ファイルは変更せず、変換結果は元ファイルのフィンガープリントでキャッシュします。
- LAN 上の複数端末から同時に変換を要求した場合、ローカルの並列数上限に従ってキューに入れ、複数の大きな動画でリソースを使い切らないようにします。
- 変換前にキャッシュ用ディスク容量を確認します。期限切れの結果や異常終了で残った一時ファイルは自動的に削除され、元ファイルを置き換えた後に古い互換版を誤って再利用することもありません。
- 再生履歴はローカルに保存され、レジューム、未視聴項目の絞り込み、無効ファイルの削除、コンテキストメニュー操作に対応します。再生状態はメディアフィンガープリントごとに保存されるため、置き換えられたファイルが古い進捗を誤って引き継ぐことはありません。
- 字幕トラック、音量、再生速度、フルスクリーン、キーボードショートカット、コントロールバーの自動非表示に対応します。再生終了時は停止、次の項目、現在の項目をループ、プレイリストをループ、シャッフルから選べます。コンテナチャプターとユーザーブックマークはタイムラインから直接選択できます。
- 15 秒、30 秒、60 秒のクリップを書き出せます。動画のみ、外部字幕ファイル付き、字幕焼き込みから選択できます。
- 現在の画面のスクリーンショット、タイマー付き画面録画、GIF 書き出しに対応し、保存先、形式、命名規則を設定できます。
- 再生時間、解像度、コーデック、フレームレート、ビットレート、音声トラック、字幕トラックなどのメディア情報を確認できます。

### ローカル AI 字幕とコンテンツ理解

- whisper.cpp によるローカル ASR。中国語、英語、日本語、韓国語などの多言語認識に対応します。
- VTT と SRT を同時に生成し、字幕キャッシュ、デフォルト言語、タイムライン調整、生成状態の確認を利用できます。
- OpenAI 互換サービスで字幕を翻訳できます。キャッシュ、再試行、キャンセル、用語集、対象言語の切り替えに対応します。
- ネタバレなし要約、詳細要約、チャプター、タイムラインジャンプを生成し、Markdown、TXT、JSON に書き出せます。
- AI ワークフローはガイド付き処理と一括処理に対応し、キャッシュ、キャンセル、再試行、途中再開を備えています。

### ビジュアルメディアライブラリ

- ローカル SigLIP2 モデルで動画を一定間隔ごとにフレーム抽出し、ベクトルをローカル LanceDB に保存します。
- テキスト説明、画像、テキスト・映像・ファイル名を組み合わせたハイブリッド検索に対応します。
- 検索結果には一致した字幕スニペットを表示でき、動画内の該当時点へ直接ジャンプできます。
- ローカル SigLIP2 で人物、車両、動物、バッグ、カメラ、コンピューター、スマートフォン、屋内 / 屋外などの固定語彙エンティティラベルを任意で生成できます。ネットワーク通信、人物の本人識別、物体の矩形検出は行いません。
- ローカルのエンティティラベルカタログでカスタム検索ラベルの作成、名前変更、別名追加、非表示、統合を行えます。次回のエンティティ索引と検索結果に適用されます。
- ディレクトリの再帰スキャン、増分インデックス、バックグラウンドのインデックスキュー、プレイリストの自動スキャン、インデックス進捗とフェーズ所要時間の表示に対応します。
- CLI でもスキャン、インデックス作成、状態確認、検索を実行でき、個人動画ライブラリの一括メンテナンスに適しています。

### AI ショートドラマテキストスタジオ

- ショートドラマプロジェクトを作成し、TXT / Markdown 小説から章を認識して繰り返しインポートできます。
- ストーリーイベント、ストーリー骨子、改編方針、エピソード脚本を生成し、各段階の結果をローカル SQLite に保存します。
- 脚本からキャラクター、シーン、プロップのアセットを抽出し、構造化された絵コンテを生成します。
- OpenAI 互換 Provider、ローカル Mock、接続テスト、タスク状態、キャッシュ、途中再開に対応します。
- 画像 / 動画 / 音声向けの独立した生成タスクキューを備え、待機中、実行中、進捗、完了、失敗、キャンセルを管理します。アプリ再起動後、実行中に中断されたタスクは待機中へ戻ります。
- ローカル結果パスを持つ完了タスクは、編集中のプロジェクトが開いていれば既存の編集タイムラインへ戻せます。既存の素材ソース、メイン軌道への追加、Undo / Redo、プロジェクト保存を再利用します。編集プロジェクトが開いていない場合、タイムラインは変更しません。
- 現在はテキスト企画と絵コンテに重点を置いており、特定の画像・動画生成ベンダーはまだ接続していません。

### 画像ワークスペース

- 複数画像のインポート、トリミング、回転、反転、一括処理に対応します。
- 形式、品質、目標サイズ圧縮、一括書き出し、上書きポリシーを設定できます。

### 言語とインターフェース

- 簡体字中国語、English、日本語、韓国語に対応します。
- コントロールバーが自動的に隠れる、ダークなシネマ風インターフェース。さまざまなウィンドウサイズに適応します。
- macOS はネイティブのウィンドウコントロール、Windows / Linux はアプリテーマに合わせたカスタムコントロールを使用します。

## コマンドラインインターフェース

インストーラーには `aivcli` コマンドが含まれます。CLI はデスクトップアプリと ASR、字幕キャッシュ、ビジュアルライブラリ、AI ショートドラマのデータを共有します。まずローカル環境を確認してください。

```bash
aivcli doctor
aivcli doctor --json
```

### メディアと字幕

```bash
aivcli media info ./movie.mp4
aivcli asr ./movie.mp4 --format both --output-dir ./subtitles
aivcli subtitle convert ./movie.vtt
aivcli subtitle translate ./movie.vtt --to zh --output-dir ./subtitles
```

### 編集プロジェクトの読み取り専用クエリ

`aivcli edit` はプロジェクト、メディア、字幕ファイルを変更しません。`inspect` は確認可能なタイムラインと字幕統計を出力し、`captions` は原文または翻訳文から脚本文を検索し、削除マーク済みの行も保持します。`propose` はプロジェクト revision 付きの構造化案だけを生成し、将来の確認フローに渡す前に人がレビューできます。

```bash
aivcli edit inspect ./project.aivproj --json
aivcli edit captions ./project.aivproj --query "間を削除" --limit 20 --json
aivcli edit propose delete-script ./project.aivproj segment-1 segment-2 --json
```

`edit propose delete-script` は削除する元時間区間、保持区間、影響を受ける脚本文、字幕の変更、予想再生時間を出力します。Proposal はプロジェクトスナップショットのフィンガープリントで stale チェックを行います。現在の CLI は JSON を生成するだけで、`.aivproj` へ書き戻しません。

デスクトップ編集で脚本文を削除すると、まず同じ Proposal プレビューを開き、確認後に編集履歴とローカルプロジェクトキャッシュへ書き込みます。Shift を押しながら脚本文を複数選択すると、一つの一括 Proposal を生成できます。確認前にプロジェクトが変わった場合は拒否され、新しい案の生成を求められます。

### ローカル編集 MCP

固定したプロジェクトをローカル stdio MCP として Agent に提供できます。デフォルトで公開するのは `inspect`、`captions`、`propose delete-script` の3つの読み取り専用ツールだけです。ネットワークポートを開かず、Proposal の適用、ファイル書き込み、メディア削除、シェル実行もできません。

```bash
aivcli mcp serve ./project.aivproj
```

MCP クライアント設定例:

```json
{
  "mcpServers": {
    "aivplayer-editing": {
      "command": "aivcli",
      "args": ["mcp", "serve", "/absolute/path/project.aivproj"]
    }
  }
}
```

プロジェクトパスはサービス起動時に固定されるため、Agent はツール引数で別ファイルへ切り替えられません。実際の適用はデスクトップの確認ダイアログに戻り、プロジェクト revision の検証を通す必要があります。

信頼できるローカル Agent から開いているデスクトップ編集画面へ Proposal を送り、確認する場合は `--desktop` を付けます。

```bash
aivcli mcp serve ./project.aivproj --desktop
```

デスクトップモードはユーザーごとの Unix socket（Windows は named pipe）と起動ごとに生成するトークンを使います。一致する `.aivproj` が開かれている場合だけ既存の確認ダイアログを表示し、拒否、期限切れ、キャンセル、revision の不一致を Agent に返します。直接 apply、ネットワーク待受、任意ファイル、メディア削除、シェル、Provider の認証情報は公開しません。`--bridge-manifest path` はデスクトップと CLI が意図的に異なるユーザーデータディレクトリを使う場合だけ指定してください。

### ビジュアルメディアライブラリ

```bash
aivcli library status
aivcli library scan ./Videos --recursive
aivcli library index ./Videos --recursive
aivcli library search "海辺のシーン"
aivcli library search --image ./reference.jpg
```

### 一括処理

```bash
aivcli batch ./Videos --recursive --asr --translate zh --index --output-dir ./subtitles
aivcli batch ./Videos --recursive --asr --translate zh --index --resume
```

`batch` は ASR、字幕翻訳、ビジュアルライブラリのインデックス作成を組み合わせます。デフォルトでは個別の動画が失敗しても処理を続け、状態を AIVPlayer のユーザーデータディレクトリに保存します。`--state-file ./batch-state.json` で状態ファイルを指定し、`--retry 0..5` で復旧可能なエラーの再試行回数を調整し、`--fail-fast` でエラー時に即時停止できます。中断後は同じ引数に `--resume` を付けて実行すると、成果物が残っている完了済みの段階をスキップします。

`--asr` なしで `--translate` だけを指定すると、CLI は動画の隣にある同名の `.vtt` ファイルを読み込みます。`--output-dir` を指定すると、翻訳字幕には `movie.zh.vtt` のような対象言語サフィックスが付き、原文字幕を上書きしません。主要コマンドは `--json` に対応しており、シェル、CI、その他の自動化へ接続できます。

### AI ショートドラマ

```bash
aivcli drama list
aivcli drama create "私のショートドラマ" --genre "ミステリー" --episodes 6
aivcli drama import <project-id> ./novel.txt
aivcli drama events generate <project-id>
aivcli drama plan generate <project-id> --stage skeleton
aivcli drama script generate <project-id> --episode 1
aivcli drama assets generate <project-id>
aivcli drama storyboard generate <project-id> --episode 1
aivcli drama provider show
aivcli drama provider test
```

全オプションは `aivcli --help`、`aivcli batch --help`、`aivcli drama --help` で確認できます。

## インストール

### システム要件

- **macOS**: 12.0 以降
- **Windows**: Windows 10 以降
- **Linux**: Ubuntu 18.04 または同等のディストリビューション

### インストーラーのダウンロード

[GitHub Releases](https://github.com/ponponon/aivplayer/releases) または [Gitee Releases](https://gitee.com/ponponon/aivplayer/releases) からプラットフォームに合ったパッケージをダウンロードしてください。

| プラットフォーム | パッケージ |
| --- | --- |
| macOS | `.dmg` / `.zip` / `.pkg` |
| Windows | `.exe`（NSIS インストーラー） |
| Linux | `.AppImage` / `.deb` |

Windows NSIS、macOS `.pkg`、Linux `.deb` は `aivcli` ランチャーをインストールし、システムのコマンドパスへ追加します。macOS `.dmg` / `.zip` と Linux `.AppImage` はポータブル形式で、PATH を自動変更しません。ポータブル形式ではアプリの `--cli` モードを直接起動するか、自分でコマンドラインランチャーを作成してください。

### 自動更新

正式版の Windows / Linux インストーラーは起動後に GitHub Releases をバックグラウンドで確認し、現在のプラットフォーム向けの新バージョンを自動ダウンロードします。ダウンロード完了後、ウィンドウ上部に「再起動して更新」ボタンが表示されます。クリックするまで終了・インストールは行われず、再生や編集中の作業を強制中断しません。macOS は Apple Developer ID の署名と公証が未設定のため、現在自動更新を有効にしていません。GitHub または Gitee から手動でダウンロードしてください。開発モードと `aivcli` は自動更新の対象外です。

自動更新にはリリースページの `latest*.yml` メタデータと対応するインストーラー / 更新パッケージが必要です。そのためリリース処理ではこれらをすべてアップロードしてください。GitHub Release 成功後、`GITEE_TOKEN` が設定された CI は同じインストーラーと更新メタデータを Gitee へ同期します。Secret がない場合、Gitee は手動ダウンロード用ミラーとして利用できますが、自動同期は行われません。

### ソースからビルド

```bash
git clone https://github.com/ponponon/aivplayer.git
cd aivplayer
npm install
npm run dev
```

Node.js 22.12.0 以降が必要です。ネットワーク環境によっては npm、ModelScope、Hugging Face へのアクセスにプロキシが必要です。

## トラブルシューティング

### 右クリックの「このアプリケーションで開く」で `Cannot find module 'apache-arrow'` が表示される

これは古いインストーラーが LanceDB のランタイム依存関係を同梱していなかったことによる起動問題です。動画ファイル名、外付けドライブのパス、MP4 エンコードが原因ではありません。現在の `v0.5.0` リリースには修正が含まれています。該当する Release のインストーラーをダウンロードし、アプリバンドル内へ npm 依存関係を手動でインストールしないでください。

現在のリリースは `v0.5.0` です。対応する Release のインストーラーを優先してください。

### 字幕生成に失敗する

まず実行します。

```bash
aivcli doctor
```

ソース開発環境の場合は、バックエンドと ASR ランタイムも個別に確認してください。

```bash
npm run doctor:backend
npm run doctor:asr
```

whisper.cpp、ASR モデル、ffmpeg が準備できていることを確認してください。macOS で GPU 初期化に失敗した場合、認識された Metal リソースエラーに対してアプリが自動的に CPU へフォールバックします。

### 翻訳、要約、ショートドラマ生成に失敗する

OpenAI 互換エンドポイント、モデル、Key が正しいことを確認し、該当パネルで接続テストを実行してください。API Key を Issue、スクリーンショット、ターミナルコマンド、コミットへ貼り付けないでください。問題を報告するときは、URL、Key、パス、完全なレスポンスを必ずマスクしてください。

### 問題を報告するときに添付する情報

- OS、AIVPlayer のバージョン、インストーラー形式;
- 再現手順、動画形式、外付けドライブを使ったかどうか;
- マスク済みの `aivcli doctor --json` 結果;
- エラーが発生したパネルまたは CLI コマンドと、Key を除いたログ断片。

[GitHub Issues](https://github.com/ponponon/aivplayer/issues) に Issue を作成するか、[製品サイト](https://aivplayer.pages.dev/) で最新機能とダウンロード情報を確認してください。

## ソースからの開発

### よく使うコマンド

```bash
npm run dev              # 開発モードを起動
npm run build            # 本番版をビルド
npm run preview          # ビルド結果をプレビュー
npm run pack             # インストーラーを作成せずパッケージ化
npm run dist             # インストーラーを作成

npm run typecheck        # TypeScript 型チェック
npm run test             # 単体テスト
npm run doctor:backend   # バックエンド依存関係を確認
npm run doctor:asr       # ASR ランタイムを確認
npm run smoke:all        # 主要 UI 回帰テスト
npm run smoke:web-format-matrix -- --ffmpeg /path/to/ffmpeg  # 実動画形式と Web 変換のマトリクス
npm run smoke:web-concurrency -- --ffmpeg /path/to/ffmpeg     # 複数クライアント、重複排除、変換キューの smoke
npm run smoke:web-real-file -- ./movie.mp4                     # 実ファイルの再生時間、末尾 Range、パッケージ済み Web smoke
```

ローカル ASR ランタイムを準備します。

```bash
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

### プロジェクト構成

```text
aivplayer/
├── src/
│   ├── desktop/         # Electron メインプロセスとデスクトップ連携
│   ├── core/            # デスクトップと CLI で共有する機能
│   │   ├── ai/          # ASR、翻訳、要約、ビジュアルライブラリ
│   │   ├── drama/       # AI ショートドラマのテキストワークフロー
│   │   └── media/       # メディア解析と書き出し
│   ├── preload/         # IPC ブリッジ
│   ├── renderer/        # React レンダラープロセス
│   └── shared/          # 共有型
├── resources/           # whisper.cpp、ffmpeg などのランタイムリソース
├── scripts/             # ビルド、診断、smoke ツール
├── tests/               # 単体テストと統合テスト
└── docs/                # Cloudflare Pages 製品サイト
```

### 技術スタック

| カテゴリ | 技術 |
| --- | --- |
| デスクトップフレームワーク | Electron |
| フロントエンドフレームワーク | React 19 |
| ビルドツール | Vite + electron-vite |
| 型システム | TypeScript |
| ローカル ASR | whisper.cpp |
| ビジュアル検索 | SigLIP2 + LanceDB + Apache Arrow |
| AI インターフェース | OpenAI-compatible Provider |
| テスト | Vitest + Playwright |
| パッケージング | electron-builder |

## コントリビューション

Issue と Pull Request を歓迎します。まず `FEATURE.md` と `FailureExperience.md` を読み、機能の境界とプロジェクトに記録された既知の注意点を確認してください。

1. リポジトリを Fork します。
2. `git switch -c feat/amazing-feature` のように機能ブランチを作成します。
3. ローカルの型チェックと関連テストを実行します。
4. [Conventional Commits](https://www.conventionalcommits.org/) に従って変更をコミットします。
5. ブランチを Push して Pull Request を作成します。

主なコミットタイプは `feat`、`fix`、`docs`、`refactor`、`test`、`chore` です。新機能は `FEATURE.md` に記録し、フィードバックをきっかけに修正した場合は、再利用できる知見を `FailureExperience.md` に記録してください。

## ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。

## 謝辞

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — ローカル音声認識エンジン
- [Electron](https://electronjs.org/) — クロスプラットフォームのデスクトップアプリフレームワーク
- [React](https://react.dev/) — UI フレームワーク
- [LanceDB](https://github.com/lancedb/lancedb) — ローカルベクトルデータベース
- [lucide-react](https://lucide.dev/) — アイコンライブラリ

<p align="center">
  AIVPlayer が役に立ったら、<a href="https://aivplayer.pages.dev/">製品サイト</a>をご覧いただくか、リポジトリに ⭐ Star をお願いします。
</p>
