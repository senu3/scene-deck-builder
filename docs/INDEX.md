# Documentation Index

このドキュメントは、読む順番と責務境界を示す入口。
全ファイル一覧ではなく、判断に必要な導線だけを定義する。

## 1) まず読む
- `docs/ARCHITECTURE.md`
  - 目的 / 不変条件（Must・Must Not）/ 非スコープ / 意思決定ルール。
  - 破壊的変更や大規模改修の前に必ず確認する。

## 2) ドメイン正本（L1）
- Vault / Assets: `docs/guides/vault-assets.md`
- Storyline: `docs/guides/storyline.md`
- Preview: `docs/guides/preview.md`
- Export: `docs/guides/export.md`
- LipSync: `docs/guides/lip-sync.md`
- AutoClip: `docs/guides/autoclip.md`
- Media Handling: `docs/guides/media-handling.md`

機能追加・仕様変更時は、該当ガイドの更新を必須とする。

## 3) 実装ルール（L2）
- `docs/guides/implementation/thumbnail-profiles.md`
- `docs/guides/implementation/cut-history.md`
- `docs/guides/implementation/export-audio-mix.md`
- `docs/guides/implementation/buffer-memory.md`
- `docs/guides/implementation/scene-duration-bar.md`
- `docs/guides/implementation/autosave-snapshots.md`
- `docs/guides/implementation/ui-components.md`
- `docs/guides/implementation/color-system.md`

ここには思想ではなく、実装上の判断基準・制約を記載する。

## 4) 用語と対応表（参照正本）
- `docs/references/DOMAIN.md`
- `docs/references/MAPPING.md`

命名、概念対応、型マッピングはこの2ファイルを正本とする。

## 5) 決定ログ
- `docs/DECISIONS/`

重要な設計判断・破壊的変更・構造変更は ADR で残す。

## 6) TODO 管理
- `docs/TODO_MASTER.md`

TODO は各ガイドに散在させない。元ドキュメントには `TODO_MASTER` へのリンクのみ残す。

## docs 追加/更新ルール
- 追加した docs は本 INDEX から辿れる構造にする。
- 1ファイルの先頭に最低限、`目的` `適用範囲` `Must / Must Not` を置く。
- 仕様・実装・調査ログは混在させず、必要なら `guides` / `implementation` / `notes/archive` に分離する。
- 未解決課題は `TODO_MASTER.md` へ記録し、重複TODOを作らない。

## 開発時のチェック順
1. `ARCHITECTURE.md` に反していないか。
2. 変更対象のドメイン正本（L1）を更新したか。
3. 実装ルール（L2）に違反していないか。
4. TODO を増やす場合に `TODO_MASTER.md` を更新したか。
