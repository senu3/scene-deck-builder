# Store/UI/Feature にじみ防止 移行計画 (2026-03-05)

## TL;DR
- store/slice から I/O と再計算を段階的に剥がし、`dispatchAppEffects` を副作用実行の唯一出口に寄せる。
- Command は段階移行で `apply() -> { effects[], warnings[] }` を返し、初回 execute 時のみ effect を流す。
- metadata 削除不整合は `FILES_DELETE -> INDEX_UPDATE -> METADATA_DELETE` の順序固定で抑止し、warning を structured に返す。

## 目的
- store/UI/feature 間でロジック・I/O・再計算の責務が混ざる状態を解消する。
- Undo/Redo と副作用の境界を明確化し、挙動の予測可能性を上げる。

## 適用範囲
- 対象:
  - `src/store/slices/*`
  - `src/features/*`
  - metadata 削除・project load/save・thumbnail 再生成などの副作用経路
- 非対象:
  - イベントソーシング全面導入
  - main 側永続ジョブキュー導入
  - payload の早期正規化

## Must / Must Not
- Must: store/slice から I/O 直呼びを新規追加しない。
- Must: 構造変更（add/remove/move/reorder/group編集）は Command 経由のみとする。
- Must: effect は `channel / orderingKey / idempotent / coalescible / failurePolicy` を持つ。
- Must: `dispatchAppEffects` を副作用実行の唯一出口とし、`commit` と `deferred` を分ける。
- Must: renderer 側に `EffectRunner` を置き、`commit` は逐次実行を基本とする。
- Must: Undo/Redo は state のみを対象とし、副作用は巻き戻さない。
- Must Not: 副作用を Command 内で直接実行しない。
- Must Not: Preview / Export に `SequencePlan` を迂回する timing 再計算を新規追加しない。
- Must Not: 初期段階で汎用永続キューや複雑な正規化を導入しない。

## Done判定
- store/slice から I/O直呼びが新規に増えない。
- 構造変更（add/remove/move/reorder/group編集）が Command 経由のみになっている。
- metadata 削除不整合（先に metadata 消去して削除失敗など）が順序固定で抑止されている。
- Preview / Export の parity 影響領域で `SequencePlan` を通らない timing 再計算が新規に増えていない。

## 現在の実装状況 (2026-03-09)
- 実装済み:
  - `src/features/platform/effects` に effect 属性、`SAVE_METADATA`、warning 生成、開発時 activity 記録を追加。
  - `dispatchAppEffects` を導入し、`metadataSlice.saveMetadata` / `deleteAssetWithPolicy` / thumbnail effect 発行を同じ出口へ統一。
  - `historyStore.executeCommand` が `command.apply()` を初回 execute 後に評価し、effects を dispatch する経路を追加。
  - `UpdateClipPointsCommand` / `ClearClipPointsCommand` を `apply()` 対応し、timeline-card thumbnail 再生成を command effect 化。
  - scene / scene note 系 command が `SAVE_METADATA` effect を返すようになり、`cutTimelineSlice` の scene metadata 保存直呼びを撤去。
  - scene/group audio binding は setter の自動保存をやめ、初回 execute 時のみ command effect で metadata 保存する形に移行。
  - `StartupModal` / `useHeaderProjectController` の project save/load / recent projects / asset index save は `electronGateway` bridge 経由へ寄せ、UI 直 `window.electronAPI` 呼びを縮退。
  - `SAVE_PROJECT` / `SAVE_RECENT_PROJECTS` / `SAVE_ASSET_INDEX` effect を追加し、header/startup の save 系 write は `dispatchAppEffects` 経由へ移行。
  - `src/features/project/session.ts` を追加し、recent cleanup / vault選択 / project作成初期化 / project選択読込 / path指定読込 / load outcome 構築を feature 入口へ集約。
  - `src/features/project/load.ts` の project load 補助も bridge 経由へ寄せ、project feature 配下の `window.electronAPI` 直呼びを撤去。
  - `src/features/project/apply.ts` を追加し、load 後の共通 apply/finalize を `finalizePendingProjectLoad` に集約。Startup / Header / path 指定が同じ store 適用・recent 更新・migration save 経路を通るようにした。
  - recovery で cut が削除された場合は、その cut の `cutRuntimeById.hold` を復元しないようにし、load 完了後 state の runtime 残骸を防止。
- 未完了:
  - `projectSlice` と metadata/lipsync 系に残る `saveMetadata()` 依存のさらに外側の直呼び棚卸し。
  - load/init 後の UI 状態更新と desktop unavailable 分岐のさらなる縮退。
  - Preview / Export parity に影響する timing 再計算の棚卸し表固定。
  - effect activity の簡易ビュー実装。

## フェーズ計画
### 0.5. インベントリ固定
- 置換対象を `I/O / timing再計算 / metadata整合 / thumbnail` で分類して棚卸し表にする。
- 現時点の優先監査対象は `metadataSlice`, `projectSlice`, `cutTimelineSlice`, Preview/Export の timing 入口。

### 1. Effects / dispatcher 基盤
- `AppEffect` に属性分類を持たせ、`dispatchAppEffects` を commit/deferred 分岐込みの単一出口にする。
- `EffectRunner` は orchestration のみ担当し、I/O 実装は provider/gateway に委譲する。

### 2. Command 統合
- `historyStore.executeCommand` で `command.apply()` を評価し、初回 execute 後だけ effects を流す。
- Undo/Redo は state のみを対象にし、副作用再実行を行わない。

### 2.5. 観測性
- effect 発行 / 開始 / 完了 / 失敗を開発時のみ activity log に残す。
- `commandId` / `commandType` と effect を紐付けて追跡可能にする。

### 3. 個別経路移行
- metadata save/delete と clip thumbnail regeneration は実装済み。
- scene / scene note metadata 保存も command effect 化済み。
- scene/group audio binding の保存も command effect 化済み。
- project save / recent projects / asset index save も effect 化済み。
- load/init 系 I/O は `project/session`、load 完了後の state 適用・recovery finalize は `project/apply` に寄せたので、残りは lipsync 系の保存責務整理と UI 側の軽量化。
- Preview / Export は `SequencePlan` を正本にし、timing 再計算の散在を新規追加禁止とする。

## metadata 削除ポリシー（Follow-up Update）
- 削除順序は `FILES_DELETE -> INDEX_UPDATE -> METADATA_DELETE` に固定する。
- `FILES_DELETE` 失敗時は後続停止。
- `INDEX_UPDATE` 失敗時は `METADATA_DELETE` を実行しない。
- `INDEX_UPDATE` / `METADATA_DELETE` 失敗時は warning を返し、state/metadata を可能な限り維持して不整合を最小化する。
- 初期段階では自動 retry を入れない。
- index 更新は逐次実行（serialized mutation）で競合を抑止する。

## やらないこと
- イベントソーシング全面導入。
- Effects payload の先行正規化。
- 初期段階での main 側ジョブ永続化。
