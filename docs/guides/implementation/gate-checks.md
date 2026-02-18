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
- baseline 更新は専用コミット（または PR 内の専用コミット）に分離する。

## Must Not
- 既存違反を silent ignore するために検出ルールを緩めない。
- Gate 10 監査を全体 grep に広げてノイズを増やさない。
- 許可リストを目的不明で拡張しない。
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
- Gate 8: `cut.asset` の `assetResolve.ts` 外参照検出
- Gate 9: `getThumbnail(...)` の profile 未指定検出
- Gate 10:
  - ホットパスファイルでの node/fs/process import 検出
  - `tick`/`update` ブロック内の重処理API検出
  - `tick`/`update` ブロック内の `await` / `.then(...)` 連鎖検出

## Gate 6 許可リスト（理由付き）
- `useStore.setState`
  - `src/store/commands.ts`: command undo/restore path（ADR-0003）
- `set(...scenes:...)`
  - `src/store/slices/cutTimelineSlice.ts`: timeline 構造の正規更新経路
  - `src/store/slices/groupSlice.ts`: group 構造更新経路
  - `src/store/slices/projectSlice.ts`: load/restore 正規化（ADR-0003 例外）

## 運用メモ
- `npm run check:gate`
  - warning 出力。ローカル監査向け。
- `npm run check:gate:strict`
  - baseline との差分で fail。PR/CI 向け。
- CI では `check:gate:strict` を必須ジョブとして運用する。
