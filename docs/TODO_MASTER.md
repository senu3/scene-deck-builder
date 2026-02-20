# TODO Master

このファイルが docs の TODO 単一入口。
各ガイドには詳細を置かず、ここへのリンクのみ残す。

## Breaking候補
- `TODO-BREAKING-001` LipSync generated IDs の正規化を保存/読み込みに導入する（過去データ migration を含む）。
  - 関連: `docs/guides/lip-sync.md`

## Debt
- `TODO-DEBT-001` Export 系フロー仕様確定後に Vault ガイドを更新する。
  - 関連: `docs/guides/vault-assets.md`
- `TODO-DEBT-002` Preview ガイドの UI 文言を現行実装に合わせて更新する。
  - 関連: `docs/guides/preview.md`
- `TODO-DEBT-003` SceneDurationBar ガイドの表現を UI 設計確定後に更新する。
  - 関連: `docs/guides/scene-duration-bar.md`
- `TODO-DEBT-004` Buffer/Memory ガイドを最新実装検索結果で再棚卸しする。
  - 関連: `docs/guides/implementation/buffer-memory.md`
- `TODO-DEBT-005` SceneAudio を保存したプロジェクト再ロード時に、`metadataStore.sceneMetadata.attachAudio` は復元されても `assetCache` に音声Assetが戻らず再生/表示に反映されない不具合を修正する。
  - 関連: `src/store/slices/metadataSlice.ts`
  - 関連: `src/store/slices/projectSlice.ts`
  - 関連: `src/utils/previewAudioTracks.ts`
- `TODO-DEBT-006` utils層の `window.electronAPI` 直呼びを provider/gateway 経由へ段階移行する。
  - 関連: `docs/notes/electronapi-direct-call-audit-memo-2026-02-19.md`
  - 対象例: `src/utils/assetPath.ts`, `src/utils/metadataStore.ts`, `src/utils/audioUtils.ts`, `src/utils/lipSyncUtils.ts`
- `TODO-DEBT-007` metadata / video metadata 呼び出しを横断整理し、UI直呼びの責務を縮小する。
  - 関連: `docs/notes/electronapi-direct-call-audit-memo-2026-02-19.md`
  - 対象例: `src/components/AssetPanel.tsx` の `getVideoMetadata` と metadata 系呼び出し
- `TODO-DEBT-008` Gate 8 の最終到達点（`cut.asset` snapshot seed の縮小/廃止条件）を ADR で固定する。
  - 関連: `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`
  - 補足: 方針は「完全廃止（段階実施）」。現状の load seed 用 snapshot / fallback を計画的に削減する。
- `TODO-DEBT-009` Gate 9 の provider統一を段階実施し、`asset.thumbnail` 直参照を新規コード禁止ルールとして運用する。
  - 関連: `docs/guides/implementation/thumbnail-profiles.md`

## Nice-to-have
- `TODO-NICE-001` Autosave 設定 UI の interval/保存先連動を実装へ接続する。
  - 関連: `docs/guides/implementation/autosave-snapshots.md`
- `TODO-NICE-002` Export の AttachAudio ON/OFF UI を `audioBindings[].enabled` で最小導入する。
  - 関連: `docs/guides/export.md`

## Investigations
- `TODO-INVEST-001` Sequence preview で同一ソース連続 clip 切替時の一瞬の buffering を低減する。
  - 関連: `docs/guides/preview.md`
  - 補足: `docs/notes/archive/preview-sequence-same-source-clip-buffering-todo-2026-02-14.md`
- `TODO-INVEST-002` Snapshot 永続化（保存形式/保持数/復元 UX）を設計する。
  - 関連: `docs/guides/implementation/autosave-snapshots.md`
- `TODO-INVEST-003` `CUT_RELINKED` の購読側（通知/表示/同期）仕様を確定する。
  - 関連: `docs/guides/cut-history.md`
- `TODO-INVEST-004` `media-handling.md` の肥大化を監視し、`protocol` / `ffmpeg-queue` / `audio-pcm` 分割の実施条件を確定する。
  - 関連: `docs/guides/media-handling.md`
- `TODO-INVEST-005` Preview Debug Overlay HUD（表示専用）を設計する。
  - 表示候補: `sceneId/cutId/sceneIndex/cutIndex`、`cut.displayTime`（正本値）、再生状態、`sequenceState.localProgress`（参考値）。
  - ルール: HUD は state を変更しない / Export に影響させない / 永続化しない。
  - 関連: `docs/guides/preview.md`
- `TODO-INVEST-007` Gate 10 の「再生ループ外の重処理」監視方針（計測点・しきい値）を定義する。
  - 関連: `docs/guides/implementation/gate-checks.md`
