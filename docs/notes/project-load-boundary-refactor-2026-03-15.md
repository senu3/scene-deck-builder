# Project Load Boundary Refactor (2026-03-15)

## TL;DR
- `assets/.index.json` の読込は empty fallback をやめ、`readable | missing | unreadable | invalid-schema` を返す。
- project open は `readProjectOpenInputs -> diagnoseProjectOpen -> buildProjectLoadOutcome` の3段へ分ける。
- load/save は同じ integrity evaluator を共有し、UI outcome は共有しすぎない。

## 目的
project load/save 周辺で I/O 失敗と診断結果が混ざっていたため、`.index.json` 破損や project-vault link 問題を追加修正しづらい状態を解消する。

## 適用範囲
- `electron/main.ts`
- `electron/preload.ts`
- `src/features/platform/electronGateway.ts`
- `src/features/project/session.ts`
- `src/features/project/integrity.ts`
- `src/hooks/useHeaderProjectController.ts`

## Must
- asset index 読込結果は discriminated union で扱う。
- read-only I/O と診断ロジックを分ける。
- load/save で asset index 状態と metadata 整合の判定規則を共有する。

## Must Not
- `.index.json` 破損を空 index と同一視しない。
- UI から raw I/O 結果を直接解釈して個別分岐を増やさない。
- save 側だけ別の整合判定を持ち込まない。

## 今回固定した境界
- `readAssetIndex`
  - main/preload/renderer で `AssetIndexReadResult` を通す。
- `readProjectOpenInputs`
  - asset index 読込、scene asset 解決、metadata assessment の read-only I/O を担う。
- `diagnoseProjectOpen`
  - read 済み入力から `RecoveryAssessment` と推奨 action を作る。
- `buildProjectLoadOutcome`
  - project payload 化と UI 向け `ready/pending/corrupted` 変換のみを担う。

## 保存側の扱い
- save/autosave は `createProjectIntegrityAssessment` を共有利用する。
- ただし UI outcome は load と共有しない。
- `assetIndex.kind !== 'readable'` のときは save を止める。autosave では黙って skip する。

## 未解決
- project-vault repair planner 自体は別件。
- recent 更新条件のさらなる厳格化は repair 仕様と一緒に詰める。
- `readAssetIndex` へ寄せた後の docs 文言整理は継続対象。
