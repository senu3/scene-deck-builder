# DnD / Import Implementation Guide

## TL;DR
対象: AssetPanel/Sidebar/Storyline の DnD 実装境界  
正本: drag payload 種別、外部投入制約、外部持ち出し（OS DnD）  
原則:
- drag kind 判定は `src/utils/dragDrop.ts` に統一する
- 外部投入（OS -> App）は image/video のみ受理する
- 外部持ち出し（App -> OS）は main IPC で path 検証して開始する

**目的**: DnD と import の実装判断を統一し、UI差分追加時の逸脱を防ぐ。  
**適用範囲**: `src/components/AssetPanel.tsx`, `src/components/Sidebar.tsx`, `src/hooks/useStorylineDragController.ts`, `src/utils/dragDrop.ts`, `electron/preload.ts`, `electron/main.ts`, `electron/handlers/assetFileDrag.ts`。  
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/vault-assets.md`, `docs/guides/media-handling.md`, `docs/references/DOMAIN.md`, `docs/references/MAPPING.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: drag kind 判定は `getDragKind`（`asset` / `externalFiles` / `none`）へ集約する。
- Must: AssetPanel から Storyline への内部DnD payload は `application/json` + `text/scene-deck-asset` を維持する。
- Must: 外部投入の受理判定は `getSupportedMediaFiles` / `hasSupportedMediaDrag` を使う。
- Must: 外部投入（OS -> App）は `image` / `video` のみ受理し、`audio` は受理しない。
- Must: 外部持ち出し（App -> OS）は `window.electronAPI.startAssetFileDrag`（sync IPC）経由で開始する。
- Must: main 側で `vault/assets` 配下・実在・ファイル種別を正規化済み実体パスで検証する。
- Must: `webContents.startDrag` の icon は縮小済みサイズ（現行: 64px）を渡す。
- Must Not: drag kind 判定を各コンポーネントで個別実装しない。
- Must Not: renderer で任意パスを組み立てて外部DnDへ渡さない。
- Must Not: 外部持ち出し失敗時にクラッシュや強制例外を起こさない。

## Canonical Data Flow

### 1) App内 DnD（AssetPanel/Sidebar -> Storyline）
- 送信側:
  - `AssetPanel`: vault内 asset を `application/json` で渡す。
  - `Sidebar`: 外部ファイル起点 asset（`originalPath`）を `application/json` で渡す。
- 受信側:
  - `useStorylineDragController.handleDrop` で payload を解釈し、`createCutFromImport` または `AddCutCommand` へ接続する。

### 2) 外部投入 DnD（OS -> Storyline）
- `getSupportedMediaFiles` で file list を抽出する。
- `queueExternalFilesToScene` で import queue へ積む。
- audio は `getCuttableMediaType` の制約で非受理とする。

### 3) 外部持ち出し DnD（AssetPanel -> OS）
- renderer `dragstart` 中に `startAssetFileDrag`（sync）を呼ぶ。
- main で `validateStartAssetFileDragPayload` を通過した場合のみ `startDrag({ file, icon })` を実行する。
- icon は `createSizedDragIcon` で縮小済み画像を使う（巨大サムネイル追従を抑止）。

## UI Behavior Rules
- `AssetPanel` のサムネイル `<img>` は `draggable={false}` を維持する（HTML画像DnDへの誤フォールバック防止）。
- `AssetPanel` の `setDragImage` は最小ゴーストに固定し、視覚妨害を避ける。
- 外部持ち出し判定NG時は無動作で終了し、編集フローを阻害しない。

## Test / Verify Checklist
1. AssetPanel -> Storyline: 従来どおり cut が追加される。
2. OS -> Storyline: image/video が投入でき、audio は投入されない。
3. AssetPanel -> Explorer/Finder: ファイルとしてドロップできる。
4. AssetPanel -> 外部アプリ: ファイルパスで受け取れる。
5. 無効 path（missing / vault外）: 外部持ち出しは開始されずクラッシュしない。
