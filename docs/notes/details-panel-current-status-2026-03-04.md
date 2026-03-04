# Details-panel 現状メモ（2026-03-04）

## TL;DR
- `DetailsPanel` のサムネ表示は、現在 `selectedCutId` 専用ではなく `preferredThumbnail`（= cut の in/out・isClip 影響あり）変化でも再評価される構造。
- Clip 保存経路では `thumbnailProfile: "details-panel"` を渡しているが、`savePreviewClipPoints` は `timeline-card` 以外で再生成キューを起動しないため、保存成功時サムネ更新は実質未連動。
- 今後の再設計（構造組み替え）では「選択切替時のみ再計算」を明示し、保存経路と表示更新経路を分離するのが前提。

## 目的
- Details-panel の現在の挙動と制約を整理し、再設計時の確認漏れを防ぐ。

## 適用範囲
- `src/components/DetailsPanel.tsx`
- `src/features/cut/previewClipUpdate.ts`
- `src/features/cut/clipThumbnailRegenerationQueue.ts`

## Must
- Details-panel のサムネ更新トリガーと clip 保存トリガーを混同しない。
- `asset.thumbnail` 直参照を増やさず、resolver (`resolveCutThumbnailFromCache` / `getAssetThumbnail`) 経由を維持する。
- サムネ再生成キューの適用条件（現在は `timeline-card` のみ）を仕様として扱う。

## Must Not
- 「PreviewModal で in/out を保存したら Details-panel サムネも更新される」と仮定しない。
- Details-panel 表示都合だけで clip 保存経路に副作用を追加しない。

## 現在の実装状況
1. Details-panel の表示サムネ読み込み
- `thumbnail` state を `loadAssetData` effect で更新。
- effect の依存には `preferredThumbnail` が含まれるため、同一 cut 選択中でも in/out 変化で再評価されうる。

2. Clip 保存/解除とサムネ再生成
- `handleSaveClip` / `handleClearClip` は `savePreviewClipPoints` / `clearPreviewClipPoints` を利用。
- 依存に `thumbnailProfile: "details-panel"` を渡している。
- ただし service 側は `thumbnailProfile !== "timeline-card"` で enqueue を早期 return するため、Details-panel では再生成キュー非起動。

3. 反映ズレの意味
- 保存自体（cut の in/out 更新）と Details-panel 表示サムネ更新は別経路。
- そのため保存成功しても Details-panel サムネが即時一致しないケースがありうる（現行仕様上は許容）。

## 再設計時の観点（メモ）
1. 仕様明示
- 「Details-panel は `selectedCutId` 変更時のみ再計算」を仕様化するかを先に確定する。

2. 境界分離
- clip 保存責務: command / service 側
- Details-panel 表示責務: 選択変化ベースの読み込み

3. 将来拡張
- Undo/Redo で同一 `selectedCutId` の in/out が変化しても、Details-panel を追従させるかどうかは別仕様として管理する。
