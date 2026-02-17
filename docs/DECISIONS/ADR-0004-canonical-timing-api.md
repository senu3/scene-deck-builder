# ADR-0004: Gate 3/4/5 の canonical API を固定する

## Status
Accepted (2026-02-17)

## Context
- Gate 3/4/5 で「時系列・displayTime・parity」を改善してきたが、正本APIが曖昧だと置換が分散し続ける。
- Preview と Export の実装速度を維持しながら、差分混入を抑えるためには入口の固定が必要。

## Decision
- 正本APIを以下に固定する。
  - `resolveNormalizedCutDisplayTime`: `displayTime` 正規化の正本。
  - `computeStoryTimingsForCuts`: 開始秒・合計尺計算の正本。
  - `buildSequenceItemsForCuts`: export sequence item 生成の正本。
- 新規実装では、同等処理のローカル再実装を原則禁止する。
- 既存コードの移行は段階導入とし、最終的にPreviewも上記正本APIの結果を消費する形へ寄せる。

## Consequences
- Gate 3/4/5 のレビュー基準が明確になる。
- 機能追加時は「どの正本APIを使うか」を明示できる。
- 互換期間中はローカル計算が残るため、`check:gate` と回帰テストで監視を継続する。
