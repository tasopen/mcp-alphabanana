# mcp-alphabanana

[English](README.md) | 日本語

Google Gemini AIを使用して画像アセットを生成するModel Context Protocol (MCP) サーバー。

[FastMCP 3](https://www.npmjs.com/package/fastmcp)で構築され、シンプルなコードベースと柔軟な出力オプションを提供します。

## 機能

- Google Gemini AIによる**汎用画像生成**
- カラーキー後処理による**透過PNG出力**
- **複数の出力形式**: ファイル、base64、または両方
- スタイル参照のための**参照画像サポート**
- **柔軟なリサイズモード**: crop、stretch、letterbox、contain
- **複数のモデルティア**: flash (Gemini 2.5 Flash) または pro (Gemini 3 Pro)

## インストール

```bash
npm install
npm run build
```

## 設定

`GEMINI_API_KEY` は MCP の設定（例: `mcp.json`）に設定してください。エージェント環境では OS 環境変数にアクセスできない場合があるため、`mcp.json` で OS 環境変数を参照するか、直接キーを設定することができます。

例:

- `mcp.json` で OS 環境変数を参照する:

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

- `mcp.json` に直接キーを記載する（エージェントが OS 環境変数を参照できない場合に有用）:

```json
{
  "env": {
    "GEMINI_API_KEY": "your_api_key_here"
  }
}
```

運用に合わせて選択してください（可能であれば環境参照を推奨）。

## VS Code 統合

VS Code 設定（`.vscode/settings.json` またはユーザー設定）に追加し、`mcp.json` の `env` を設定するか、VS Code の MCP 設定から環境変数を指定します。OS 環境変数を参照する場合と、直接キーを記載する場合の両方の例を示します。

```json
{
  "mcp": {
    "servers": {
      "mcp-alphabanana": {
        "type": "stdio",
        "command": "node",
        "args": ["c:/path/to/mcp-alphabanana/dist/index.js"],
        "env": {
          "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"  // or "your_api_key_here"
        }
      }
    }
  }
}
```

**重要:** 上記の `"args"` に指定したパスは、クローンした MCP サーバーのフォルダにある `dist/index.js`（またはビルドした `index.js`）の**絶対パス**に必ず置き換えてください。指定を変更しないとサーバーは起動しません。

フォールバック出力先をカスタマイズするには、`env` に `MCP_FALLBACK_OUTPUT` を追加してください。
## Antigravity（`mcp_config.json`）

Antigravity はグローバルな `mcp_config.json` を使用して MCP サーバーを登録します。例:

```json
{
  "mcpServers": {
    "mcp-alphabanana": {
      "command": "node",
      "args": ["C:/path/to/mcp-alphabanana/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

注: このリポジトリでは `mcp_config.json` を Antigravity 用として使用し、サーバーが起動して画像生成ができることを確認しました。

## Claude Desktop

Claude Desktop を使用する場合は、`claude_desktop_config.json` にエントリを追加します。例:

```json
{
  "mcpServers": {
    "mcp-alphabanana": {
      "command": "node",
      "args": ["C:/path/to/mcp-alphabanana/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

動作確認: 上記を Claude Desktop に追加して起動すると、MCP サーバーが起動し画像生成が動作しました。
### 環境変数

| 変数 | 必須 | 説明 |
|----------|----------|-------------|
| `GEMINI_API_KEY` | はい | Google AI Studio APIキー。`mcp.json` にて OS 環境変数を参照する（`${env:GEMINI_API_KEY}`）か、エージェント要件により直接キーを設定してください。 |
| `MCP_FALLBACK_OUTPUT` | いいえ | 書き込み失敗時のフォールバックディレクトリ (デフォルト: `<install-dir>/fallback-output`) |

### 出力パスのベストプラクティス

**常に `outputPath` には絶対パスを使用してください。**

✅ **良い例:** `"C:/Users/you/project/assets"`, `"/home/user/images"`  
❌ **悪い例:** `"./"`, `"output/"`, `"../images"`

相対パスは MCP サーバーの作業ディレクトリから解決されるため、サービス実行時に予期しない場所にファイルが作成される可能性があります。

**フォールバック動作:**
- 指定した `outputPath` が書き込み可能な場合 → 通常通り画像を保存
- 書き込み不可の場合（パーミッション拒否など） → `MCP_FALLBACK_OUTPUT` または `<install-dir>/fallback-output` に保存し、レスポンスに `warning` を含める
- フォールバックも失敗した場合 → エラーを返す

## 開発

```bash
# MCP CLIで開発モード
npm run dev

# MCP Inspector (Web UI)
npm run inspect

# 本番用ビルド
npm run build
```

## ツール: generate_image

オプションの透過処理と参照画像を使用してGemini AIで画像アセットを生成します。

### パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `prompt` | string | *必須* | 生成する画像の説明 |
| `outputFileName` | string | *必須* | 出力ファイル名（拡張子がない場合は自動追加） |
| `outputType` | enum | `combine` | 出力形式: `file`、`base64`、または`combine` |
| `modelTier` | enum | *必須* | モデル: `flash` (Gemini 2.5 Flash, 最大3参照) または `pro` (Gemini 3 Pro, 最大14参照) |
| `sourceResolution` | enum | `1K` | Gemini生成解像度: `1K`、`2K`、または`4K` (2K/4Kはproのみ) |
| `outputWidth` | number | `1024` | 出力幅（ピクセル、8-4096） |
| `outputHeight` | number | `1024` | 出力高さ（ピクセル、8-4096） |
| `outputFormat` | enum | `png` | 出力形式: `png`または`jpg` |
| `outputPath` | string | *任意* | 絶対パスの出力ディレクトリ（ファイル保存時は必須） |
| `transparent` | boolean | `false` | 透過背景をリクエスト（PNGのみ） |
| `transparentColor` | string | `null` | 透明にする色（例: `#FF00FF`） |
| `colorTolerance` | number | `30` | 透過色マッチングの許容範囲（0-255） |
| `fringeMode` | enum | `auto` | フリンジ処理: `auto`、`crisp`、`hd`（autoは128px以下で`crisp`、それ以外は`hd`） |
| `resizeMode` | enum | `crop` | リサイズモード: `crop`、`stretch`、`letterbox`、または`contain` |
| `referenceImages` | array | `[]` | スタイルガイダンス用の参照画像（ファイルパス） |
| `debug` | boolean | `false` | デバッグモード: 中間画像を出力 |

### 使用例

#### 基本的な生成

```json
{
  "prompt": "ピクセルアートの宝箱、金の装飾、木の質感",
  "modelTier": "flash",
  "outputFileName": "chest",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true
}
```

#### 透過 + フリンジ制御

```json
{
  "prompt": "アニメ調 自転車に乗った少女",
  "modelTier": "flash",
  "outputFileName": "bicycle_girl",
  "outputWidth": 1024,
  "outputHeight": 576,
  "transparent": true,
  "colorTolerance": 30,
  "fringeMode": "crisp"
}
```

#### 高解像度背景

```json
{
  "prompt": "夕暮れのファンタジーの森、光る茸",
  "outputFileName": "forest_bg",
  "modelTier": "pro",
  "sourceResolution": "4K",
  "outputWidth": 3840,
  "outputHeight": 2160,
  "outputFormat": "jpg",
  "outputPath": "C:/Users/you/project/assets/backgrounds"
}
```

#### 参照画像を使用

```json
{
  "prompt": "同じピクセルアートスタイルで、開いた状態の宝箱",
  "modelTier": "flash",
  "outputFileName": "chest_open",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true,
  "referenceImages": [
    {
      "description": "スタイル参照用の閉じた宝箱",
      "filePath": "C:/Users/you/project/assets/references/chest_closed.png"
    }
  ]
}
```

## 出力タイプ

| タイプ | ファイル保存 | Base64返却 | MCP画像コンテンツ |
|------|-----------|----------------|-------------------|
| `file` | ✓ | ✗ | ✗ |
| `base64` | ✗ | ✓ | ✓ |
| `combine` | ✓ | ✓ | ✓ |

## 透過処理

サーバーはヒストグラム分析と色相近接により背景色を推定し、RGB距離でキー抜きを行います。

### モデルメモ

- 透過PNGはFlashで十分運用可能です。
- `colorTolerance` は 30 前後が最も安定でした。高すぎると誤検出が増えます。

### 推奨背景色

| 色 | 16進数 | 最適な用途 |
|-------|-----|----------|
| マゼンタ | `#FF00FF` | ほとんどのスプライト（デフォルト、両モデルで動作） |
| 緑 | `#00FF00` | 紫/ピンクのオブジェクト |
| シアン | `#00FFFF` | 赤/オレンジのオブジェクト |
| 青 | `#0000FF` | 黄/緑のオブジェクト |

### 例

**Flashモデル（透過PNG推奨）:**
```json
{
  "modelTier": "flash",
  "transparent": true,
  "transparentColor": "#FF00FF",
  "colorTolerance": 30
}
```

### FringeModeの目安

- ドット絵・スポーク・ネットのような細い線がある場合は `crisp`
- 高解像度の一般的な画像は `hd`
- `auto` は128pxを境に `crisp` / `hd` を切り替え

## ライセンス

MIT
