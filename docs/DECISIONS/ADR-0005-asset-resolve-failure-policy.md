# ADR-0005: Asset resolve 失敗時ポリシーを固定する

## Status
Accepted (2026-02-17)
Amended (2026-02-28, TODO-DEBT-008 方針反映)

## Context
- Gate 8 では `assetId` 主経路へ移行したが、Startup/Save/Export は復旧・互換の都合で例外が発生しやすい。
- 失敗時の扱い（null/throw/fallback/log）が場面ごとに曖昧だと、回帰と手戻りが増える。

## Decision
- `assetId` 解決失敗時の扱いを、例外カテゴリで固定する。
- 互換維持は原則目的にしない。旧schema入力は normalize せず明示エラーで読み込み拒否する。
- ただしロードクラッシュは避けるため、破損入力は復旧フローへ送る。

### 1) UI-only
- `resolveCutAsset` は `null` を返す。
- 呼び出し側は placeholder 表示で継続する。
- 例外は投げない。必要なら warn ログのみ。

### 2) Export
- 通常cutは該当itemを skip し、warning を残す。
- LipSync など strict 条件（`strictLipSync`）では例外を許可する。

### 3) Load / Recovery
- まず `assetId` で index 補完を試行する。
- 未解決の場合は missing asset として recovery フローへ送る。
- 暗黙に別assetへ置換しない。
- 旧schema入力は明示エラーで読み込み拒否する（normalize しない）。
- 破損入力は復旧フローで扱い、ロードクラッシュを回避する。

### 4) Temporary
- 移行中の一時例外のみ許可する。
- allowlist 管理を必須とし、撤去条件を明記する。
- 共通期限は `M2` 完了時までとする。
- 期限超過の gate fail 判定は `M2` 完了後に定義する（現時点では導入しない）。

- `cut.asset` 直接参照は `src/utils/assetResolve.ts` の fallback に限定し、それ以外の層で増やさない。
- `cut.asset` snapshot seed / fallback は互換期間の暫定扱いとし、段階的に完全廃止する。
- `resolveCutThumbnail` は Temporary legacy bridge として allowlist 管理し、増加を禁止する。

### 禁止線（Gate8）
- `cut.asset` の直接参照は `src/utils/assetResolve.ts` の内部だけとする。
- 例外は allowlist + 期限（または撤去条件）で管理する。
- allowlist は「増加禁止」を先に enforce し、ゼロ化は次フェーズで達成する。

### マイルストーン（Gate8）
- `M1`: allowlist が固定され、新規追加を gate で fail する。
- `M2`: UI 経路が `assetId` 主経路へ統一され、表示互換例外をゼロにする。
- `M3`: 例外を Load/Recovery のみに限定する。
- `M4`: `cut.asset` snapshot seed / fallback を完全廃止する（最終到達点）。

#### M2 達成チェック項目（定義）
- `CutCard` のサムネ解決が `assetId` 主経路で完結し、`resolveCutThumbnail` は clip Temporary 以外で使われていない。
- `DetailsPanel`（単体cut/Group先頭cut）のサムネ解決が `assetId` 主経路で完結し、表示互換 fallback が残っていない。
- `Preview`（`usePreviewItemsState` / `previewItemsBuilder`）の非clip経路で `resolveCutThumbnail` に依存しない。
- Gate監査で `cut.asset` 直接参照と `resolveCutThumbnail` allowlist 外使用が 0 件である（`check:gate:strict`）。

## Consequences
- 失敗時挙動が機能面ごとに一貫する。
- 復旧系の分岐が整理され、監査しやすくなる。
- 将来 `cut.asset` fallback を縮小・廃止する際の前提が揃う。
- 例外が「カテゴリ + 撤去条件付き」で管理されるため、段階縮退の判断基準が明確になる。
- 旧schemaを黙って受け入れないことで、非互換方針を保ったまま復旧導線を維持できる。
