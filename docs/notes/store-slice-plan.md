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
4. 分割前に slice 間依存を下げる仕様整備を優先し、分割後の複雑化を回避する。

## フェーズ

### Phase S0: 依存削減の事前整備（仕様見直し）
- 書き込み責務を Cut 側へ統一し、Asset 側から Cut への直接更新経路を廃止する。
- slice 間の参照を「オブジェクト参照」から「ID 参照」に寄せる（read-time join）。
- Undo/Redo への記録は `executeCommand` 系に一本化し、slice から履歴操作を直接行わない。
- cross-slice の連携はイベント経由（例: `CUT_DELETED`）に限定し、直接 import 呼び出しを抑制する。
- UI 一時状態（モーダル開閉、hover、一時選択など）を domain 更新ロジックから分離する。

受け入れ条件:
- Asset 側操作で Cut を更新する場合も、実行経路が `cutActions` か Command 経由に統一される。
- `cut.assetId` など ID ベースの参照が主経路になり、双方向更新が減る。
- 履歴追加ポイントが `commands` 層へ集約され、Undo/Redo 境界が追跡可能になる。

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
- 参照 ID 化の移行中は selector の取りこぼしで表示不整合が起きる可能性がある。

## 対策
- 初期は `StoreDeps` 型を明示し、slice 間の依存方向を固定する。
- 1フェーズごとに小さくコミットし、回帰時の切り戻しを容易にする。
- S0 で「書き込みオーナー」「履歴オーナー」を先に固定し、分割時の責務逆流を防ぐ。
- ID 化移行時は join selector のユニットテストを先に追加する。

## 追加提案（間に合えば）
- トランザクション単位のコマンド合成を導入し、複数更新を 1 Undo 単位で扱う。
- `store/contracts.ts` のような境界型ファイルを設け、slice 公開面を型で固定する。
- デバッグ用に「どの action がどの slice を更新したか」を開発時ログで可視化する。
- `docs/guides/cut-history-guidelines.md` に「禁止依存（例: slice から他 slice の内部関数直参照）」を明文化する。

## TODO
- `historyStore` と `commands` の責務境界を図示する。
- selector 標準パターンを `docs/guides/cut-history-guidelines.md` に追記する。
- S0 着手前に「Cut 書き込み経路の現状一覧」を作成する。
