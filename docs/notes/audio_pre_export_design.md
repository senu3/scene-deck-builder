# Audio整備 + Export前提仕様（現行）

**目的**: AudioモデルとExport前提の音声仕様を、実装中ラインに絞って管理する。  
**最終更新**: 2026-02-11

## ライン位置
- Workstream: **Line A (Audio Model / Routing)**
- Workstream履歴: `docs/notes/archive/export-workstreams-implemented-2026-02-11.md`
- 実装済みアーカイブ: `docs/notes/archive/audio_pre_export_design-implemented-2026-02-11.md`

## 現在地
- 基本モデル（`Cut.audioBindings` / `useEmbeddedAudio`）は実装済み。
- 以後は Export 実装に必要な差分のみを進める。

## 完了済み（2026-02-11）
1. metadata attachedAudio 残骸の削除
- 実施:
  - `src/types/index.ts` から `AssetMetadata.attachedAudio*` を削除
  - `src/utils/metadataStore.ts` から attachedAudio系APIを削除
  - `src/utils/assetRefs.ts` から `attached-audio` 参照を削除
- 結果:
  - AttachAudio 正経路は `Cut.audioBindings` のみに統一

## メモ（タスク化保留）
1. AttachAudio ON/OFF UI の最小導入案
- 方針メモ:
  - 新規状態を増やさず `audioBindings[].enabled` を切り替える
- 現状メモ:
  - `audioBindings[]` は拡張可能な型だが、操作系は primary（先頭要素）前提が中心。
  - Preview/export 側は `enabled !== false` を参照済みで、UI追加時の受け皿は存在する。

## 中止事項
1. Export向け音声出力仕様の最終確定（`audio_master.wav` / `audio_lipsync.wav`）
- 判断:
  - 現フェーズでは中止し、MP4エクスポート本線には含めない。

## 依存関係
- Line B（MP4 export）に `kind` と `enabled/useEmbeddedAudio` の意味を提供。
- Line C（命名）に audio用語の最終表記を追従。

## 注意
- 実装済み事項の再説明はアーカイブへ寄せる。
- このファイルには「次に実装すること」だけを書く。
