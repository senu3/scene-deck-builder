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
- `TODO-INVEST-009` LipSync 見直し計画（課題再棚卸し + v2設計 + 段階移行）を確定する
  - Track: `Investigation`
  - Status: `ready`
  - StartWhen: SequencePlan Phase A の入口統一タスクが着手済みになったとき
  - BlockedBy: `TODO-INVEST-008`
  - DoneWhen: LipSync 課題一覧（再現条件/優先度/フェーズ）が確定し、v2移行方針が docs で固定される
  - 関連: `docs/notes/lipsync-reassessment-plan-2026-03-06.md`
- `TODO-INVEST-008` SequencePlan の単一入口化（Phase A: LIPSync除外）を完了し、Preview/Export parity の基線を固定する
  - Track: `Investigation`
  - Status: `in-progress`
  - StartWhen: VIDEO HOLD 実装前の基盤整備に着手するとき
  - BlockedBy: なし
  - DoneWhen: `buildSequencePlan(project, opts)` が Preview/Export の共通入口となり、`normal/clip/hold/mute/black` を Plan 表現できる
  - 関連: `docs/notes/sequence-plan-phasea-unification-plan-2026-03-06.md`
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
- `TODO-INVEST-004` `media-handling.md` の肥大化を監視し、`protocol` / `ffmpeg-queue` / `audio-pcm` 分割の実施条件を確定する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: media-handling 追記が続くとき
  - BlockedBy: なし
  - DoneWhen: 分割条件が定義され、必要に応じて docs 分割
  - 関連: `docs/guides/media-handling.md`
- `TODO-INVEST-007` Gate 10 の「再生ループ外の重処理」監視方針（計測点・しきい値）を定義する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Gate 10 運用見直し時
  - BlockedBy: なし
  - DoneWhen: 監視方針（計測点/しきい値/運用）が docs で確定
  - 関連: `docs/guides/implementation/gate-checks.md`
- `TODO-INVEST-010` VIDEO HOLD 境界での attachAudio 再生品質（ブツ切り）を最終調整する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: SequencePlan Phase A の最終QAで HOLD 境界の再生品質を確認するとき
  - BlockedBy: `TODO-INVEST-008`
  - DoneWhen: HOLD 境界で attachAudio が再発火せず、体感上のブツ切りが発生しない
  - 関連: `src/components/preview-modal/usePreviewSequenceAudio.ts`, `src/components/preview-modal/__tests__/usePreviewSequenceAudio.test.tsx`
- `TODO-INVEST-011` Export で HOLD 未反映に見えるケースを切り分ける（Plan生成/IPC受け渡し/ffmpegセグメント）
  - Track: `Investigation`
  - Status: `in-progress`
  - StartWhen: HOLD export 実機検証を行うとき
  - BlockedBy: なし
  - DoneWhen: `sequencePlan.exportItems` の hold item 数と `export-sequence-start` の holdItemCount が一致し、MP4 出力で hold が確認できる
  - 関連: `src/utils/sequencePlan.ts`, `src/components/preview-modal/usePreviewExportActions.ts`, `electron/main.ts`

## Done (archive)
- 2026-03-06 | `TODO-DEBT-011` Gate9 の LipSync サムネ resolver-only タスクを見直し計画へ統合し、単独追跡を終了（replaced by `TODO-INVEST-009`） | `docs/notes/archive/gate9-provider-unification-update-2026-02-28.md`, `docs/notes/lipsync-reassessment-plan-2026-03-06.md`
- 2026-03-02 | `TODO-DEBT-010` store action の I/O 副作用境界を docs 固定 + 対象slice実行経路を provider/gateway 境界へ整合 | `docs/notes/archive/store-io-boundary-migration-plan-2026-03-02.md`, `docs/notes/archive/electronapi-direct-call-audit-memo-2026-02-19.md`, `docs/DECISIONS/ADR-0006-store-io-boundary-policy.md`
- 2026-03-01 | `TODO-INVEST-005` Preview Debug Overlay HUD（表示専用）仕様を確定し、DevOverlayHost へ DnD debug HUD を分離 | `docs/guides/implementation/debug-overlay.md` (`309b95e`, `7514b0b`)
- 2026-03-01 | `TODO-INVEST-003` `CUT_RELINKED` の購読側（通知/表示/同期）仕様を凍結（origin/opId/allowlist/表示境界） | `docs/guides/cut-history.md`
- 2026-02-28 | `TODO-DEBT-008` Gate8 例外カテゴリ/禁止線/マイルストーン（M1-M4）を ADR で固定 | `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`
- 2026-02-28 | `TODO-DEBT-009` Gate9 provider統一（主要経路）と `asset.thumbnail` 直参照の監査運用を追加 | `docs/notes/archive/gate9-provider-unification-update-2026-02-28.md`
- 2026-02-28 | `TODO-DEBT-007` metadata/video metadata の UI直呼びを provider 経由へ整理し、Gate7 監査を拡張 | `docs/notes/archive/electronapi-direct-call-audit-memo-2026-02-19.md#update-2026-02-28`
- 2026-02-27 | `TODO-DEBT-006` utils層の `window.electronAPI` 直呼びを bridge 経由へ移行し、Gate7 utils監査を追加 | `docs/notes/archive/electronapi-direct-call-audit-memo-2026-02-19.md#update-2026-02-27`
- 2026-02-20 | `TODO-DEBT-001` Vaultガイド更新を完了し、Export/Vault仕様を固定 | `docs/notes/archive/todo-done-2026-02.md#todo-debt-001`
- 2026-02-20 | `TODO-DEBT-005` scene attach audio 再ロード復元不具合を修正 | `docs/notes/archive/todo-done-2026-02.md#todo-debt-005`
