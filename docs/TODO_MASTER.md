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
  - 関連: `docs/guides/domain/scene-duration-bar.md`
- `TODO-DEBT-004` Buffer/Memory ガイドを最新実装検索結果で再棚卸しする。
  - 関連: `docs/guides/implementation/buffer-memory.md`

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
  - 関連: `docs/guides/domain/cut-history.md`
- `TODO-INVEST-004` `media-handling.md` の肥大化を監視し、`protocol` / `ffmpeg-queue` / `audio-pcm` 分割の実施条件を確定する。
  - 関連: `docs/guides/media-handling.md`
