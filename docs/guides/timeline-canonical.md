# Timeline Canonical Guide

## TL;DR
対象：Preview / Export が共有する時系列正本
正本：`buildSequencePlan(project, opts)` が生成する `SequencePlan`
原則：
- timing resolution は `buildSequencePlan` に集約する
- Preview / Export は `SequencePlan` を消費する
- raw cut / UI state を timing 正本にしない

**目的**: 時系列ロジックをどこに置くべきかを即判断できるようにする。  
**適用範囲**: `SequencePlan` 生成、Preview sequence 再生、Export sequence 出力。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/export.md`, `docs/DECISIONS/ADR-0002-preview-export-parity.md`, `docs/DECISIONS/ADR-0004-canonical-timing-api.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Preview / Export が共有する canonical timeline は `SequencePlan` とする。
- Must: timing resolution は `buildSequencePlan(project, opts)` に集約する。
- Must: Preview / Export は `SequencePlan` を消費して再生・出力へ変換する。
- Must: clip / hold / mute / item ordering は `SequencePlan` 生成側で決定する。
- Must Not: raw cut 群から timing を再構成しない。
- Must Not: `PreviewItem` や UI state を timing 正本にしない。
- Must Not: Export 側で clip / hold / mute を独自再解釈しない。

## Canonical Source
```text
Project State
  ↓
buildSequencePlan(project, opts)
  ↓
SequencePlan
  ↓
Preview / Export
```

- `SequencePlan` が Preview / Export 共通の canonical timeline。
- `SequencePlan` 生成前の helper は正規化や下位変換に使ってよいが、consumer の公開正本にはしない。

## Timing / Duration Canonicalization
- タイムラインの時間情報（timing）は `SequencePlan` を正本とする。
- ルール:
  - preview / export / rendering など、**タイミング一致（parity）に影響する処理**は `buildSequencePlan(project, opts)` から timing を取得すること。
  - preview 用ヘルパーや UI state は timing の正本になってはいけない。
  - preview-only / UI helper は、timing の正本とならない限り lower-level canonical helper を利用してよい。
  - このルールにより、preview と export の timing の一致を保ち、実装経路ごとの timing のズレ（drift）を防ぐ。
- 棚卸し履歴: `docs/notes/archive/sequence-plan-timing-inventory-implemented-2026-03-10.md`

## Timing Logic Placement
- 正本ファイル:
  - `src/utils/sequencePlan.ts`
    - clip resolution
    - hold resolution
    - mute resolution
    - item ordering を含む `SequencePlan` 組み立て
  - `src/utils/timelineOrder.ts`
    - project state から timeline order を導く helper
  - `src/utils/exportAudioPlan.ts`
    - canonical cut 列に整合する audio event timing
- consumer 側の責務境界は `docs/guides/preview.md` と `docs/guides/export.md` を正本とする。

## Allowed Transformations
- Preview:
  - `SequencePlan` → media playback
  - `SequencePlan` → audio sync
- Export:
  - `SequencePlan` → export graph / wire payload
  - `SequencePlan` → sidecar output

## Forbidden
- raw cut から export / preview timing を再構築すること
- Preview 側で clip / hold を timing source として再解釈すること
- Export 側で timeline 尺や ordering を再計算すること
- parity 影響のある timing 変更を Preview / Export 片側だけに入れること
