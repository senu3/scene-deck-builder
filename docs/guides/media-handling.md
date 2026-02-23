# Media Handling Overview

## TL;DR
対象: media I/O と ffmpeg実行境界
正本: `assetId` 解決順 / read-path / write-path / missing失敗ポリシー
原則:
- 読み取りは `assetId -> index -> filename` で解決する
- 書き込みは許可境界（VaultGateway / main IPC）以外で行わない
- missing時は暗黙補完せず、用途別に停止または継続を固定する
詳細: 実装手順は implementation と ADR を参照

**目的**: メディア読み書きと失敗時挙動の境界をL1で固定する。  
**適用範囲**: renderer/main の media 解決、ffmpeg 実行、preview/export の missing 挙動。  
**関連ファイル**: `docs/guides/vault-assets.md`, `docs/guides/preview.md`, `docs/guides/export.md`, `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`, `docs/guides/implementation/buffer-memory.md`, `docs/guides/implementation/thumbnail-profiles.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: 動画再生の基本経路は `media://` ストリームとする。
- Must: asset 解決順は `assetId -> index -> filename` を正本とする。
- Must: 読み取り系は `assetId` 主経路で解決し、互換fallbackは限定用途に閉じる。
- Must: index/trash/asset write は VaultGateway または main IPC 境界でのみ実行する。
- Must: ffmpeg 実行は queue 境界（light/heavy）を守る。
- Must: thumbnail 生成入口は profile ベースの単一経路を維持する。
- Must: missing asset の扱いは ADR-0005 の用途別ポリシーに従う。
- Must Not: UI/utility 層から index/trash を直接書き換えない。
- Must Not: missing を暗黙に別 asset へ置換しない。
- Must Not: 大容量メディアの全量base64読み込みに戻さない。

## Canonical Boundaries
- 読み取り正本:
  - 動画は `media://` 経路で範囲読み取りを行う。
  - `assetId` を主キーに解決する。
  - AssetPanel の外部DnDは main IPC で正規化済み実体パスを検証した場合のみ開始する。
  - 解決不能時の fallback は「互換維持に必要な最小経路」のみに限定する。
- 書き込み正本:
  - asset index/trash の更新は VaultGateway 側責務。
  - ffmpeg を伴う生成/抽出/出力は main process 側責務。
- 実行境界:
  - light queue: metadata/thumbnail/PCM decode 系。
  - heavy queue: export/clip/frame など重処理系。

## Missing Asset Policy (Stop Points)
- Preview / UI:
  - `null` 扱いで継続し、プレースホルダ表示にフォールバックする。
- Export:
  - 通常は該当itemを skip + warning。
  - strict 条件では例外停止を許可する。
- Load / Recovery / Save:
  - `assetId` 補完を試行し、未解決なら missing recovery へ送る。
  - 暗黙補完（自動置換）は行わない。

## Read/Write Path Prohibitions
- Read-path 禁止:
  - 読み取り時に write 副作用（index更新、metadata補完保存）を混在させない。
  - 外部DnD開始で renderer 側の任意パス組み立てを許可しない（Vault解決済み path + main再検証）。
- Write-path 禁止:
  - renderer 直書きで `.index.json` / `.trash.json` / vault 実体を更新しない。
  - queue外で ffmpeg 個別spawnを乱立させない。

## Related Docs
- Vault/Asset 正本: `docs/guides/vault-assets.md`
- Preview責務: `docs/guides/preview.md`
- Export責務: `docs/guides/export.md`
- missing失敗ポリシー: `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`
