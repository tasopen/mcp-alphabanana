# mcp-alphabanana

[English](README.md) | 日本語  
![alphabanana-image](./alphabanana.gif)  
Google Gemini AI（Gemini 3.1 Flash / Nano Banana 2 対応）で画像アセットを生成する Model Context Protocol (MCP) サーバーです。

[FastMCP 3](https://www.npmjs.com/package/fastmcp) で構築されており、シンプルなコードベースと柔軟な出力オプションを提供します。

## 主な機能

- **超高速画像生成**（Gemini 3.1 Flash、0.5K/1K/2K/4K）
- **高度なマルチ画像推論**（参照画像を最大 14 枚）
- **Thinking / Grounding 対応**（Flash3.1 のみ）
- **透過 PNG / WebP 出力**（カラーキー後処理 + デスピル）
- **複数の出力形式**: file / base64 / combine
- **柔軟なリサイズモード**: crop / stretch / letterbox / contain
- **複数モデルティア**: Flash3.1 / Flash2.5 / Pro3 / 互換エイリアス

## インストール

`@tasopen/mcp-alphabanana` を MCP サーバー設定に追加してください。

## 設定

`GEMINI_API_KEY` を MCP 設定（例: `mcp.json`）で指定します。

例:

- `mcp.json` で OS 環境変数を参照する場合

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

- `mcp.json` に直接キーを記載する場合

```json
{
  "env": {
    "GEMINI_API_KEY": "your_api_key_here"
  }
}
```

## VS Code 連携

VS Code 設定（`.vscode/settings.json` またはユーザー設定）に追加してください。`env` は `mcp.json` もしくは VS Code MCP 設定経由で指定できます。

```json
{
  "mcp": {
    "servers": {
      "mcp-alphabanana": {
        "command": "npx",
        "args": ["-y", "@tasopen/mcp-alphabanana"],
        "env": {
          "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
        }
      }
    }
  }
}
```

**任意:** 書き込み失敗時の保存先を変更したい場合は、`env` に `MCP_FALLBACK_OUTPUT` を追加してください。

## モデル選択とパラメータ

| 入力モデルID | 内部モデルID | 説明 |
| --- | --- | --- |
| `Flash3.1` | `gemini-3.1-flash-image-preview` | 超高速。Thinking / Grounding 対応。 |
| `Flash2.5` | `gemini-2.5-flash-image` | 旧 Flash 系。安定性高め。低コスト。 |
| `Pro3` | `gemini-3.0-pro-image-preview` | 高品質な Pro モデル。 |
| `flash` | `gemini-3.1-flash-image-preview` | 後方互換エイリアス。 |
| `pro` | `gemini-3.0-pro-image-preview` | 後方互換エイリアス。 |

### パラメータ（v2.0）

| パラメータ | 型 | 既定値 | 説明 |
|-----------|------|---------|-------------|
| `prompt` | string | 必須 | 生成したい画像の説明 |
| `model` | enum | `Flash3.1` | `Flash3.1` / `Flash2.5` / `Pro3` / `flash` / `pro` |
| `output_resolution` | enum | `1K` | `0.5K` / `1K` / `2K` / `4K`（0.5K/2K/4K は Flash3.1 のみ） |
| `output_format` | enum | `png` | `png` / `jpg` / `webp`（WebP はアルファ対応） |
| `transparent` | boolean | `false` | 背景透過（PNG / WebP のみ） |
| `grounding_type` | enum | `none` | `none` / `text` / `image` / `both`（Flash3.1 のみ） |
| `thinking_mode` | enum | `minimal` | `minimal` / `high`（Flash3.1 のみ） |
| `include_thoughts` | boolean | `false` | モデルの思考データを返却（Flash3.1 のみ） |
| `include_metadata` | boolean | `false` | JSON 出力に grounding / reasoning メタデータを含める |
| `reference_images` | array | `[]` | 最大 14 枚（Flash3.1/Pro3）、Flash2.5 は 3 枚 |

---

## 使用例

#### 基本生成

```json
{
  "prompt": "金の縁取りがある木製のピクセルアート宝箱",
  "model": "Flash3.1",
  "outputFileName": "chest",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true
}
```

#### 応用例（WebP + Thinking + Grounding）

```json
{
  "prompt": "ヨーロッパの田園風景の上を飛ぶ翼のある少女、フォトリアル",
  "model": "Flash3.1",
  "outputFileName": "girl_wings",
  "outputWidth": 632,
  "outputHeight": 424,
  "output_format": "webp",
  "thinking_mode": "high",
  "grounding_type": "both",
  "include_thoughts": true
}
```

#### Grounding サンプル（検索連携）

```json
{
  "prompt": "クアラルンプールの今日の天気と主要スカイラインを盛り込んだモダンな旅行ポスター",
  "model": "Flash3.1",
  "outputFileName": "kl_travel_poster",
  "outputWidth": 1024,
  "outputHeight": 1024,
  "grounding_type": "text",
  "thinking_mode": "high",
  "include_metadata": true,
  "include_thoughts": true
}
```

このサンプルでは Google Search Grounding を有効化し、JSON に grounding / reasoning メタデータを返します。

#### 参照画像つき生成

```json
{
  "prompt": "参照画像と同じピクセルアート調で、開いた状態の宝箱",
  "model": "Pro3",
  "outputFileName": "chest_open",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true,
  "reference_images": [
    {
      "description": "Closed chest for style reference",
      "data": "...base64..."
    }
  ]
}
```

---

## 透過と出力形式

- **PNG**: 完全アルファ対応、カラーキー + デスピル
- **WebP**: 完全アルファ対応、より高い圧縮効率
- **JPEG**: 透過非対応（不透明背景にフォールバック）

---

## 開発

```bash
# 開発モード（MCP CLI）
npm run dev

# MCP Inspector（Web UI）
npm run inspect

# 本番ビルド
npm run build
```

## ライセンス

MIT
