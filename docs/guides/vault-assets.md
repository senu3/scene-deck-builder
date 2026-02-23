# Vault / Asset Guide

## TL;DR
対象：Vault内アセット管理の運用ルール
正本：.index.json / .metadata.json / .trash/.trash.json
原則：
- 正本は単一入口で更新する
- assetIdを主経路で解決する
- Exportはcanonical入力から生成する
詳細：実装分岐は implementation を参照

**目的**: Vault と asset 管理の不変条件を定義する。  
**適用範囲**: `vault/assets`, `.index.json`, `.metadata.json`, `.trash`。  
**関連ファイル**: `docs/guides/export.md`, `docs/guides/media-handling.md`, `docs/references/DOMAIN.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: `.index.json` / `.trash/.trash.json` の書き込みは VaultGateway 経由に統一する。
- Must: `assetId -> filename` 対応を `.index.json` に保持する。
- Must: `originalPath` は vault-relative を維持する。
- Must: `originalPath` は復元補助専用として扱う。
- Must: 資産解決は `assetId` を主経路とする。
- Must: 参照中Assetの物理削除は禁止し、trash move のみ許可する。
- Must Not: renderer から index/trash を直接書き換えない。
- Must Not: `vault/assets` 内の生成物を再コピーして二重登録しない。
- Must Not: `.metadata.json` に asset識別情報を書かない。
- Must Not: Export 側仕様を本ガイドで再定義しない。

## 復元要件（正本）
- `project.sdp` は構成（Scene/Cut順）を復元できること。
- `.index.json` は `assetId` から実ファイルを復元できること。
- `.metadata.json` は補助情報（表示時間・解析・LipSync等）を保持すること。
- `.trash/.trash.json` は削除履歴を追跡できること。

## 正本ファイルの責務
- `.index.json`:
  - Asset識別と実体ファイル対応の正本。
  - 重複登録時も `assetId` ごとの対応を失わない。
- `.metadata.json`:
  - Asset/Scene の補助メタ情報を保持する。
  - asset index の代替として使わない。
- `.trash/.trash.json`:
  - 削除・退避の監査ログを保持する。

## 参照整合ルール
- Asset参照グラフは、cut参照・audio参照・lip sync参照を一貫して追跡する。
- 参照中Assetの削除はポリシーで禁止/制御する。
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
- Exportの時系列・出力境界: `docs/guides/export.md`
- media I/O と queue 運用: `docs/guides/media-handling.md`
- 詳細運用・経緯メモ: `docs/notes/`
