# Store Slice Plan

## 目的
- `useStore` の責務集中を解消し、Cut/Group/History/UI の変更影響を局所化する。
- Undo/Redo 境界と runtime 状態の分離を、型と実装の両面で維持しやすくする。

## 適用範囲
- `src/store/useStore.ts`
- `src/store/historyStore.ts`
- `src/store/commands.ts`
- `src/components/*` の `useStore` 利用箇所

## 関連ファイル
- `docs/guides/cut-history-guidelines.md`
- `docs/notes/archive/cut-refactor-plan-implemented-2026-02-12.md`
- `src/store/useStore.ts`
- `src/store/commands.ts`

## 更新頻度
- 中

## 背景（現状）
- `useStore.ts` が 1500 行超で、Project/Folder/Timeline/Cut/Group/Metadata/UI を単一ファイルで保持している。
- Phase 3 で `CutRuntimeState` 分離と Command 境界の明確化は進んだが、実装境界は未分割。

## 分割方針
1. まずは「公開 API を維持」して内部実装のみ分割する。
2. 次段で selector ルールを統一し、コンポーネント側の依存粒度を下げる。
3. 最後に不要 API を削減し、`useStore` を薄い統合レイヤーにする。

## フェーズ

### Phase S1: 内部分割（互換重視）
- `src/store/slices/cutTimelineSlice.ts`
- `src/store/slices/groupSlice.ts`
- `src/store/slices/selectionUiSlice.ts`
- `src/store/slices/projectSlice.ts`
- `src/store/slices/metadataSlice.ts`

受け入れ条件:
- 既存の `useStore` 呼び出しシグネチャを維持する。
- `npm run build` が通る。

### Phase S2: selector 整理
- コンポーネントごとに必要 state/actions だけを取得する selector に寄せる。
- 「直接 state 全体参照」を段階削減する。

受け入れ条件:
- 主要 UI (`App`, `Storyline`, `CutCard`, `AssetPanel`, `DetailsPanel`) の selector が明示される。
- 不要再レンダリングが増えない。

### Phase S3: API 整理
- 互換維持のため残していた重複 API を削減する。
- ガイドライン（Command 境界、runtime 境界）に違反する更新経路を削除する。

受け入れ条件:
- `docs/guides/cut-history-guidelines.md` と実装が一致する。
- Undo/Redo 対象操作の境界が docs とコードで一致する。

## リスク
- 分割時に循環参照が入りやすい。
- slice 間の依存が強く、分割しても複雑度が下がらない可能性がある。

## 対策
- 初期は `StoreDeps` 型を明示し、slice 間の依存方向を固定する。
- 1フェーズごとに小さくコミットし、回帰時の切り戻しを容易にする。

## TODO
- `historyStore` と `commands` の責務境界を図示する。
- selector 標準パターンを `docs/guides/cut-history-guidelines.md` に追記する。
