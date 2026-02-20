# ADR-0005: Asset resolve 失敗時ポリシーを固定する

## Status
Accepted (2026-02-17)

## Context
- Gate 8 では `assetId` 主経路へ移行したが、Startup/Save/Export は復旧・互換の都合で例外が発生しやすい。
- 失敗時の扱い（null/throw/fallback/log）が場面ごとに曖昧だと、回帰と手戻りが増える。

## Decision
- `assetId` 解決失敗時の扱いを用途別に固定する。

### 1) Preview / UI
- `resolveCutAsset` は `null` を返す。
- 呼び出し側はプレースホルダ表示で継続する。
- 例外は投げない。必要なら warn ログのみ。

### 2) Export
- 通常cutは該当itemを skip し、warning を残す。
- LipSync など strict 条件（`strictLipSync`）では例外を許可する。

### 3) Load / Recovery / Save
- まず `assetId` で index 補完を試行する。
- 未解決の場合は missing asset として recovery フローへ送る。
- 暗黙に別assetへ置換しない。

- `cut.asset` 直接参照は `src/utils/assetResolve.ts` の fallback に限定し、それ以外の層で増やさない。
- `cut.asset` snapshot seed / fallback は互換期間の暫定扱いとし、段階的に完全廃止する。

## Consequences
- 失敗時挙動が機能面ごとに一貫する。
- 復旧系の分岐が整理され、監査しやすくなる。
- 将来 `cut.asset` fallback を縮小・廃止する際の前提が揃う。
