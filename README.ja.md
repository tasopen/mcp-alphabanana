# mcp-alphabanana

English | [日本語](README.ja.md)

Google Gemini AI（Gemini 3.1 Flash/Nano Banana 2対応）で画像アセットを生成する Model Context Protocol (MCP) サーバー。

[FastMCP 3](https://www.npmjs.com/package/fastmcp) で構築され、シンプルなコードベースと柔軟な出力オプションを提供します。

## 機能

- **超高速画像生成**（Gemini 3.1 Flash、0.5K/1K/2K/4K）
- **高度なマルチ画像推論**（最大14枚の参照画像）
- **Thinking/Grounding対応**（Flash3.1のみ）
- **透過PNG/WebP出力**（カラーキー+デスピル）
- **複数の出力形式**: ファイル、base64、または両方
- **柔軟なリサイズモード**: crop、stretch、letterbox、contain
- **複数のモデルティア**: Flash3.1、Flash2.5、Pro3、レガシーエイリアス

## インストール

`@tasopen/mcp-alphabanana` を MCP サーバー設定に追加してください。

## 設定

`GEMINI_API_KEY` を MCP 設定（例: `mcp.json`）で設定します。

例:

- `mcp.json` で OS 環境変数を参照:

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

```bash
# 開発モード（MCP CLI）
npm run dev

# MCP Inspector (Web UI)
    }

# 本番用ビルド
npm run build
```

## ライセンス

MIT
  ]
}
```

---

## 透過・出力形式

- **PNG**: 完全アルファ、カラーキー+デスピル
- **WebP**: 完全アルファ、高圧縮（Flash3.1+）
- **JPEG**: 透過なし（不透明背景にフォールバック）

---

## 開発

```bash
# 開発モード（MCP CLI）
#### 透過 + フリンジ制御

# MCP Inspector (Web UI)


# 本番用ビルド
npm run build
```

## ライセンス

MIT
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
