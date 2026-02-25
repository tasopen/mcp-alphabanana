# mcp-alphabanana

English | [日本語](README.ja.md)

Google Gemini AI を使って画像アセットを生成する Model Context Protocol (MCP) サーバー。

[FastMCP 3](https://www.npmjs.com/package/fastmcp) で構築され、シンプルなコードベースと柔軟な出力オプションを提供します。

## 機能

- **Google Gemini AI による汎用画像生成**
- **カラーキー後処理による透過 PNG 出力**
- **複数の出力形式**: ファイル、base64、または両方
- **スタイル参照のための参照画像サポート**
- **柔軟なリサイズモード**: crop、stretch、letterbox、contain
- **複数のモデルティア**: flash (Gemini 2.5 Flash) または pro (Gemini 3 Pro)

## インストール

`@tasopen/mcp-alphabanana` を MCP サーバー設定に追加してください。

## 設定

`GEMINI_API_KEY` を MCP 設定（例: `mcp.json`）で設定します。一部のエージェント環境では OS 環境変数にアクセスできないため、`mcp.json` で OS 環境変数を参照するか、直接キーを記載できます。

例:

- `mcp.json` で OS 環境変数を参照:

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

- `mcp.json` に直接キーを記載（エージェントが OS 環境変数を参照できない場合に有用）:

```json
{
  "env": {
    "GEMINI_API_KEY": "your_api_key_here"
  }
}
```

運用に合わせて選択してください（可能であれば環境参照を推奨）。

## VS Code 統合

VS Code 設定（`.vscode/settings.json` またはユーザー設定）に追加し、サーバー `env` を `mcp.json` または VS Code MCP 設定で設定します。OS 環境変数参照または直接キー記載の両方に対応:

```json
{
  "mcp": {
    "servers": {
      "mcp-alphabanana": {
        "command": "npx",
        "args":["-y", "@tasopen/mcp-alphabanana"],
        "env": {
          "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"  // or "your_api_key_here"
        }
      }
    }
  }
}
```

**オプション:** 書き込み失敗時のカスタムフォールバックディレクトリを指定する場合は `MCP_FALLBACK_OUTPUT` を `env` に追加してください。

## Antigravity (mcp_config.json)

Antigravity ではグローバルな `mcp_config.json` で MCP サーバーを登録します。例:

```json
{
  "mcpServers": {
    "mcp-alphabanana": {
      "command": "npx",
      "args": ["-y", "@tasopen/mcp-alphabanana"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

注: このリポジトリでは `mcp_config.json` に `mcp-alphabanana` エントリ（Antigravity）を追加し、サーバー起動と画像生成の動作を確認しています。

## Claude Desktop

Claude Desktop で MCP サーバーを動かす場合は `claude_desktop_config.json` にエントリを追加:

```json
{
  "mcpServers": {
    "mcp-alphabanana": {
      "command": "npx",
      "args": ["-y", "@tasopen/mcp-alphabanana"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

テスト済み: 上記エントリを Claude Desktop に追加しサーバーを起動すると、MCP サーバーが起動し画像生成が動作しました。

### 環境変数

| 変数 | 必須 | 説明 |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio APIキー。`mcp.json` で OS 環境変数参照（`${env:GEMINI_API_KEY}`）または直接キー記載（エージェントが OS 環境変数にアクセス不可な場合） |
| `MCP_FALLBACK_OUTPUT` | No | 書き込み失敗時のフォールバックディレクトリ（デフォルト: `<install-dir>/fallback-output`） |

### 出力パスのベストプラクティス

**常に `outputPath` には絶対パスを使ってください:**

✅ 良い例: "C:/Users/you/project/assets", "/home/user/images"  
❌ 悪い例: `"./"`, `"output/"`, `"../images"`

相対パスは MCP サーバーの作業ディレクトリから解決されるため、サービス実行時に予期しない場所にファイルが作成される可能性があります。

**フォールバック動作:**
- 指定した `outputPath` が書き込み可能 → 通常通り画像を保存
- 書き込み不可（パーミッション拒否など） → フォールバックディレクトリに保存しレスポンスに `warning` を含める
- フォールバックも失敗した場合 → エラーを返す

## 開発

```bash
# 開発モード（MCP CLI）
npm run dev

# MCP Inspector (Web UI)
npm run inspect

# 本番用ビルド
npm run build
```

## ツール: generate_image

Gemini AI で画像アセットを生成（オプションで透過・参照画像対応）。

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
| `transparentColor` | string | `null` | 透過にする色（例: `#FF00FF`、未指定時は #FF00FF） |
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

#### 透過スプライト

```json
{
  "prompt": "レトロゲーム風の宇宙戦闘機スプライト、青みがかった銀色、輪郭がはっきり、背景なし、文字・数字・ロゴを含めない",
  "modelTier": "flash",
  "outputFileName": "space_fighter",
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

サーバーはヒストグラム分析と色相近接により背景色を推定し、RGB距離でキー抜きを行いデスピルします。候補がなければ最も近い色相のコーナーカラーを使用します。

### モデルメモ

- 透過 PNG 出力は通常 flash で十分です。
- `colorTolerance` は 30 前後が最も安定しました。高すぎると誤検出が増えます。

### 推奨背景色

| 色 | 16進数 | 最適な用途 |
|-------|-----|----------|
| マゼンタ | `#FF00FF` | ほとんどのスプライト（デフォルト、両モデルで動作） |
| 緑 | `#00FF00` | 紫/ピンクのオブジェクト |
| シアン | `#00FFFF` | 赤/オレンジのオブジェクト |
| 青 | `#0000FF` | 黄/緑のオブジェクト |

### 例

```json
{
  "transparent": true,
  "transparentColor": "#00FF00",
  "colorTolerance": 30
}
```

### Fringe Mode ガイド

- 細い線が消えやすい場合（ドット絵、スポーク、ワイヤーメッシュ等）は `crisp`
- 高解像度画像でフリンジが目立つ場合は `hd`
- `auto` はサイズで自動切替（128px 以下は `crisp`、それ以外は `hd`）

## ライセンス

MIT
