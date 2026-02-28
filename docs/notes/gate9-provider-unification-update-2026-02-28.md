# Gate9 provider統一 更新メモ（2026-02-28）

## TL;DR
- `TODO-DEBT-009` の主要経路（AssetPanel / Sidebar / Preview / LipSyncModal入口集約）を `src/features/thumbnails/api.ts` 経由へ統一。
- Gate9 監査に `asset.thumbnail` 直参照検知（主要UI限定）を追加。
- LipSync の完全置換は `TODO-DEBT-011` として分離。

## 目的
- Gate9 の「profile混線防止」に加え、主要UIのサムネ解決入口を provider 経由へ統一する。
- `asset.thumbnail` の新規直参照混入を gate-check で検知可能にする。

## 今回の実施内容
1. `src/features/thumbnails/api.ts` に resolver を追加。
- `resolveAssetThumbnailSource`
- `resolveAssetThumbnailFromCache`
- いずれも Asset key namespace（`asset:${assetId|path}:${profile}:${timeOffset}`）を維持。

2. 主要UIを resolver 経由へ置換。
- `src/components/AssetPanel.tsx`
- `src/components/preview-modal/previewItemsBuilder.ts`
- `src/components/LipSyncModal.tsx`

3. Gate9 監査を拡張。
- `scripts/check-gate.mjs` に主要UIの `asset.thumbnail` 直参照検知を追加。

4. テスト追加。
- `src/features/thumbnails/__tests__/api.test.ts`
- fallback 時も Asset key を使い続けることを検証。

## 未完了（次バッチ）
- LipSyncModal 内の snapshot fallback（`asset.thumbnail` 相当）を撤去し、resolver のみで完結させる。
- 本残件は `TODO-DEBT-011` で管理する。

## 検証
- `npm test -- src/features/thumbnails/__tests__/api.test.ts`
- `npm run check:gate`
- `npm run check:gate:strict`
- `npm run build`
