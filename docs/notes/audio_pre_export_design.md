# Audio整備 + Export前提仕様（現行）

**目的**: AudioモデルとExport前提の音声仕様を、実装中ラインに絞って管理する。  
**最終更新**: 2026-02-11

## ライン位置
- Workstream: **Line A (Audio Model / Routing)**
- 親ノート: `docs/notes/export-workstreams.md`
- 実装済みアーカイブ: `docs/notes/archive/audio_pre_export_design-implemented-2026-02-11.md`

## 現在地
- 基本モデル（`Cut.audioBindings` / `useEmbeddedAudio`）は実装済み。
- 以後は Export 実装に必要な差分のみを進める。

## 未完了タスク（優先順）
1. metadata attachedAudio 残骸の削除
- 対象:
  - `src/types/index.ts` の `AssetMetadata.attachedAudio*`
  - `src/utils/metadataStore.ts` の attachedAudio系API
  - `src/utils/assetRefs.ts` の `attached-audio` 参照
- 完了条件:
  - AttachAudio 正経路が `Cut.audioBindings` のみになる

2. AttachAudio ON/OFF UI の最小導入
- 方針:
  - 新規状態を増やさず `audioBindings[].enabled` を切り替える
- 完了条件:
  - preview/export前処理で `enabled=false` が確実に除外される

3. Export向け音声出力仕様の最終確定
- 成果物候補:
  - `audio_master.wav`（`se` + `voice.other` + `embedded ON`）
  - `audio_lipsync.wav`（`voice.lipsync`）
- 完了条件:
  - Line B の実装で参照可能な形で spec を固定

## 依存関係
- Line B（MP4 export）に `kind` と `enabled/useEmbeddedAudio` の意味を提供。
- Line C（命名）に audio用語の最終表記を追従。

## 注意
- 実装済み事項の再説明はアーカイブへ寄せる。
- このファイルには「次に実装すること」だけを書く。
