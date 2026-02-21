# Phase 3 Guides Compression Plan (2026-02-21)

## 目的
- `docs/guides/*.md`（L1）の探索コストを下げる。
- 実装詳細・経緯・運用メモをL1から分離する。

## 対象境界
- 圧縮対象: `docs/guides/*.md`
- 維持対象: `docs/guides/implementation/*.md`（必要最小限の更新のみ）

## 優先順位（高 -> 低）
1. `docs/guides/vault-assets.md`
   - 行数最大（203行）。Export詳細・API詳細・運用経緯が混在。
2. `docs/guides/cut-history.md`
   - Command一覧・日付付き運用・実装詳細が集中。
3. `docs/guides/scene-duration-bar.md`
   - Header/UI詳細が多く、L1責務を超える情報が混在。
4. `docs/guides/lip-sync.md`
   - 実装型定義・処理詳細が長文化。
5. `docs/guides/preview.md`
   - モード説明は有効だが実装寄り詳細が多い。
6. `docs/guides/media-handling.md`
   - 分割方針・運用メモが混在。
7. `docs/guides/export.md`
   - 命名/到達点/実装詳細の混在を整理。
8. `docs/guides/storyline.md`
   - 境界は比較的明確。軽量化中心。
9. `docs/guides/autoclip.md`
   - 対象狭く圧縮効果は相対的に低い。

## 圧縮ルール
- 各ガイド先頭に `## TL;DR` を置く（10行以内）。
- 日付付き経緯（`YYYY-MM-DD`、`時点`、`現行実装到達点`）は `docs/notes/` へ移す。
- 実装関数名・ファイルパスに依存する手順は `docs/guides/implementation/` へ寄せる。
- L1に残すのは「概念」「責務境界」「Must/Must Not」「正本参照」のみ。

## 実施ステータス
- Wave 1（完了）:
  - `docs/guides/*.md` 全9ファイルへ `TL;DR` を追加。
- Wave 2（完了）:
  - `vault-assets.md` をL1責務へ圧縮（実装詳細節を削除）。
  - `cut-history.md` をL1責務へ圧縮（Command列挙・日付運用節を削除）。
- Wave 3（完了）:
  - `scene-duration-bar.md` / `lip-sync.md` / `preview.md` のUI・実装詳細を圧縮。
  - 修正（2026-02-21）: Wave 3 の `scene-duration-bar.md` は圧縮維持ではなく分解へ方針更新。
  - 修正内容: L1 は `storyline.md` の `Storyline UI Boundary` へ統合し、UI仕様は `docs/guides/implementation/scene-duration-bar-ui.md` と `docs/guides/implementation/header-ui.md` へ分離。旧 `scene-duration-bar.md` は削除。
- Wave 4（完了）:
  - `export.md` をL1責務へ圧縮し、Preview と時間概念を統一。
