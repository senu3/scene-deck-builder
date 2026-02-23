# PreviewModal Split Plan (Implemented 2026-02-23)

## TL;DR
- `PreviewModal.tsx` を mode 分岐ではなく責務分離で整理し、Composition Root 化を完了。
- 操作入口は command 層（`usePreviewInteractionCommands`）に統一。
- Sequence/Single の再生・音声・表示・入力責務を hook/ops へ分離し、回帰検証を通過。

## 完了サマリ
- 状態: Implemented
- 期間: 2026-02-22 〜 2026-02-23
- 主目的:
  - 可読性回復
  - state/persistence 密結合の解消
  - 過分割抑制（統合フェーズ先行）
- 主要制約:
  - `useSequencePlaybackController` を単一制御面として維持
  - `sequenceCuts` 指定時は範囲構築を強制
  - Preview/Export parity を維持
  - Gate 10 hotpath 制約を維持

## 最終アーキテクチャ（要点）
- Composition Root:
  - `src/components/PreviewModal.tsx`
- Commands/Inputs/View shell:
  - `src/components/preview-modal/usePreviewInteractionCommands.ts`
  - `src/components/preview-modal/usePreviewInputs.ts`
  - `src/components/preview-modal/usePreviewViewShell.ts`
- Session/buffering/media/audio:
  - `src/components/preview-modal/usePreviewSequenceSession.ts`
  - `src/components/preview-modal/usePreviewSequenceMediaSource.ts`
  - `src/components/preview-modal/usePreviewSequenceBuffering.ts`
  - `src/components/preview-modal/usePreviewSequenceAudio.ts`
  - `src/components/preview-modal/usePreviewSingleModeSession.ts`
  - `src/components/preview-modal/usePreviewSingleAttachedAudio.ts`
- Pure ops/helpers:
  - `src/components/preview-modal/audioBinding.ts`
  - `src/components/preview-modal/clipRangeOps.ts`
  - `src/components/preview-modal/previewItemsBuilder.ts`
  - `src/components/preview-modal/usePreviewItemsState.ts`

## 検証結果
- 自動:
  - `npm run build` 成功
  - `npm run test` 成功
  - `npm run check:gate` 成功
- 手動:
  - Free + 縦長メディア時 overlay 退避不具合の修正確認
  - `sequenceCuts` 範囲再生
  - VIDEOCLIP の set/clear + MiniToast
  - IN/OUT・marker drag・skip/step・displayTime 境界

## 実装タイムライン（検索用要約）

### 2026-02-22 / Phase 1: 基盤分離
- Step 1: `types.ts` / `constants.ts` / `helpers.ts` 抽出
- Step 2: View 分離（`PreviewModalSequenceView.tsx` / `PreviewModalSingleView.tsx`）
- Step 3: `previewItemsBuilder.ts` 抽出（item 構築一本化）
- Step 4(初期): `useClipRangeState.ts` 導入（range state + marker focus）

### 2026-02-22 / Phase 2: 責務抽出（hook化）
- 入力/UI: overlay, viewport, fullscreen, progress interaction, keyboard
- Sequence: media source, buffering, audio, derived
- Single: media asset, attached audio
- 共通: export actions, shared view state, playback controls
- Follow-up fixes:
  - Sequence progress bar 競合修正
  - displayTime 境界修正
  - header click 干渉修正

### 2026-02-22 / Phase 3: 統合優先（過分割抑制）
- Step 8 先行:
  - `usePreviewViewShell.ts`
  - `usePreviewInputs.ts`
  - `usePreviewSequenceSession.ts`
- Step 10:
  - `audioBinding.ts` で audio helper 正本化

### 2026-02-23 / Phase 4: Composition Root 固定
- Step 9:
  - `clipRangeOps.ts` 追加
  - `stepFrame/skip/setInPoint/setOutPoint` を command 層へ集約
- Step 11:
  - `usePreviewSingleModeSession.ts` で Single 操作/副作用を集約
  - `usePreviewItemsState.ts` へ items 構築責務を移管
  - `PreviewModal.tsx` を配線中心へ最終整理

## 補足
- 詳細な逐次ログはコミット履歴を正本とする（本ノートは検索性重視の実装完了要約）。
- 関連ガイド更新:
  - `docs/guides/preview.md`
  - `docs/references/DOMAIN.md`
  - `docs/references/MAPPING.md`
