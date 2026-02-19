# Gate9 Thumbnail Unification Plan (2026-02-19)

## 目的
- CUT固有サムネイル処理の散在を解消し、生成・キー・無効化・呼び出し入口を `features/thumbnails` に集約する。
- Gate 9（thumbnail profile 混線禁止）を、profile指定だけでなく「入口統一」と「key規約固定」まで拡張して運用する。

## 適用範囲
- renderer: `src/utils/thumbnailCache.ts` と各 UI 呼び出し元（`App.tsx`, `CutCard.tsx`, `DetailsPanel.tsx`, `PreviewModal.tsx`, `Sidebar.tsx`, `AssetPanel.tsx`, `StartupModal.tsx`）
- feature: `src/features/cut/clipThumbnail.ts`
- main: `electron/services/thumbnailService.ts`（profile map / tmpキャッシュ）

## Must / Must Not
- Must: サムネイル取得/生成は最終的に `src/features/thumbnails/api.ts` 経由へ統一する。
- Must: Asset系とCut派生系（cut-derived）のキー名前空間を分離する。
- Must: profile は呼び出し面単位で固定し、暗黙デフォルトに依存しない。
- Must Not: 呼び出し側から `thumbnailCache` を直接操作しない（段階的に撤去）。
- Must Not: Cut派生サムネイルを Asset サムネイルと同一キーで共有しない。

## 現状サマリ（2026-02-19）
- `getThumbnail(...)` の直呼びが複数UIに散在。
- `CUT_DERIVED`（現状は clip）更新入口は `App.tsx` / `DetailsPanel.tsx` / `StartupModal.tsx` に分散。
- `PreviewModal.tsx` でサムネ解決分岐が重複（scene scoped / focused / all）。
- `options.key` は実装済みだが利用方針が未固定。

## Step1 棚卸し結果（2026-02-19）
- `CUT_DERIVED`（clip）
  - `src/components/DetailsPanel.tsx`
  - `src/App.tsx`
  - `src/components/StartupModal.tsx`
  - `src/store/commands.ts`
- `ASSET`
  - `src/components/AssetPanel.tsx`
  - `src/components/Sidebar.tsx`
  - `src/components/CutCard.tsx`
  - `src/components/PreviewModal.tsx`

## 実行順（Gate9）
1. 入口棚卸しを固定（`CUT_DERIVED` / `ASSET` タグ付け）。
2. `src/features/thumbnails/api.ts` を追加（薄いFacade）。
3. `cut-derived` 入口を追加し、既存 clip 取得を `kind=clip` 実装として移植する。
4. key生成関数を導入し、Asset/Cut派生の規約を固定。
5. key安定性テストを先行追加（同一入力同一key、差分入力でkey変化）。
6. `PreviewModal` から新APIへ置換（最優先）。
7. `CutCard` / `DetailsPanel` / `App` / `StartupModal` を順次置換。
8. `AssetPanel` / `Sidebar` を置換し、`thumbnailCache` 直接参照を縮退。
9. 低レベルAPIを `@deprecated` 化し、外部importを制限。
10. gate-checkへ「Facade経由以外の新規入口」検知を追加。

## キー方針（ターゲット）
- Asset:
  - `asset:${assetId|path}:${profile}:${timeOffset}`
- Cut derived:
  - `cut:${kind}:${cutId}:${fingerprint}:${profile}`
  - clip の場合: `cut:clip:${cutId}:${inMs}-${outMs}:${profile}`

補足:
- renderer LRU key は `options.key` 優先。未指定時は既存 `path|t=...|p=...` を使う。
- main tmpキャッシュは `path+size+mtime+type+timeOffset+profile` のハッシュ継続。

## 無効化方針
- 基本は key差分による自動再生成（mtime/hash/profile/timeOffset/in-out の差分）。
- 明示 purge API は当面追加しない。

## テスト最小セット
- key安定性: Asset/Cut派生（clip）それぞれで同一入力同一key。
- key変化: profile変更、in/out変更、timeOffset変更でkeyが変わる。
- namespace分離: Cut派生（clip）と Asset が同一入力条件でも衝突しない。
- 入口統一: 異なるUI入口でも同一cut条件なら同一cacheヒット。

## Done条件
- 新規サムネイル呼び出しが `features/thumbnails/api.ts` 経由に統一される。
- 旧入口は `@deprecated` 表示 + 呼び出し側撤去方針が明記される。
- Gate 9 チェックに「入口統一」観点が追加される。

## 進捗（2026-02-19）
- 完了:
  - Step 1-5: 入口棚卸し、`features/thumbnails/api.ts` 追加、`cut-derived` + key一般化、keyテスト追加。
  - Step 6-7: `PreviewModal` と cut-facing UI（`CutCard` / `DetailsPanel` / `App` / `StartupModal`）をFacade経由へ置換。
  - Step 8-9: `AssetPanel` / `Sidebar` の直接 `thumbnailCache` 操作をFacade経由へ置換し、低レベルAPIへ `@deprecated` を付与。
  - Step 10: gate-check に「Facade経由以外の新規入口」検知を追加（`thumbnailCache` 低レベルAPI直importの検出）。
