# getAsset/Thumbnail Resolve 統一実装

## 目的
- `getAsset(assetId)` 導入後に散在した `cut.asset` 優先/ `getAsset` 優先の揺れを統一する。
- Clip 固有サムネイルのみを明示的な例外として扱い、UIごとの差異を減らす。

## 決定ルール
- Asset実体（type/path/duration など）: `getAsset(cut.assetId)` 優先、fallback は `cut.asset`。
- 表示サムネイル: `cut.isClip && cut.asset?.thumbnail` の場合のみ Clip 固有サムネを優先し、それ以外は Asset実体の `thumbnail`。

## 実装内容
1. 共通 resolver を追加
- `src/utils/assetResolve.ts`
  - `resolveCutAsset`
  - `resolveCutDuration`
  - `resolveCutThumbnail`

2. Clip解除時の duration 復元を統一
- `src/store/slices/cutTimelineSlice.ts`
  - `clearCutClipPoints` の `displayTime` 復元を `resolveCutDuration(..., state.getAsset)` に変更。

3. UI 側の参照統一
- `src/components/CutCard.tsx`
  - `resolveCutAsset` / `resolveCutThumbnail` を利用。
- `src/components/DetailsPanel.tsx`
  - 選択CutとGroup先頭Cutのサムネ解決を共通化。
- `src/components/PreviewModal.tsx`
  - 「Asset実体」と「表示サムネ」を分離。
  - Single/Focused/Sequence の item 生成時に同一ルールでサムネ解決。

4. project load 時の `assetCache` 再構築（T5対応）
- `src/store/slices/projectSlice.ts`
  - `initializeProject` / `loadProject` で `scenes` から `assetCache` を再構築。
  - 読込直後の `getAsset` 未解決窓を縮小。

5. 保存時 `cut.asset` の縮退（互換スナップショット）
- `src/utils/projectSave.ts`
  - `prepareScenesForSave` で `cut.asset` を最小スナップショット化。
  - 保存対象は `id/type` + 必要時 `duration/thumbnail`（`path` は空文字）。

## 調査メモ

### T5: assetCache/getAsset 再構築タイミング
- 以前は `initializeProject` / `loadProject` で `assetCache` が再構築されず、`getAsset` が未解決になりやすかった。
- 今回、`scenes` 内の `cut.asset` から同期再構築を追加し、初期描画時の不一致を軽減。

### T6: サムネキャッシュキー
- 既存 `thumbnailCache` のデフォルトキーは `path + timeOffset + profile`。
- Clip固有サムネは `cut.asset.thumbnail` として保持・表示するため、UI参照での取り違えは回避可能。
- 将来、Clip範囲差分をキャッシュキーに反映する必要が出る場合は `options.key` で `cutId/in/out/profile` を含める方針が妥当。

## 影響
- CutCard / DetailsPanel / PreviewModal のサムネ表示が同じ入力に対して揃う。
- Clip解除時の `displayTime` 復元が、`cut.asset` の古さに引きずられにくくなる。
