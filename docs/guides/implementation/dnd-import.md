# DnD / Import Implementation Guide

## TL;DR
対象: AssetPanel/Sidebar/Storyline の DnD 実装境界  
正本: drag payload 種別、外部投入制約、外部持ち出し（OS DnD）  
原則:
- drag kind 判定は単一関数へ集約
- OS投入は image/video のみ受理
- OS持ち出しは main 側検証を必須とする

**目的**: DnD と import の実装判断を統一し、UI差分追加時の逸脱を防ぐ。  
**適用範囲**: `src/components/AssetPanel.tsx`, `src/components/Sidebar.tsx`, `src/hooks/useStorylineDragController.ts`, `src/utils/dragDrop.ts`, `electron/preload.ts`, `electron/main.ts`, `electron/handlers/assetFileDrag.ts`。  
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/vault-assets.md`, `docs/guides/media-handling.md`, `docs/guides/implementation/debug-overlay.md`, `docs/references/DOMAIN.md`, `docs/references/MAPPING.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: drag kind 判定は `getDragKind`（`asset` / `externalFiles` / `none`）へ集約する。
- Must: AssetPanel から Storyline への内部DnD payload は `application/json` + `text/scene-deck-asset` を維持する。
- Must: 外部投入の受理判定は `getSupportedMediaFiles` / `hasSupportedMediaDrag` を使う。
- Must: 外部投入（OS -> App）は `image` / `video` のみ受理し、`audio` は受理しない。
- Must: 外部持ち出し（App -> OS）は `osDragGateway.startAssetDragOut(assetId)` を入口にする。
- Must: main 側で `assetId -> assets/.index.json -> 実体パス` を解決し、検証してから OS DnD を開始する。
- Must: drag-out の renderer 入力は `assetId` または vault 内の論理識別子に限定する。
- Must Not: drag kind 判定を各コンポーネントで個別実装しない。
- Must Not: renderer で任意パスを組み立てて外部DnDへ渡さない。
- Must Not: dragDrop 層が HUD 実装を import しない。

## Canonical Data Flow

### 1) 内部DnD（App内）
- payload は JSON で渡す。
- Storyline 側で payload を解釈し、Command へ接続する。

### 2) 外部投入（OS -> App）
- 受理判定を行い、import queue へ積む。
- `audio` は受理しない。

### 3) 外部持ち出し（App -> OS）
- renderer からは `assetId` のみで `osDragGateway` を呼ぶ。
- main 側で index 解決と実体パス検証後に OS DnD を開始する。

### 4) DnD Debug Overlay 連携
- DnD debug仕様は `debug-overlay.md` に従う。
- DnD層は log APIのみを呼び、HUD存在を前提にしない。
