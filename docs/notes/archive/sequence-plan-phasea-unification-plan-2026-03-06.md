# SequencePlan Phase A Unification Plan (2026-03-06)

## TL;DR
- Preview/Export が `buildSequencePlan(project, opts)` を共通入口として使う Phase A は完了した。
- Phase A の対象は `normal/clip/hold/mute` とし、`VIDEO_HOLD` を canonical sequence 解釈へ統合した。
- LIPSync v2 は本ノートから切り離し、当時は `docs/notes/archive/lipsync-reassessment-plan-2026-03-06.md` 側の Phase B に移した。

## 完了内容
- `buildSequencePlan(project, opts)` を Preview/Export の共通入口として固定した。
- Preview sequence / Preview export / App export の consumer をこの入口へ揃えた。
- `VIDEO_HOLD` を `CutRuntimeState.hold` と `SequencePlan` 上の hold item / audio gap 補正で実装した。
- `normal/clip/hold/mute` を Phase A の canonical plan 表現として固定した。

## 固定した境界
- SequencePlan の責務は「cut 列から canonical な再生/出力区間を組み立てる」に限定する。
- Preview/Export は `buildSequencePlan` を同じ公開入口として使う。
- Plan 生成は pure function のまま維持する。
- `VIDEO_HOLD` は timeline 末尾延長として扱い、asset を破壊しない。
- hold 永続化例外は `CutRuntimeState.hold` のみに限定する。

## 実装メモ
- Preview sequence は `usePreviewSequenceDerived` から `target.kind='cuts'` 経由で利用する。
- Preview export は `usePreviewExportActions` から同じ入口を利用する。
- App 側 export も `buildSequencePlan` を利用する。
- `buildSequencePlan` は hold 用の video/export item を追加し、audio timeline も gap 補正する。
- project 保存では `cutRuntimeById` 全体を永続化せず、`hold` のみを抽出して保存/復元する。

## 後続
- 当時の継続メモは `docs/notes/archive/lipsync-reassessment-plan-2026-03-06.md`。現行方針は `docs/DECISIONS/ADR-0007-lipsync-deprecation.md` を参照。
