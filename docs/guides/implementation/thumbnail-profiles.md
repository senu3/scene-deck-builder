# Thumbnail Profiles Guide

**目的**: サムネイル生成プロファイルの責務と使い分けを固定し、画質/サイズの混線を防ぐ。  
**適用範囲**: Electron thumbnail service と renderer の thumbnail 利用箇所。  
**関連ファイル**: `electron/services/thumbnailService.ts`, `src/utils/thumbnailCache.ts`, `src/features/cut/clipThumbnail.ts`, `src/components/PreviewModal.tsx`, `src/components/DetailsPanel.tsx`, `src/components/AssetPanel.tsx`, `src/components/CutCard.tsx`。  
**更新頻度**: 中。

## Must / Must Not
- Must: 表示面ごとに profile を明示し、対応を固定する。
- Must: profile 追加時は main/renderer の型と map を同時更新する。
- Must Not: `asset-grid` / `sequence-preview` / `details-panel` を相互流用しない。
- Must Not: profile 変更時に cache key の `profile` 要素を外さない。

## プロファイル一覧（固定）
- `timeline-card`
  - 用途: Storyline の CutCard
  - 代表呼び出し: `src/components/CutCard.tsx`
- `asset-grid`
  - 用途: Assets Panel（asset-grid 専用）
  - 代表呼び出し: `src/components/AssetPanel.tsx`, `src/components/Sidebar.tsx`
- `sequence-preview`
  - 用途: Sequence Mode / Single-Image Preview の表示画像（`<img>`）
  - 代表呼び出し: `src/components/PreviewModal.tsx`
- `details-panel`
  - 用途: Details Panel のプレビュー画像
  - 代表呼び出し: `src/components/DetailsPanel.tsx`

## 運用ルール
- `asset-grid` は Assets Panel 専用。Preview/Details に流用しない。
- `sequence-preview` と `details-panel` は別概念。相互流用しない。
- Sequence preview は `<img>` を使う実装でも `sequence-preview` を使う。
- 新しい表示面を追加する場合、既存プロファイルを流用せず専用プロファイルを追加してから使う。

## キャッシュ方針
- renderer LRU（`src/utils/thumbnailCache.ts`）:
  - `options.key` 指定時はその値を優先使用する。
  - `options.key` 未指定時は `path|t={timeOffset}|p={profile}` を使用する。
- main tmp cache（`electron/services/thumbnailService.ts`）:
  - `path + size + mtime + type + timeOffset + profile` をハッシュ化したキーを使う。
- 同一ファイルでも profile が異なれば別キャッシュとして扱う。
- profile 追加/変更時は `src/utils/thumbnailCache.ts` と `electron/services/thumbnailService.ts` の両方を確認する。

## Gate9 運用（2026-02-19）
- 入口統一の実装記録は `docs/notes/archive/gate9-thumbnail-unification-plan-implemented-2026-02-19.md` を参照する。
- 目標: 呼び出し面から `thumbnailCache` / IPC を直接触らず、`features/thumbnails` のFacade経由へ統一する。
- 目標: Asset と Cut派生（`cut:${kind}:...`）の key namespace を分離する。
- Cut派生キャッシュ規約:
  - Key は `cut:${kind}:${cutId}:${fingerprint}:${profile}` を使う。
  - `kind=clip` の fingerprint は `inMs-outMs`（ミリ秒丸め）を使う。
  - 将来 `kind` を増やす場合は、同一 `cutId` 内で衝突しない fingerprint 定義を必ず先に決める。

## 変更時チェックリスト
- `PreviewModal` が `sequence-preview` を使っていること。
- `DetailsPanel` が `details-panel` を使っていること。
- `AssetGrid` が `asset-grid` を使っていること。
- 動画 clip サムネイル更新で `src/features/cut/clipThumbnail.ts` の共通ヘルパーを使っていること。
- `thumbnailService` の profile map と renderer 側 union 型が一致していること。

## Related Docs
- `docs/guides/preview.md`
- `docs/guides/media-handling.md`
