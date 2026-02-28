# TODO Master

このファイルが docs の TODO 単一入口。
ID は当面維持（`TODO-DEBT-*` など）し、優先度と着手条件は `Track/Status/StartWhen/BlockedBy/DoneWhen` で管理する。

## 運用ルール
- `Track`: `Gate-Work` / `UI-Spec-Pending` / `Bug` / `Investigation` / `Nice-to-have` / `Breaking`
- `Status`: `backlog` / `ready` / `in-progress` / `blocked` / `done`
- `StartWhen`: 着手条件（開始トリガ）
- `BlockedBy`: 前提タスクや判断待ち
- `DoneWhen`: 完了判定条件

## Gate-Work Track
- `TODO-DEBT-008` Gate 8 の最終到達点（`cut.asset` snapshot seed の縮小/廃止条件）を ADR で固定する
  - Track: `Gate-Work`
  - Status: `backlog`
  - StartWhen: Gate 8 廃止移行の実装計画を切るとき
  - BlockedBy: なし
  - DoneWhen: `cut.asset` snapshot seed/fallback 廃止のマイルストーンと完了条件が ADR で確定
  - 関連: `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`
- `TODO-DEBT-010` store内 I/O 直実行の境界を再整理し、PreviewModal VideoClip の command 化計画と整合させる
  - Track: `Gate-Work`
  - Status: `backlog`
  - StartWhen: PreviewModal VideoClip の command 化方針が確定したとき
  - BlockedBy: `TODO-DEBT-008`
  - DoneWhen: store action の I/O 副作用境界が docs で固定され、対象スライスの実行経路が方針に整合
  - 関連: `docs/notes/electronapi-direct-call-audit-memo-2026-02-19.md`
  - 対象例: `src/store/slices/projectSlice.ts`, `src/store/slices/metadataSlice.ts`
- `TODO-DEBT-011` Gate9 の LipSync サムネ解決を `asset.thumbnail` fallback なしで完了させる
  - Track: `Gate-Work`
  - Status: `backlog`
  - StartWhen: LipSyncModal の provider 完全置換バッチを切るとき
  - BlockedBy: なし
  - DoneWhen: LipSyncModal のサムネ解決が resolver API のみになり、snapshot fallback 依存が撤去される
  - 関連: `docs/notes/gate9-provider-unification-update-2026-02-28.md`
- `TODO-DEBT-004` Buffer/Memory ガイドを最新実装検索結果で再棚卸しする
  - Track: `Gate-Work`
  - Status: `backlog`
  - StartWhen: Gate 10 運用の見直し時
  - BlockedBy: `TODO-INVEST-007`
  - DoneWhen: 実装とガイドの乖離を解消し、監査対象外の重処理ポリシーを反映
  - 関連: `docs/guides/implementation/buffer-memory.md`

## UI-Spec-Pending Track
- `TODO-DEBT-002` Preview ガイドの UI 文言を現行実装に合わせて更新する
  - Track: `UI-Spec-Pending`
  - Status: `blocked`
  - StartWhen: Preview UI 文言・表示仕様が凍結したとき
  - BlockedBy: UI 文言の確定
  - DoneWhen: `docs/guides/preview.md` の UI 文言差分が解消
  - 関連: `docs/guides/preview.md`
- `TODO-DEBT-003` SceneDurationBar ガイドの表現を UI 設計確定後に更新する
  - Track: `UI-Spec-Pending`
  - Status: `blocked`
  - StartWhen: Header / SceneDurationBar の最終 UI 仕様が確定したとき
  - BlockedBy: UI 設計確定
  - DoneWhen: `docs/guides/implementation/scene-duration-bar-ui.md` と `docs/guides/implementation/header-ui.md` の文言と実装が一致
  - 関連: `docs/guides/implementation/scene-duration-bar-ui.md`, `docs/guides/implementation/header-ui.md`, `docs/guides/storyline.md`

## Bug Track
- （active item なし）

## Breaking Track
- `TODO-BREAKING-001` LipSync generated IDs の正規化を保存/読み込みに導入する（過去データ migration を含む）
  - Track: `Breaking`
  - Status: `backlog`
  - StartWhen: LipSync ID migration の作業枠を切るとき
  - BlockedBy: なし
  - DoneWhen: migration + 後方互換 + docs 更新が完了
  - 関連: `docs/guides/lip-sync.md`

