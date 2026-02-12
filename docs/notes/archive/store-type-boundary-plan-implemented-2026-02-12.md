# Store Type Boundary Plan

## 目的
- `useStore.ts` に残っている型集約責務（`AppState` 大型定義）を分離し、実装責務と型責務を切り分ける。
- slice 公開面を contract 経由で固定し、変更時の影響範囲を明確にする。

## 適用範囲
- `src/store/useStore.ts`
- `src/store/contracts.ts`
- `src/store/slices/*`
- `src/store/selectors.ts`

## 関連ファイル
- `docs/notes/archive/store-slice-plan-implemented-2026-02-12.md`（完了）
- `src/store/useStore.ts`
- `src/store/contracts.ts`

## 更新頻度
- 中

## ステータス
- 完了（2026-02-12）

## 背景
- `store-slice-plan` により実装は slice 分割済みだが、`AppState` と公開API型は `useStore.ts` に集約されたまま。
- 実装変更と型変更の差分が同じファイルに集中し、レビュー粒度が荒くなりやすい。

## 方針
1. まず型定義だけを分離し、実行時挙動は変えない。
2. 次に contract の境界を強化し、slice の公開面を `Pick<AppState, ...>` 依存から段階的に外す。
3. 最後に selector 側の型参照を整理し、`useStore.ts` への型依存を最小化する。

## フェーズ

### Phase T0: 型の物理分離（無変更移設）
- `AppState` / `SourceFolder` / `ClipboardCut` を `src/store/stateTypes.ts` へ移設。
- `useStore.ts` は型を import するだけにする。

進捗（2026-02-12）:
- `src/store/stateTypes.ts` を追加し、`AppState` / `SourceFolder` / `ClipboardCut` を移設。
- `useStore.ts` から大型 interface 定義を削除し、`AppState` import のみで利用。
- `contracts.ts` / `selectors.ts` / `slices/sliceTypes.ts` / `projectSlice.ts` / `cutTimelineSlice.ts` の型参照先を `stateTypes.ts` に更新。
- `npm run build` と `npm test -- src/store` を通過（挙動変更なし）。

受け入れ条件:
- `npm run build` が通る。
- 振る舞い差分がない（型移設のみ）。

### Phase T1: contract 境界の明確化
- `contracts.ts` を slice 単位で見直し、公開 action/state を明示する。
- slice 実装は contract 型で戻り値を固定する。

進捗（2026-02-12）:
- `contracts.ts` を `Pick<AppState, ...>` 依存から切り離し、slice 単位の明示 interface へ置換。
- `contracts.ts` は `AppState` を import せず、必要な domain 型のみ参照する構成に変更。
- `AppState` は `Project/CutTimeline/SelectionUi/Metadata/Group` の contract を `extends` する形へ変更し、slice API 定義の重複を削減。
- 既存 slice 実装の戻り値 contract は維持され、`npm run build` / `npm test -- src/store` を通過。

受け入れ条件:
- slice 追加時に contract 未更新を型エラーで検出できる。
- `useStore.ts` の interface 追記作業が最小化される。

### Phase T2: selector 型依存の整理
- selector が直接 `AppState` 全体へ依存する箇所を見直す。
- 必要に応じて selector 用型 alias を追加し、変更影響を局所化する。

進捗（2026-02-12）:
- `selectors.ts` は `stateTypes.ts` の `AppState` を参照する方式へ統一（`useStore.ts` 依存なし）。
- 手書き `SelectorState` は撤去し、変更漏れポイントを削減。
- 重複 selector（`selectCacheAssetAction` / `selectUpdateCutAssetAction`）は alias 化で整理。
- `npm run build` / `npm test -- src/store` を通過。

受け入れ条件:
- 主要 selector が `useStore.ts` の型定義変更に引きずられにくい構造になる。

## リスク
- 型移設時に循環 import が発生する可能性。
- contract 厳格化で一時的に型エラーが増える可能性。

## 対策
- T0 は「移設のみ・命名変更なし」で進める。
- T1 は slice ごとに小分けで実施し、都度 build/test を通す。

## TODO
- T0 用の新規型ファイル名を確定する（`store/types.ts` か `store/stateTypes.ts`）。 (完了: `src/store/stateTypes.ts`)
- contract を slice ごとに棚卸しし、過不足を一覧化する。 (完了: T1 で明示 interface 化)
