# MP4 Export Plan (LipSync + VideoClip, Pre-Resolution Phase)

**目的**: MP4 export のうち、LipSync と VideoClip の扱いを先行確定し、実装前の判断を固定する。  
**適用範囲**: export 設計（docs計画のみ）。コード実装は含まない。  
**関連ファイル**: `src/App.tsx`, `src/components/PreviewModal.tsx`, `src/components/CutCard.tsx`, `src/utils/exportSequence.ts`, `src/utils/lipSyncUtils.ts`, `src/utils/previewMedia.tsx`, `electron/main.ts`, `docs/notes/audio_pre_export_design.md`, `docs/notes/export-timeline-integrity-plan.md`。  
**更新頻度**: 中。  

## ステータス（2026-02-11）
- 本ノートは「実装前の方針確定」用。
- 今回は docs 記録のみで、コード変更は行わない。
- 解像度シミュレータ要件は次フェーズで別途確定する。

## In Scope（次実装フェーズ）
1. LipSync カットを MP4 出力へ正しく反映する（見た目を焼き込み）。
2. VideoClip (`inPoint/outPoint`) を非破壊で export に適用する。
3. export 実行経路を App 側に一本化し、Preview 側の直呼び出しを整理する。

## Out of Scope（今回保留）
1. 解像度シミュレータ仕様の見直し。
2. ExportModal の表示/UX再設計。
3. 音声分離（master/lipsync）の本実装。

## 決定事項
1. 事前 finalize 前提ではなく、export 時適用（非破壊）を優先する。
2. LipSync は「反映できないなら失敗」を基本方針にする（silent fallback しない）。
3. 既存の時系列不変条件（`docs/notes/export-timeline-integrity-plan.md`）は必ず維持する。

## 想定リスク
1. 解像度仕様未確定のため、見た目一致（preview/export）の最終保証は次フェーズ依存。
2. ExportModal 表示が現状仕様と乖離する期間が残る。
3. LipSync 焼き込み導入後は ffmpeg heavy queue の処理時間が増える可能性がある。

## 受け入れ条件（次実装フェーズ）
1. LipSync cut が MP4 出力で口パク反映される。
2. VideoClip の `inPoint/outPoint` が export に正しく反映される。
3. export 順序は時系列不変条件（scene/cut order）を維持する。
4. 既存の通常 image/video export が回帰しない。

## 次アクション
1. 先に解像度シミュレータ要件を確定する。
2. 確定後、このノートを実装計画（タスク分解 + 受け入れテスト詳細）へ昇格する。
