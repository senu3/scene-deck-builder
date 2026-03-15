# Project Load Boundary Refactor (2026-03-15)

## TL;DR
- `assets/.index.json` の読込は empty fallback をやめ、`readable | missing | unreadable | invalid-schema` を返す。
- project open は `readProjectIntegrityState -> readProjectOpenInputs -> diagnoseProjectOpen -> buildProjectLoadOutcome` の流れに分ける。
- load/save は同じ integrity evaluator だけでなく、asset/index 読込も共有する。
- recent 更新は open 成功時と manual save 成功時だけ行い、identity は normalized `project.sdp` path を使う。
- asset index planner は `load | repair-silent | repair-confirm | block` を返し、open/save の confirm 分岐を UI から分離する。
- 外向き `recommendedAction` は `open | recover | abort` のまま維持し、細かい診断理由は `issueKind` へ寄せる。
- 通常 open repair は asset index repair より先へ広げず、project 破損時は recovery import 導線へ送る。

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
- `readProjectIntegrityState`
  - asset index 読込と scene asset 解決だけを担う共有 read model。
- `prepareProjectAssetIndexState`
  - `assetId` 整合 / usage mismatch / project seed からの repair 可否を評価し、asset index action を返す。
  - repair の責務は最小限に留め、inventory 全置換や timeline 再構成までは持ち込まない。
- `readProjectOpenInputs`
  - shared read model に metadata assessment を合成して load diagnosis 入力を作る。
- `diagnoseProjectOpen`
  - read 済み入力から `RecoveryAssessment` と推奨 action を作る。
  - `recommendedAction` は増やさず、内向き分類は `issueKind` に載せる。
- `buildProjectLoadOutcome`
  - project payload 化と UI 向け `ready/pending/corrupted` 変換のみを担う。

## 保存側の扱い
- save/autosave は `readProjectIntegrityState + diagnoseProjectOpen` を使う。
- metadata assessment だけは save 側で in-memory store を渡す。
- UI outcome は load と共有しない。
- asset index repair が silent で済む場合は save 前に自動実行する。
- confirm が必要な repair は manual save のみ dialog を出し、autosave は skip する。
- `assetIndex.kind !== 'readable'` のときは save を止める。autosave では黙って skip する。
- recent は autosave / close / repair cancel では更新しない。

## フォローアップ
- project 破損時は open で深追いせず、`.index.json` などを clue とした recovery import 導線へ寄せる（`TODO-NICE-003`）。
- `.index.json` は完全復元器ではなく reconstruction clue として扱う。
