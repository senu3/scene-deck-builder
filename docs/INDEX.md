# Documentation Index

このドキュメントは、読む順番と責務境界を示す入口。
全ファイル一覧ではなく、判断に必要な導線だけを定義する。

## 1) まず読む
- `docs/ARCHITECTURE.md`
  - 目的 / 不変条件（Must・Must Not）/ 非スコープ / 意思決定ルール。
  - 破壊的変更や大規模改修の前に必ず確認する。
- `docs/L0_USER_MODEL.md`
  - ユーザー視点の概念・画面責務・UI操作とドメイン変更対応を確認する入口。

## 2) ドメイン正本（L1）
- Vault / Assets: `docs/guides/vault-assets.md`
- Storyline: `docs/guides/storyline.md`
- SceneDurationBar: `docs/guides/scene-duration-bar.md`
- Cut/History: `docs/guides/cut-history.md`
- Preview: `docs/guides/preview.md`
- Export: `docs/guides/export.md`
- LipSync: `docs/guides/lip-sync.md`
- AutoClip: `docs/guides/autoclip.md`
- Media Handling: `docs/guides/media-handling.md`

機能追加・仕様変更時は、該当ガイドの更新を必須とする。
ここには運用ルールを記載する。

## 3) 実装ルール（L2）
- `docs/guides/implementation/thumbnail-profiles.md`
- `docs/guides/implementation/export-audio-mix.md`
- `docs/guides/implementation/buffer-memory.md`
- `docs/guides/implementation/autosave-snapshots.md`
- `docs/guides/implementation/gate-checks.md`
- `docs/guides/implementation/commit-rules.md`
- `docs/guides/implementation/ui-components.md`
- `docs/guides/implementation/color-system.md`
- `docs/guides/implementation/electron40-smoke-observability.md`

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
- 1ファイルの先頭に最低限、`TL;DR 目的` `適用範囲` `Must / Must Not` を置く。
- `ARCHITECTURE.md` は不変条件・設計原則が変わる場合のみ更新する。実装関数名・ファイルパス・CLIコマンド・日付付き運用情報は書かない。
- `L0_USER_MODEL.md` はユーザー視点の正本とし、実装詳細・原則説明を記載しない。
- 仕様・実装・調査ログは混在させず、`guides` / `implementation` / `notes` に分離する。
- 一時的な検討メモは `notes` を作成し、 docs へ統合しない。
- 未解決課題は `TODO_MASTER.md` へ記録し、重複TODOを作らない。
- 解決済みの仕様・実装・調査ログやTODOは `notes/archive` に移動する。

## 開発時のチェック順
1. `ARCHITECTURE.md` に反していないか。
2. 関連するドメイン正本（L1）、実装ルール（L2）に違反していないか。
3. TODO を増やす場合に `TODO_MASTER.md` を更新したか。
4. コミットメッセージが `docs/guides/implementation/commit-rules.md`に違反していないか。
