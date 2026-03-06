# Gate Checks

## 目的（この docs が決めること）
- `check:gate` / `check:gate:strict` で監査する対象と、違反判定の運用ルールを固定する。
- Gate 監査の責務境界（何を静的検出し、何をレビュー判断に残すか）を明確にする。

## 適用範囲（触るファイル境界）
- 監査スクリプト: `scripts/check-gate.mjs`
- strict 基線: `scripts/check-gate-baseline.json`
- ホットパス対象:
  - `src/components/PreviewModal.tsx`
  - `src/utils/previewPlaybackController.ts`
  - `src/utils/previewMedia.tsx`

## Must
- 新しい Gate 検出ルールを追加したら、このドキュメントに対象ファイルと意図を追記する。
- `check:gate:strict` は「新規違反 fail」の原則を維持する。
- Gate 6 の許可リストは ADR-0003 の境界に合わせる。
- Gate 10 のホットパス監査は再生ループ付近（`tick` / `requestAnimationFrame`）に限定する。
- Gate 監査の「検出できること / できないこと」を本書で明示し、`Ready` 判定を script 検出だけに過大解釈しない。
- Gate 6 例外は `load` / `migrate` / `init` / `normalize` の4カテゴリに固定し、それ以外を例外として追加しない。
- Gate 2 では `safeOrder` のような順序 fallback を再導入しない。
- Gate 9 では cut サムネ解決の正規入口を `src/features/thumbnails/api.ts` に固定し、`assetResolve` 由来の入口を再導入しない。
- baseline 更新は専用コミット（または PR 内の専用コミット）に分離する。

## Must Not
- 既存違反を silent ignore するために検出ルールを緩めない。
- Gate 10 監査を全体 grep に広げてノイズを増やさない。
- 許可リストを目的不明で拡張しない。
- Gate 6 例外カテゴリ（`load` / `migrate` / `init` / `normalize`）以外を新設しない。
- 「直すのが面倒」を理由に baseline を更新しない。

## baseline 更新ルール
- 対象: `scripts/check-gate-baseline.json`
- 更新時の必須条件:
  - PR の Gate checks 欄に更新理由を1-2行で記載する。
  - 更新内容は専用コミットに分離する。
- 更新してよい例:
  - ADR で正当化された例外を追加する場合
  - リファクタで検出パスが移動し、違反の実体が不変な場合
- 更新してはいけない例:
  - 違反修正を先送りするための一時回避

## 現在の監査対象
- Gate 2: `safeOrder` fallback 残存検出
- Gate 3: `PreviewModal` の `displayTime` 手計算再流入検出
- Gate 4: `PreviewModal` の `reduce(...displayTime...)` 検出
- Gate 6:
  - `useStore.setState(` の許可リスト外検出
  - `set(...scenes:...)` の許可リスト外検出
- Gate 7:
  - `src/utils` 配下の `window.electronAPI` 直呼び検出（platform bridge 経由へ統一）
  - `AssetPanel` / `DetailsPanel` の metadata API（`getVideoMetadata` / `readImageMetadata` / `loadAssetIndex`）直呼び検出
  - `src/store/slices` 配下の `window.electronAPI` 直呼び検出（provider/gateway 境界へ統一、allowlistなし）
  - `clipThumbnailRegenerationQueue` の直接import検出（`thumbnailEffects` 経由へ統一）
- Gate 8: `cut.asset` の `assetResolve.ts` 外参照検出
- Gate 9:
  - `getThumbnail(...)` の profile 未指定検出
  - `thumbnailCache` 低レベルAPI（`getThumbnail/getCachedThumbnail/removeThumbnailCache`）のFacade外import検出
  - `assetResolve` からの `resolveCutThumbnail` import 検出（cutサムネは api.ts 正規入口へ統一）
  - 主要UI（`AssetPanel` / `Sidebar` / `previewItemsBuilder` / `LipSyncModal`）の `asset.thumbnail` 直参照検出
- Gate 10:
  - ホットパスファイルでの node/fs/process import 検出
  - `tick`/`update` ブロック内の重処理API検出
  - `tick`/`update` ブロック内の `await` / `.then(...)` 連鎖検出

## Canonical API 方針（Gate 3/4/5）
- Gate 4（`displayTime` 正規化）の正本入口は `resolveCanonicalCutDuration` に固定する。
- Gate 3（開始秒・合計尺計算）の正本入口は `computeCanonicalStoryTimingsForCuts` に固定する。
- Gate 5（export sequence item 生成）の正本入口は `buildSequenceItemsForCuts` に固定する。
- `resolveNormalizedCutDisplayTime` / `computeStoryTimingsForCuts` は lower-level helper として扱い、公開正本APIとして運用しない。

## 監査対象外（手動レビュー必須）
- Gate 5:
  - Preview/Export parity 全体の同値性は static grep では直接検証していない。
  - 監査は `PreviewModal` の `displayTime` 手計算再流入検出（Gate 3/4 proxy）中心。
- Gate 6:
  - `useStore.setState` / `set(...scenes:...)` 以外の間接更新（helper経由やslice内派生更新）は静的に取りこぼす可能性がある。
- Gate 7:
  - 現状は `src/utils` + metadata対象UI + `src/store/slices` の限定監査。renderer 全域の直呼び検出は未導入。
  - `src/store/slices` は allowlist を持たず、新規直呼びは strict fail とする。
  - `TODO-DEBT-007` 完了後も、他UI経路への監査拡張は必要時に別途判断する。
- Gate 9:
  - profile指定・low-level import・主要UIでの `asset.thumbnail` 直参照は検出するが、対象外ファイルの snapshot fallback 妥当性は手動確認が必要。
- Gate 8:
  - `cut.asset` の fallback 妥当性（表示互換・復旧の境界）は手動確認が必要。
- Gate 10:
  - 再生ループ外の重処理（`useEffect` やイベント連鎖）は strict 監査対象外。
  - 監査は「tick/updateホットパスを汚さない」ことに限定する。

## GroupCUT 監査メモ
- GroupCUT の no-overlap / reverse-index 整合 / empty group 不許可 / 範囲導出は、現時点では store 正規化とテストで担保している。
- `check:gate` / `check:gate:strict` に GroupCUT の静的検出を追加した場合のみ、この docs の「現在の監査対象」へ検出項目を追記する。
- テスト追加のみで `scripts/check-gate.mjs` を変更していない場合、baseline 更新は不要。

## Gate 6 許可リスト（理由付き）
- `useStore.setState`
  - `src/store/commands.ts`: command undo/restore path（ADR-0003）
- `set(...scenes:...)`
  - `src/store/slices/cutTimelineSlice.ts`: timeline 構造の正規更新経路
  - `src/store/slices/groupSlice.ts`: group 構造更新経路
  - `src/store/slices/projectSlice.ts`: load/restore/migration/initialization 正規化（ADR-0003 例外）

## Gate 6 例外カテゴリ（固定）
- `load`: プロジェクト読込・復元時の再構築。
- `migrate`: バージョン差分吸収の構造移行。
- `init`: 初期プロジェクト作成・クリア・fixture 初期化。
- `normalize`: `sceneOrder` / `cut.order` など整合修復。
- 実装メモ: 例外入口には `// GATE6-EXCEPTION(<category>)` タグコメントを付与し、grep監査を可能にする。

## 運用メモ
- `npm run check:gate`
  - warning 出力。ローカル監査向け。
- `npm run check:gate:strict`
  - baseline との差分で fail。PR/CI 向け。
- CI では `check:gate:strict` を必須ジョブとして運用する。
