# Cut Write Path Inventory

## 目的
- S0 着手前の Cut 書き込み経路を一覧化し、書き込みオーナーを固定する。
- `commands` / `cutActions` / metadata 系の境界整理に使う基礎資料を残す。

## 適用範囲
- `src/store/slices/cutTimelineSlice.ts`
- `src/store/slices/metadataSlice.ts`
- `src/store/commands.ts`
- `src/components/*` の Command 実行箇所

## 関連ファイル
- `docs/notes/store-slice-plan.md`
- `docs/guides/cut-history-guidelines.md`
- `src/store/useStore.ts`
- `src/store/historyStore.ts`

## 更新頻度
- 中

## 現状（2026-02-12）

### 1. Command 経由の Cut 書き込み
- `AddCutCommand` -> `addCutToScene` / `updateCutDisplayTime`
- `RemoveCutCommand` -> `removeCut`
- `UpdateDisplayTimeCommand` -> `updateCutDisplayTime`
- `UpdateClipPointsCommand` / `ClearClipPointsCommand` -> clip 更新系
- `MoveCutBetweenScenesCommand` / `MoveCutsToSceneCommand` -> move 系

備考:
- UI 確認（`confirm`）は Command から分離済み。Undo 前確認は UI 層で実施。

### 2. cutTimelineSlice 直書き込み（domain owner）
- scene/cut の追加・削除・並び替え・クリップ更新・clipboard 反映。
- Cut 削除時は `emitStoreEvent({ type: 'CUT_DELETED' })` を発火し、`applyStoreEvents` で group/selection を後処理。

### 3. metadataSlice からの Cut 更新
- `attachAudioToCut` / `detachAudioFromCut` / `updateCutAudioOffset` は `setCutAudioBindings` 経由へ移行済み。
- `relinkCutAsset` は `cacheAsset` + `updateCutWithAsset`（cut action）経由へ移行済み。

### 4. read-time join（ID優先）
- `commands` 復元系は `getAsset(assetId)` 優先で asset 解決。
- 主要 UI（`CutCard` / `AssetPanel` / `DetailsPanel` / `PreviewModal`）は `getAsset(assetId)` 優先へ移行済み。

## S0 で残る主要課題
- `cut.asset` を write 時に必須としない設計（ID主経路の徹底）。
- 必要な cross-slice event の追加定義（`CUT_DELETED` 以外）。

## TODO
- `CUT_MOVED` / `CUT_RELINKED` の event 要否を検討する。
- selector 標準パターンの記述と合わせて本ドキュメントを更新する。
