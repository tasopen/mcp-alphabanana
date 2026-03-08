# mcp-alphabanana

[![npm version](https://img.shields.io/npm/v/@tasopen/mcp-alphabanana)](https://www.npmjs.com/package/@tasopen/mcp-alphabanana)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 日本語

mcp-alphabanana は、Google Gemini を使って画像アセットを生成する Model Context Protocol (MCP) サーバーです。高速な画像生成・透過出力・参照画像ガイダンス・柔軟な出力形式を必要とする MCP 対応クライアントやエージェントワークフロー向けに設計されています。

キーワード: MCP サーバー、Model Context Protocol、Gemini AI、画像生成、FastMCP

主な特長:
- Gemini Flash / Pro を使ったウルトラ高速画像生成
- Web・ゲームパイプライン向けの透過 PNG / WebP アセット出力
- ローカル参照画像を使ったマルチ画像スタイルガイダンス
- エージェントワークフロー向けの file / base64 / combine 出力

![alphabanana demo](alphabanana.gif)

## クイックスタート

npx で MCP サーバーを起動:

```bash
npx -y @tasopen/mcp-alphabanana
```

または MCP 設定ファイルに追加:

```json
{
  "mcp": {
    "servers": {
      "alphabanana": {
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

起動前に `GEMINI_API_KEY` を設定してください。

## MCP サーバーについて

このリポジトリは、AI エージェントが Google Gemini を使って画像を生成できる MCP サーバーを提供します。

以下のような MCP 対応クライアントで利用できます:

- Claude Desktop
- VS Code MCP
- Cursor

[FastMCP 3](https://www.npmjs.com/package/fastmcp) を使ってシンプルなコードベースと柔軟な出力オプションを実現しています。

## 利用可能なツール

### generate_image

透過処理・ローカル参照画像・Grounding・Reasoning メタデータを任意で指定しながら、Google Gemini で画像を生成します。

主なパラメータ:

- `prompt` (string): 生成したい画像の説明
- `model`: `Flash3.1`、`Flash2.5`、`Pro3`、`flash`、`pro`
- `outputWidth` / `outputHeight`: 出力画像のピクセルサイズ
- `output_resolution`: `0.5K`、`1K`、`2K`、`4K`
- `output_format`: `png`、`jpg`、`webp`
- `outputType`: `file`、`base64`、`combine`
- `outputPath`: `outputType` が `file` または `combine` の場合に必須
- `transparent`: 透過 PNG / WebP 後処理を有効化
- `referenceImages`: ローカル参照画像ファイルの配列（任意）
- `grounding_type` / `thinking_mode`: Gemini 3.1 の高度な制御

### モデル選択

| 入力モデルID | 内部モデルID | 説明 |
| --- | --- | --- |
| `Flash3.1` | `gemini-3.1-flash-image-preview` | 超高速。Thinking / Grounding 対応。 |
| `Flash2.5` | `gemini-2.5-flash-image` | 旧 Flash 系。安定性高め。低コスト。 |
| `Pro3` | `gemini-3.0-pro-image-preview` | 高品質な Pro モデル。 |
| `flash` | `gemini-3.1-flash-image-preview` | 後方互換エイリアス。 |
| `pro` | `gemini-3.0-pro-image-preview` | 後方互換エイリアス。 |

### パラメータ

`generate_image` ツールの全パラメータ一覧。

| パラメータ | 型 | 既定値 | 説明 |
|-----------|------|---------|-------------|
| `prompt` | string | 必須 | 生成したい画像の説明 |
| `outputFileName` | string | 必須 | 出力ファイル名（拡張子がなければ自動付与） |
| `outputType` | enum | `combine` | `file`、`base64`、または `combine` |
| `model` | enum | `Flash3.1` | `Flash3.1` / `Flash2.5` / `Pro3` / `flash` / `pro` |
| `output_resolution` | enum | auto | `0.5K` / `1K` / `2K` / `4K`（0.5K/2K/4K は Flash3.1 のみ） |
| `outputWidth` | integer | 必須 | 出力幅（ピクセル） |
| `outputHeight` | integer | 必須 | 出力高さ（ピクセル） |
| `output_format` | enum | `png` | `png` / `jpg` / `webp` |
| `outputPath` | string | `file` / `combine` 時に必須 | 出力ディレクトリの絶対パス |
| `transparent` | boolean | `false` | 背景透過（PNG / WebP のみ） |
| `transparentColor` | string または null | `null` | 透過カラーキーの上書き指定 |
| `colorTolerance` | integer | `30` | 透過カラーのマッチング許容範囲 |
| `fringeMode` | enum | `auto` | `auto` / `crisp` / `hd` |
| `resizeMode` | enum | `crop` | `crop` / `stretch` / `letterbox` / `contain` |
| `grounding_type` | enum | `none` | `none` / `text` / `image` / `both`（Flash3.1 のみ） |
| `thinking_mode` | enum | `minimal` | `minimal` / `high`（Flash3.1 のみ） |
| `include_thoughts` | boolean | `false` | メタデータ有効時にモデルの推論フィールドを返す |
| `include_metadata` | boolean | `false` | JSON 出力に grounding / reasoning メタデータを含める |
| `referenceImages` | array | `[]` | 最大 14 ファイル（Flash3.1/Pro3）、Flash2.5 は 3 枚 |
| `debug` | boolean | `false` | デバッグ用途の中間ファイルを保存 |

## mcp-alphabanana を選ぶ理由

- **ウォーターマークなし:** API ネイティブ生成によるクリーンな画像。
- **Thinking / Grounding 対応:** 複雑なプロンプトへの忠実度向上と検索連携による正確な描写。
- **即戦力の出力仕様:** 透過 WebP と正確なアスペクト比に対応し、Web・ゲーム素材としてそのまま使用可能。

## 主な機能

- **超高速画像生成**（Gemini 3.1 Flash、0.5K/1K/2K/4K）
- **高度なマルチ画像推論**（参照画像を最大 14 枚）
- **Thinking / Grounding 対応**（Flash3.1 のみ）
- **透過 PNG / WebP 出力**（カラーキー後処理 + デスピル）
- **複数の出力形式**: file / base64 / combine
- **柔軟なリサイズモード**: crop / stretch / letterbox / contain
- **複数モデルティア**: Flash3.1 / Flash2.5 / Pro3 / 互換エイリアス

## 出力サンプル

mcp-alphabanana で生成したサンプルを [examples](examples) に収録しています。

| ピクセルアートアセット | 参照画像を使ったゲームシーン | フォトリアル生成 |
| --- | --- | --- |
| ![ピクセルアート宝箱](examples/pixel-art-treasure-chest.png) | ![参照画像ダンジョン報酬シーン](examples/reference-image-dungeon-loot.webp) | ![フォトリアル旅行ポスター](examples/photoreal-travel-poster.jpg) |

## 設定

`GEMINI_API_KEY` を MCP 設定（例: `mcp.json`）で指定します。

例:

- `mcp.json` で OS 環境変数を参照する場合:

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

- `mcp.json` に直接キーを記載する場合:

```json
{
  "env": {
    "GEMINI_API_KEY": "your_api_key_here"
  }
}
```

### VS Code 連携

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

## 使用例

#### 基本生成

```json
{
  "prompt": "金の縁取りがある木製のピクセルアート宝箱",
  "model": "Flash3.1",
  "outputFileName": "chest",
  "outputType": "base64",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true
}
```

#### 応用例（縦型ポスター + Thinking）

```json
{
  "prompt": "ヨーロッパの黄金色の夕暮れの田園風景の上を翼を広げた若いカップルが手をつないで飛ぶ、縦型フォトリアル旅行ポスター。ブドウ畑・村・森・川・丘の上の中世の城が広がる風景。上部に大きな見出し FLY THE COUNTRYSIDE、下部に Magical Wings Day Tours のブランド表記。",
  "model": "Flash3.1",
  "output_resolution": "1K",
  "outputFileName": "photoreal-travel-poster",
  "outputType": "file",
  "outputPath": "/path/to/output",
  "outputWidth": 848,
  "outputHeight": 1264,
  "output_format": "jpg",
  "thinking_mode": "high",
  "include_metadata": true
}
```

#### Grounding サンプル（検索連携）

```json
{
  "prompt": "クアラルンプールの今日の天気と主要スカイラインを盛り込んだモダンな旅行ポスター",
  "model": "Flash3.1",
  "outputFileName": "kl_travel_poster",
  "outputType": "base64",
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
  "prompt": "参照画像を使って、コインと財宝で満たされた開いた宝箱を映すゲーム画面を生成して。8ビットダンジョンクローラーのスタイル、バトル報酬シーン、ダンジョン回廊の背景、画面下部に4人パーティのステータスUI",
  "model": "Flash3.1",
  "output_resolution": "0.5K",
  "outputFileName": "reference-image-dungeon-loot",
  "outputType": "file",
  "outputPath": "/path/to/output",
  "outputWidth": 600,
  "outputHeight": 448,
  "output_format": "webp",
  "transparent": false,
  "referenceImages": [
    {
      "description": "宝箱のスタイル参照",
      "filePath": "/path/to/references/pixel-art-treasure-chest.png"
    }
  ]
}
```

## 透過と出力形式

- **PNG**: 完全アルファ対応、カラーキー + デスピル
- **WebP**: 完全アルファ対応、より高い圧縮効率（Flash3.1 以降）
- **JPEG**: 透過非対応（不透明背景にフォールバック）

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
