# PreviewModal Split Plan (2026-02-22)

## TL;DR
- `PreviewModal.tsx` は mode 分岐ではなく責務分離で整理する。
- 主眼は「可読性回復」と「state/persistence 密結合の解消」。
- 過剰分割は避け、最小ユニットで段階的に移行する。

## 背景
- `src/components/PreviewModal.tsx` が約3,000行規模となり、再生制御・media source・buffering・audio・UI・export補助・clip UI が同居している。
- 既存不具合調査で、state と persistence（`onRangeChange`, `onClipSave`, `onClipClear`）の境界が追いにくいことが顕在化した。
- Preview Guide / Gate / ADR の観点で、責務境界を明確化する必要がある。

## 参照した正本
- `docs/guides/preview.md`
- `docs/guides/implementation/gate-checks.md`
- `docs/DECISIONS/ADR-0002-preview-export-parity.md`
- `docs/DECISIONS/ADR-0003-command-boundary.md`
- `docs/DECISIONS/ADR-0004-canonical-timing-api.md`
- `docs/guides/implementation/ui-components.md`

## Must
- Sequence再生は `useSequencePlaybackController` を単一制御面として維持する。
- `sequenceCuts` 指定時はその範囲のみで sequence を構築する。
- Preview/Export parity を壊さない（時間解決・sequence item生成の入口を分岐させない）。
- thumbnail profile は `sequence-preview` を維持する。
- Gate 10 の hotpath 制約（rAF で重処理しない）を維持する。

## Must Not
- mode（single/sequence）で新しい実装重複を増やさない。
- `PreviewModal` 内に新しい persistence 分岐を増やさない。
- displayTime/timing のローカル再計算を再導入しない。

## 分割方針（過剰分割しない）
1. `PreviewModal.tsx` を Composition Root 化
- props受け取り、hook呼び出し、Viewへの値受け渡しだけを残す。

2. Preview Session の封じ込め
- 新規: `src/components/preview-modal/usePreviewSession.ts`
- 再生制御接続、media source切替、buffer/url cache、sequence audio をここに集約。

3. Preview item構築を builder 化
- 新規: `src/components/preview-modal/previewItemsBuilder.ts`
- cut選別・timing計算・item構築を統一し、`sequenceCuts` 制約を入口で保証する。
- thumbnail解決（I/O）も同モジュールで管理し、`PreviewModal` から分離する。

4. clip/range state と persistence の切り分け
- 新規: `src/components/preview-modal/useClipRangeState.ts`
- state 遷移（in/out/clear/constrain/focus）をローカル管理。
- persistence 呼び出し（`onRangeChange`, `onClipSave`, `onClipClear`）は adapter 経由に限定する。

5. View（dumb component）分離
- 新規: `src/components/preview-modal/PreviewModalView.tsx`
- JSX/className/表示条件のみを担当。
- store/electron/domain更新は直接触らない。

6. 最小補助モジュール
- 新規: `src/components/preview-modal/types.ts`
- 必要時のみ `constants.ts` を追加。

## 実装ステップ
1. 型・定数抽出（挙動無変更）
2. `PreviewModalView` 抽出（見た目無変更）
3. `previewItemsBuilder` 抽出（item構築一本化）
4. `usePreviewSession` 抽出（再生/音声/buffer移管）
5. `useClipRangeState` 導入（state/persistence 分離）
6. `PreviewModal.tsx` を最終整理

## 検証観点
- 自動:
  - `npm run test`
  - `npm run check:gate`
- 手動:
  - Free解像度 + 縦長メディアで overlay が画面外に逃げない。
  - `sequenceCuts` 指定時に指定範囲のみ再生される。
  - VIDEOCLIP の set/clear と MiniToast 表示が維持される。
  - IN/OUT 操作時の再生位置・表示・保存の整合が崩れない。

## Done Criteria
- `PreviewModal.tsx` が Composition Root として読めるサイズ/責務に縮小している。
- state と persistence の責務境界がファイル単位で追跡可能。
- Gate/Preview parity の既存制約を破らない。
- 既存のVIDEOCLIP/MiniToast/Single+Sequence動作が回帰していない。

## Progress Log
- 2026-02-22 Step 1 着手:
  - `types.ts` / `constants.ts` / `helpers.ts` を新設し、`PreviewModal.tsx` から型・定数・小ヘルパーを分離。
  - 目的は挙動無変更での責務整理開始。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 2 前段:
  - 重複していた解像度セレクタUIを `PreviewResolutionPicker.tsx` に抽出。
  - Full View分離前に、表示責務を段階的に外出しする足場を追加。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 3 実施:
  - `buildPreviewItems` を `previewItemsBuilder.ts` に抽出し、`PreviewModal.tsx` の巨大な items構築 `useEffect` を置換。
  - `sequenceCuts` 優先や canonical timing 利用など、既存ロジックは同一ルールで維持。
  - 影響範囲が再生内容に及ぶため、ここで一旦動作確認フェーズを挟む。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 2 実施（Sequence側）:
  - Sequence Mode の empty/通常描画を `PreviewModalSequenceView.tsx` へ抽出。
  - `PreviewModal.tsx` は Sequence描画の props 組み立てに寄せ、JSX本体の責務を縮小。
  - `npm run build` でビルド成功を確認。
  - 再生・操作系UIのイベント伝搬に関わるため、この地点で手動確認フェーズを挟む。
- 2026-02-22 Step 2 実施（Single側）:
  - Single Mode の描画を `PreviewModalSingleView.tsx` へ抽出。
  - `PreviewModal.tsx` の Single 分岐は props 組み立て中心に変更し、View責務を分離。
  - `npm run build` でビルド成功を確認。
  - Single再生/clip/UI操作に関わるため、この地点で手動確認フェーズを挟む。
- 2026-02-22 Step 4 着手（state/persistence 分離）:
  - `useClipRangeState.ts` を新設し、Singleの in/out state・focused marker・`onRangeChange` 通知を `PreviewModal.tsx` から分離。
  - 既存handlerロジックは維持し、まず state と通知経路のみをhook化。
  - `npm run build` でビルド成功を確認。
