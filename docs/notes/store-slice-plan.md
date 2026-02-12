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

進捗（2026-02-12）:
- `commands.ts` の `confirm()` を撤去し、Undo 実行前の確認は UI 層（`Header`）で行う方式へ移行した。
- `src/store/contracts.ts` を追加し、slice 公開境界型（contract）を集約した。
- `metadataSlice` の `attach/detach/updateCutAudioOffset` は `setCutAudioBindings` 経由へ移行し、Asset 側から Cut 直接更新する経路を削減した。
- `CUT_DELETED` の store event を導入し、`removeCut` / `removeScene` で発火するようにした。
- `applyStoreEvents` を `useStore` 統合レイヤーに追加し、`CUT_DELETED` に伴う group/selection の後処理をイベント経由で集約した。
- `CUT_MOVED` / `CUT_RELINKED` を追加し、移動時の group 後処理をイベント経由に統一した。
- `commands` の Cut 復元系は `assetId` を主キーに `getAsset(assetId)` で解決し、fallback として `cut.asset` を利用する形に寄せた。
- `copySelectedCuts` は `assetId` から `assetCache` 解決を優先し、`cut.asset` への依存を弱めた。
- 主要 UI（`CutCard` / `AssetPanel` / `DetailsPanel` / `PreviewModal`）で `getAsset(assetId)` 優先の read-time join へ寄せた。
- Export manifest 生成でも `assetId -> getAsset` 優先で解決し、`cut.asset` は fallback に限定した。
- `PreviewModal` の再生判定/URL生成/表示情報/範囲Exportで `resolveCutAsset(assetId優先)` を導入し、`currentItem.cut.asset` 直参照を削減した。
- `StartupModal` の relink 処理は `cut.assetId` 優先で import ID を決定し、legacy 相対パス判定を helper 化した。
- `relinkCutAsset` は metadata 側の直接書き換えをやめ、`updateCutWithAsset`（cut action）経由へ寄せた。
- Cut 復元・複製時は `assetId` のみで再生成可能にし、asset 未解決時は loading cut で復元する fallback を追加した。
- Clipboard は `asset` を optional 化し、paste 時は `assetId` 解決を優先する経路に変更した。

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
- `src/store/useStore.ts` は slice 合成のみを担う統合レイヤーにする。

受け入れ条件:
- 既存の `useStore` 呼び出しシグネチャを維持する。
- `npm run build` が通る。

進捗（2026-02-12）:
- 実装完了。上記 5 slice を追加し、`useStore` を統合レイヤー化した。
- `npm run build` 通過、`npm test -- src/store`（5 files / 14 tests）通過。

### Phase S2: selector 整理
- コンポーネントごとに必要 state/actions だけを取得する selector に寄せる。
- 「直接 state 全体参照」を段階削減する。

進捗（2026-02-12）:
- `src/store/selectors.ts` を追加し、`App` / `Storyline` / `CutCard` / `AssetPanel` / `DetailsPanel` / `PreviewModal` を selector 取得へ移行した。

受け入れ条件:
- 主要 UI (`App`, `Storyline`, `CutCard`, `AssetPanel`, `DetailsPanel`) の selector が明示される。
- 不要再レンダリングが増えない。

### Phase S3: API 整理
- 互換維持のため残していた重複 API を削減する。
- ガイドライン（Command 境界、runtime 境界）に違反する更新経路を削除する。
- `commands.ts` から `confirm()` など UI 依存を排除し、UI 層で確認してから Command を実行する構造へ移行する。
- 「Command 必須操作」を明示し、対象操作は直接 action 呼び出しを禁止する。

進捗（2026-02-12）:
- `commands.ts` の `confirm()` 依存を撤去済み（UI 層確認に統一）。
- `docs/guides/cut-history-guidelines.md` に Command 必須操作を明示。
- `CutCard` / `AssetPanel` の paste・group 作成を `PasteCutsCommand` / `CreateGroupCommand` 経由へ移行。
- clip finalize / image crop 後の group 順序同期を `UpdateGroupCutOrderCommand` 経由へ移行し、直接 action 呼び出しを削除。

受け入れ条件:
- `docs/guides/cut-history-guidelines.md` と実装が一致する。
- Undo/Redo 対象操作の境界が docs とコードで一致する。
- Command 必須操作リスト（例: scene/cut/group の構造変更、clip point 更新）が docs 化され、主要 UI 実装が準拠している。

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
- selector 標準パターンを `docs/guides/cut-history-guidelines.md` に追記する。 (完了: 2026-02-12)
- S0 着手前に「Cut 書き込み経路の現状一覧」を作成する。 (完了: `docs/notes/cut-write-path-inventory.md`)
- `commands.ts` の `confirm()` 呼び出しを撤去し、UI 層へ移設する設計メモを追加する。 (完了: 2026-02-12)
- `src/store/contracts.ts`（仮）を作成し、`AppState` と slice 公開型の配置を定義する。 (完了: 2026-02-12)

## historyStore / commands 責務境界（2026-02-12）

```
UI Layer
  -> (事前確認・入力確定)
  -> historyStore.executeCommand(command)

historyStore
  - Command 実行順序管理
  - undoStack / redoStack 管理
  - undo/redo の入口提供
  - domain ロジックは持たない

commands.ts
  - 1操作単位の execute/undo を実装
  - 実データ更新は useStore action を呼ぶ
  - UI API (confirm/alert/modal) は呼ばない

useStore / slices
  - 実際の state 更新（source of truth）
  - history には依存しない
```

## 保留事項
- ビルド時の chunk size warning（renderer > 500kB）対応は将来タスクとして保留（本プラン対象外）。
