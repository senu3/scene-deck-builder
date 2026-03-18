# Scene Deck Builder

動画制作のためのアセット管理・ストーリーボード編集アプリです。  
素材をシーン／カット単位で整理しながら、映像全体の流れをリアルタイムにプレビューして制作を進められます。

## アプリ概要

- **1プロジェクト＝1本の動画** として管理します
- Storyline（カンバン型 UI）でシーンとカットを視覚的に編集できます
- 下部のプレビューで単体再生とシーケンス再生を切り替えて確認できます
- ワークスペース（Vault）とローカルフォルダを同期して運用します

## 主な機能

### ローカル同期型のアセット管理

- ワークスペースは `vault/` 配下の実フォルダと同期します
- アセットは `vault/assets` に保存され、`assets/.index.json` で一元管理されます
- 表示時間、音声解析、シーンノートなどの付随情報は `.metadata.json` に保存されます
- 削除したアセットは `.trash/.trash.json` で管理され、あとから復元できます

### Storyline 編集（シーン／カット）

- シーンを横軸、カットを縦方向に配置して全体の構成を編集できます
- 画像や動画アセットをドラッグ＆ドロップで投入できます
- カットの移動、複数選択での一括移動、グループ化に対応しています
- Timeline の構造変更は Command パターンを通じて処理され、Undo／Redo の整合性が維持されます

### プレビュー（シミュレーション）

- Single Mode（単体再生）と Sequence Mode（シーケンス再生）の 2 つのモードを備えています
- 画像と動画が混在したシーケンスもそのままプレビューできます
- シーン単位・全体単位の流れをその場で確認できます
- キーボードショートカット（`Space`, `←/→`, `F`, `Esc`）で素早く操作できます

### エクスポート

- MP4 形式でのエクスポートに対応しています
- `manifest.json` / `timeline.txt` をサイドカーファイルとして出力します
- プレビューとエクスポートでフレーミングの解決ロジックを統一しています

### 自動保存

- プロジェクトの変更を監視し、デバウンス処理を挟んで `project.sdp` に自動保存します
- アプリ終了時には保存完了を待ってから終了します

## 技術スタック

- Electron
- React 18
- TypeScript
- Zustand
- dnd-kit
- Vite
- Vitest

## セットアップ

### 前提条件

- Node.js 18 以上
- npm

### インストールと起動

```bash
npm install
npm run build:electron
npm run dev
```

### 主な開発コマンド

```bash
npm run dev:renderer   # Renderer プロセスの開発サーバー起動
npm run dev:main       # Main プロセスの開発モード起動
npm run build          # プロダクションビルド
npm run preview        # ビルド結果のプレビュー
npm test               # テスト実行
```

## ディレクトリ構成

```text
scene-deck-builder/
├── electron/           # Electron Main / Preload
├── src/                # React Renderer
├── dist/               # ビルド出力
└── package.json
```

## ライセンス

MIT