## Nice-to-have Track
- `TODO-NICE-001` Autosave 設定 UI の interval/保存先連動を実装へ接続する
  - Track: `Nice-to-have`
  - Status: `backlog`
  - StartWhen: Autosave UI 改修の着手時
  - BlockedBy: なし
  - DoneWhen: UI設定が実動作へ反映される
  - 関連: `docs/guides/implementation/autosave-snapshots.md`
- `TODO-NICE-002` Export の AttachAudio ON/OFF UI を `audioBindings[].enabled` で最小導入する
  - Track: `Nice-to-have`
  - Status: `backlog`
  - StartWhen: Export UI 改修の着手時
  - BlockedBy: なし
  - DoneWhen: AttachAudio ON/OFF が export 経路に反映される
  - 関連: `docs/guides/export.md`

## Investigation Track
- `TODO-INVEST-001` Sequence preview で同一ソース連続 clip 切替時の一瞬の buffering を低減する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Preview 再生最適化の検討時
  - BlockedBy: なし
  - DoneWhen: 再現条件と改善案を確定し、必要なら実装チケット化
  - 関連: `docs/guides/preview.md`
  - 補足: `docs/notes/archive/preview-sequence-same-source-clip-buffering-todo-2026-02-14.md`
- `TODO-INVEST-002` Snapshot 永続化（保存形式/保持数/復元 UX）を設計する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Snapshot 機能設計の着手時
  - BlockedBy: なし
  - DoneWhen: 保存形式/保持数/復元UXの仕様が確定
  - 関連: `docs/guides/implementation/autosave-snapshots.md`
- `TODO-INVEST-003` `CUT_RELINKED` の購読側（通知/表示/同期）仕様を確定する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: relink通知の利用箇所拡張時
  - BlockedBy: なし
  - DoneWhen: 購読仕様と表示仕様が docs で確定
  - 関連: `docs/guides/cut-history.md`
- `TODO-INVEST-004` `media-handling.md` の肥大化を監視し、`protocol` / `ffmpeg-queue` / `audio-pcm` 分割の実施条件を確定する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: media-handling 追記が続くとき
  - BlockedBy: なし
  - DoneWhen: 分割条件が定義され、必要に応じて docs 分割
  - 関連: `docs/guides/media-handling.md`
- `TODO-INVEST-005` Preview Debug Overlay HUD（表示専用）を設計する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: デバッグ可視化改善の着手時
  - BlockedBy: なし
  - DoneWhen: HUD 仕様が確定し、state/export 非干渉ルールが明文化
  - 表示候補: `sceneId/cutId/sceneIndex/cutIndex`、`cut.displayTime`（正本値）、再生状態、`sequenceState.localProgress`（参考値）
  - ルール: HUD は state を変更しない / Export に影響させない / 永続化しない
  - 関連: `docs/guides/preview.md`
- `TODO-INVEST-007` Gate 10 の「再生ループ外の重処理」監視方針（計測点・しきい値）を定義する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Gate 10 運用見直し時
  - BlockedBy: なし
  - DoneWhen: 監視方針（計測点/しきい値/運用）が docs で確定
  - 関連: `docs/guides/implementation/gate-checks.md`

## Done (archive)
- 2026-02-28 | `TODO-DEBT-009` Gate9 provider統一（主要経路）と `asset.thumbnail` 直参照の監査運用を追加 | `docs/notes/gate9-provider-unification-update-2026-02-28.md`
- 2026-02-28 | `TODO-DEBT-007` metadata/video metadata の UI直呼びを provider 経由へ整理し、Gate7 監査を拡張 | `docs/notes/electronapi-direct-call-audit-memo-2026-02-19.md#update-2026-02-28`
- 2026-02-27 | `TODO-DEBT-006` utils層の `window.electronAPI` 直呼びを bridge 経由へ移行し、Gate7 utils監査を追加 | `docs/notes/electronapi-direct-call-audit-memo-2026-02-19.md#update-2026-02-27`
- 2026-02-20 | `TODO-DEBT-001` Vaultガイド更新を完了し、Export/Vault仕様を固定 | `docs/notes/archive/todo-done-2026-02.md#todo-debt-001`
- 2026-02-20 | `TODO-DEBT-005` scene attach audio 再ロード復元不具合を修正 | `docs/notes/archive/todo-done-2026-02.md#todo-debt-005`
