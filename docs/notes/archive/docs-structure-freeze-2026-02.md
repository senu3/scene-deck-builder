# Codex指示書：docs構造固定

## 目的

docs の階層・責務境界を固定し、今後のドキュメント増殖/散在を防ぐ。
「憲章（ARCHITECTURE）」「ドメイン正本（guides）」「実装規約（guides/implementation）」「参照（references）」「決定ログ（DECISIONS）」「TODO集約（TODO_MASTER）」を強制する。

---

## 固定したい docs 構造（パスと責務）

### L0 憲章

* `docs/ARCHITECTURE.md`

  * 目的 / スコープ / 非スコープ
  * 軸の命名（編集/再生/出力/Vault）
  * Must / Must Not
  * Invariant Checklist
  * 成功指標

### 決定ログ（ADR）

* `docs/DECISIONS/ADR-0001-sceneOrder.md`
* `docs/DECISIONS/ADR-0002-preview-export-parity.md`

### L1 ドメイン正本（仕様の中心）

* `docs/guides/preview.md`
* `docs/guides/export.md`
* `docs/guides/storyline.md`
* `docs/guides/vault-assets.md`
* `docs/guides/media-handling.md`
* `docs/guides/lip-sync.md`
* `docs/guides/autoclip.md`
* `docs/guides/cut-history.md`
* `docs/guides/cut-history.md`
* `docs/guides/scene-duration-bar.md`

### L2 実装規約（判断基準）

* `docs/guides/implementation/*`

  * 例：`thumbnail-profiles.md`, `export-audio-mix.md`, `buffer-memory.md`, `autosave-snapshots.md`, `ui-components.md`, `color-system.md`

### 参照（用語/対応表）

* `docs/references/DOMAIN.md`
* `docs/references/MAPPING.md`

### TODO 集約

* `docs/TODO_MASTER.md`

  * TODO はここ以外に散在させない（各docは TODO_ID を参照リンクするだけ）

---

## 作業タスク

### 1) ツリーの正規化

* `docs/` 配下を走査し、上記の固定構造に合わないファイルを検出して、適切な階層へ移動する。
* `notes/archive/` がある場合、実装済み計画・過去ログ類はここへ寄せる（ガイド正本に混ぜない）。

**チェック**

* `ARCHITECTURE.md` が「目次」や「詳細仕様」で肥大化していないこと。
* `guides/` の各ファイル冒頭に「目的 / 適用範囲 / 関連 / 更新頻度 / Must/Must Not」があること（既存形式を維持）。

### 2) INDEX の固定（存在する場合は内容を地図化）

* `docs/INDEX.md` がある場合は「ファイル一覧」ではなく「読む順番と責務境界」にする。
* 全ファイル列挙は禁止。主要導線だけ掲載。

### 3) TODO の集約徹底

* `docs/**.md` を grep し、散在TODO（`TODO:` や `FIXME:` 等）を検出。
* `docs/TODO_MASTER.md` に移動し、元ドキュメント側は `TODO-XXXX` 参照に置換。
* `TODO_MASTER` 内の ID 重複・参照切れを確認（参照されているIDが存在すること）。

### 4) ADR の参照整備

* 破壊的変更や例外ルールが docs 内に埋まっている場合は ADR に退避する。
* 少なくとも現状の ADR-0001/0002 が `ARCHITECTURE.md` の Must / Invariant と矛盾しないよう確認する。

### 5) リンク整合チェック

* `docs/` 内リンク切れを修正（移動・rename に伴うリンク更新）。
* `guides/*` の Related Docs / 参照セクションが現行パスに一致すること。

---

## “固定”のためのガード（軽量ルール）

### docs に書いてよい内容 / 書いてはいけない内容

* `ARCHITECTURE.md`：原則 “ルール” のみ。実装詳細は禁止。
* `guides/*.md`：仕様・運用の正本。実装メモや経緯は必要最小限、過去ログは archive へ。
* `guides/implementation/*.md`：具体的な制約・チェック観点・禁止事項のみ。思想は禁止。
* `DECISIONS/*`：背景・判断・例外の根拠。運用手順は禁止。
* `TODO_MASTER.md`：TODO の正本。docs 本文への TODO 散在は禁止。

---

## Definition of Done（完了条件）

* docs ツリーが上記固定構造に一致している。
* `docs/` 内のリンク切れが無い。
* TODO は `TODO_MASTER` に集約され、docs 本文に散在しない。
* `ARCHITECTURE.md` の Must / Must Not / Invariant と、`guides/export.md` `guides/preview.md` の parity 主張が矛盾しない。
* ADR が `ARCHITECTURE.md` の不変条件と整合している。
* 変更は **「docs構造整理」コミット**と**「CI/規約強化」コミット**を分離（混ぜない）。

---

## Non-goals（今回やらない）

* 内容の大規模リライト（構造固定が主目的）
* 実装コードの変更（リンク・参照更新に必要な範囲を除く）
* CI を warning→fail に切り替える作業（別コミット/別PR）

---

## 追加の出力（Codexの最終レポートに必須）

* 変更したファイルの一覧（移動/rename/編集の分類つき）
* 代表的なリンク修正箇所（数件）
* TODO_MASTER の追加/移動サマリ（件数・カテゴリ）
* 「今後 docs を増やすときの配置ルール」短文（ARCHITECTURE or INDEX への追記案）

---
