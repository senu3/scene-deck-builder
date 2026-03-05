# Vault / Asset Guide

## TL;DR
対象：Vault内アセット管理の運用ルール
正本：.index.json / .metadata.json / .trash/.trash.json
原則：
- asset は `assetId` で解決する
- asset index が実体ファイル対応の正本
- 削除は trash + log による履歴管理
- JSON + Vault から recovery できる
詳細：実装分岐は implementation を参照

**目的**: Vault と asset 管理の不変条件を定義する。  
**適用範囲**: `vault/assets`, `.index.json`, `.metadata.json`, `.trash`。  
**関連ファイル**: `docs/guides/export.md`, `docs/guides/media-handling.md`, `docs/guides/preview.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Asset は `vault/assets/` に保存する。
- Must: `assetId -> filename` 対応は `.index.json` を正本とする。
- Must: Asset 解決は `assetId` を主経路とする。
- Must: 削除時は asset を `.trash/` へ移動し `.trash.json` に履歴を残す。
- Must: asset index は asset 解決（`assetId -> filename`）の正本として扱う。
- Must Not: `.metadata.json` を asset index の代替として使わない。
- Must Not: Vault 内 asset を再コピーして二重登録しない。

## 復元ポリシー
- 復元は次の順序で行う。
  1. `project.sdp`
  2. `.index.json`
  3. `.metadata.json`
  4. `.trash/.trash.json`

## 正本ファイルの責務
- `.index.json`:
  - Asset識別と実体ファイル対応の正本。
  - 保持情報例: assetId / filename / hash / type / importedAt
- `.metadata.json`:
  - Asset/Scene の補助メタ情報を保持する。
  - 例: audio attachment / analysis / scene notes
- `.trash/.trash.json`:
  - 削除・退避の監査ログを保持する。

## 参照整合ルール
- Asset参照グラフは、cut参照・audio参照・lip sync参照を一貫して追跡する。
- 参照中Assetは、参照チェックを通過した場合のみ削除可能とする。
- 削除時は「物理移動」「index更新」「参照掃除」を同一方針で実行する。
- 資産解決順は `assetId -> index -> filename` を正とする。

## 境界ルール
- VaultGateway が担当:
  - index/trash の更新
  - import/register/trash move の書き込み責務
- main IPC が担当:
  - AssetPanel からの外部DnD開始時に `vault/assets` 配下かつ実在ファイルかを検証し、OSへファイル受け渡しを開始する。
- VaultGateway が担当しない:
  - export計画生成
  - preview制御
  - renderer内の表示ロジック

## 関連ガイド
- Export canonical flow の正本: `docs/guides/export.md`
- media I/O と queue 運用: `docs/guides/media-handling.md`
- store/UI/feature にじみ防止の移行計画: `docs/notes/store-ui-feature-effects-migration-plan-2026-03-05.md`
- 詳細運用・経緯メモ: `docs/notes/`
