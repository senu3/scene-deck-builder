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

## 現在の実装状況 (2026-03-10)
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
  - LipSync metadata 登録は `src/features/metadata/lipSyncActions.ts` の feature entry へ移し、`metadataSlice.setLipSyncForAsset` / `clearLipSyncForAsset` の auto-save を撤去した。
  - cut relink 時の LipSync generated asset cleanup も feature entry で明示的に起動し、`metadataSlice.relinkCutAsset` から async cleanup を外した。
  - `src/features/project/sourcePanelProvider.ts` を拡張し、`Sidebar` の source folder 選択/refresh/drop も provider/bridge 経由へ寄せた。
  - `AssetPanel` の asset folder 読み込み / bulk import / pathExists の read-import 入口も既存 bridge/provider 経由へ寄せ、UI 直 `window.electronAPI` を縮退した。
  - `src/features/asset/import.ts` を追加し、`AssetModal` / `DetailsPanel` の asset import と `MissingAssetRecoveryModal` の file dialog を bridge/helper 経由へ寄せた。
  - `usePreviewExportActions` の sequence export、`DetailsPanel` の frame capture、`src/features/cut/actions.ts` の ffmpeg queue / finalize / extract / crop も `electronGateway` bridge 経由へ移した。
  - `AssetPanel` の OS drag 開始と `ImageCropModal` の preview file read も bridge 経由へ寄せた。
  - `App.tsx` の export / frame capture、`EnvironmentSettingsModal` の FFmpeg settings / versions、`thumbnails/provider` の thumbnail read も bridge 経由へ寄せ、通常 UI からの `window.electronAPI` 直参照を `electronGateway` へ集約した。
  - Startup / Header / Sidebar の desktop unavailable 判定も `hasElectronBridge()` へ寄せ、demo/unavailable 分岐の `window` 依存を薄くした。
  - dev overlay に effect activity panel を追加し、`issued / start / success / failure` と `effectType / orderingKey / commandType` を開発時に追跡できるようにした。
  - `docs/notes/archive/sequence-plan-timing-inventory-implemented-2026-03-10.md` を追加し、Preview / Export parity へ影響する timing 経路と preview-only helper を棚卸し表で固定した。
- 残タスク:
  - 新規 Preview / Export parity 変更時に、timing 経路が inventory の `Keep` / `Contain` を逸脱していないかを継続確認する。

## フェーズ計画
### 0.5. インベントリ固定
- 置換対象を `I/O / timing再計算 / metadata整合 / thumbnail` で分類して棚卸し表にする。
- 現時点の優先監査対象は `metadataSlice`, `projectSlice`, `cutTimelineSlice`, Preview/Export の timing 入口。
- timing 経路の棚卸しは `docs/notes/archive/sequence-plan-timing-inventory-implemented-2026-03-10.md` に固定した。

### 1. Effects / dispatcher 基盤
- `AppEffect` に属性分類を持たせ、`dispatchAppEffects` を commit/deferred 分岐込みの単一出口にする。
- `EffectRunner` は orchestration のみ担当し、I/O 実装は provider/gateway に委譲する。

### 2. Command 統合
- `historyStore.executeCommand` で `command.apply()` を評価し、初回 execute 後だけ effects を流す。
- Undo/Redo は state のみを対象にし、副作用再実行を行わない。

### 2.5. 観測性
- effect 発行 / 開始 / 完了 / 失敗を開発時のみ activity log に残す。
- `commandId` / `commandType` と effect を紐付けて追跡可能にする。
- dev overlay 上の `EffectActivityDebugModule` で直近 activity を確認できるようにした。

### 3. 個別経路移行
- metadata save/delete と clip thumbnail regeneration は実装済み。
- scene / scene note metadata 保存も command effect 化済み。
- scene/group audio binding の保存も command effect 化済み。
- project save / recent projects / asset index save も effect 化済み。
- load/init 系 I/O は `project/session`、load 完了後の state 適用・recovery finalize は `project/apply` に寄せたので、残りは lipsync 系の保存責務整理と UI 側の軽量化。
- LipSync metadata 登録/cleanup も feature entry 化したので、残りは metadata 系の保存責務整理と UI 側の軽量化。
- source panel の read path も provider/bridge 化を進め、残りは asset panel など他 UI 入口の棚卸し。
- asset panel の read/import 入口も bridge/provider 化を進め、残りは drag/export 系と details 側 UI 入口の棚卸し。
- asset import/export と cut feature の ffmpeg 系も bridge 化を進め、残りの直 gateway は demo/unavailable 分岐と一部 drag/provider に集約されつつある。
- 主要な preview export / asset import / relink / frame capture / missing recovery に加え、settings / thumbnail provider / unavailable 判定も bridge/helper 経由に揃った。
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
