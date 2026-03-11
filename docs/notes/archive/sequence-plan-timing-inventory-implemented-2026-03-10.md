# SequencePlan Timing Inventory (2026-03-10)

## TL;DR
- Preview / Export parity に影響する timing 経路は、現時点で `buildSequencePlan(project, opts)` を通る入口に揃っている。
- `computeCanonicalStoryTimingsForCuts(...)` の残存呼び出しは、canonical stack 内部か preview 専用 UI 補助に限られる。
- 今後 parity 影響のある timing 変更を入れる場合は、この棚卸し表の `Keep` 以外へ新規経路を増やさない。

## 目的
- `SequencePlan` 正本方針に対して、どの timing 計算が正本で、どれが補助なのかを固定する。
- Preview / Export parity に影響する再計算のにじみを検知しやすくする。

## 適用範囲
- `buildSequencePlan(...)`
- Preview sequence / preview export
- Export graph / audio plan / sidecar 出力
- Preview 専用 UI で残る timing 補助計算

## Must / Must Not
- Must: Preview / Export parity に影響する timing 入口は `buildSequencePlan(...)` を通す。
- Must: `computeCanonicalStoryTimingsForCuts(...)` の直呼びは canonical stack 内部か preview 専用 UI 補助に限定する。
- Must Not: raw cut や `PreviewItem` を export / preview playback の timing 正本にしない。
- Must Not: この棚卸し表にない parity 影響経路を新規追加しない。

## Inventory
| Callsite | Category | Status | Notes |
| --- | --- | --- | --- |
| `src/utils/sequencePlan.ts` | Canonical source | Keep | Preview / Export 共通の timing 正本。 |
| `src/App.tsx` | Export consumer | Keep | scene export / global export は `buildSequencePlan(...)` を直接使用。 |
| `src/components/preview-modal/usePreviewSequenceDerived.ts` | Preview consumer | Keep | preview sequence playback は `buildSequencePlan(...)` を消費。 |
| `src/components/preview-modal/usePreviewExportActions.ts` | Preview export consumer | Keep | preview modal からの export は `SequencePlan` を直接構築。 |
| `src/utils/exportSequence.ts` | Canonical downstream transform | Keep | canonical cut 列を export item へ変換する内部 helper。 |
| `src/utils/exportAudioPlan.ts` | Canonical downstream transform | Keep | canonical cut 列と整合する audio event timing を構築。 |
| `src/components/preview-modal/previewItemsBuilder.ts` | Preview-only helper | Contain | thumbnail / scene offset 表示用に canonical timing を再利用。parity source に昇格させない。 |
| `src/components/preview-modal/usePreviewSingleAttachedAudio.ts` | Preview-only helper | Contain | single mode の scene attached audio offset を求める補助計算。export から参照しない。 |
| `src/utils/cutGroupOps.ts` | UI helper | Contain | group の視覚範囲計算用。Preview / Export parity には不参加。 |

## Checked Result
- `src/App.tsx`
  - export 入口は `buildSequencePlan(...)` を使用しており、raw cut timing の再構成はしていない。
- `src/components/preview-modal/usePreviewSequenceDerived.ts`
  - preview playback は `SequencePlan.videoItems` / `SequencePlan.audioPlan` を消費している。
- `src/components/preview-modal/usePreviewExportActions.ts`
  - preview export は `buildSequencePlanTargetFromPreviewItems(...)` を経由して canonical plan を再構築する。

## Guardrails
- `buildSequencePlanTargetFromPreviewItems(...)` は `PreviewItem.normalizedDisplayTime` を canonical 済み値として運ぶ前提で維持する。
- `previewItemsBuilder.ts` と `usePreviewSingleAttachedAudio.ts` に新しい export / preview parity ロジックを足さない。
- これらの preview-only helper を拡張する場合は、まず `SequencePlan` 側へ移せないかを検討する。
