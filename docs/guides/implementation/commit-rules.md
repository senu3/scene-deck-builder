# Commit Rules

## TL;DR
対象：コミット粒度と命名規約
正本：type(scope): subject と gate scope規約
原則：
- コード変更と意味的docsは別コミット
- Gate変更はscope=gateNで追跡
- baseline/機械的変更は専用コミット
詳細：Gate運用は gate-checks を参照

## 目的
- コミット単位で変更意図と影響範囲を追跡可能にする。
- Gate 不変条件に関わる変更を識別可能にし、レビューと監査の精度を上げる。
- Codex と人間のどちらでも、実コードと docs の整合を崩さず運用できる導線を固定する。

## 基本方針（重要）
- コード変更と意味的 docs 更新は原則として別コミットに分ける（同一 PR で扱ってよい）。
- 変更の性質が違うものは必ず分ける。
- 同時に入れるのは「概念的に一体」の場合のみ（名称統一など）。

## 適用範囲
- すべての通常コミット（PR 未使用でも適用）。
- Gate（`gate1` から `gate10`）に関わる `feat`/`fix`/`refactor`。

## Must
- コミット件名は `type(scope): subject` を使用する。
- `type` は `feat` `fix` `refactor` `docs` `test` `chore` `build` `ci` のみを使用する。
- `scope` は必須とし、主影響範囲を 1 つ選ぶ。
- Gate に触れる `feat`/`fix`/`refactor` は `scope=gateN` を使う。
- 見た目のみの変更はコミット本文フッターに `UI-Only: true` を付与する。
- Electron は特別扱いの依存とする。バージョン更新およびそれに伴う軽微な追随修正（例: 非推奨APIの置換、型調整、import修正など）は `chore(electron)` を使う。
- `build(electron)` は配布・ビルド・パッケージングに関わる変更に限定する。
- Electron 以外の依存更新は `chore(deps)` を使う。
- baseline 更新（`scripts/check-gate-baseline.json` など）は専用コミットに分離する。
- 機械的変更（フォーマット変更・一括置換・生成物更新）は専用コミットに分離する。

## Must Not
- Gate 影響があるのに `scope=gateN` を使わない。
- `scope=gateN` で docs 更新も理由記載もない状態で提出する。
- UI 見た目のみ変更を通常ロジック変更と同じ扱いにして追跡不能にする。
- 1つのコミットに機械的変更と通常ロジック変更が混在する。

## コミット件名ルール
- 形式: `type(scope): subject`
- 例:
  - `feat(gate1): sceneOrder を唯一正本として enforce`
  - `fix(gate5): export の missing asset を skip + warn に統一`
  - `refactor(store): cutGroupOps を commands 経由に統一`
  - `fix(ui): contentEditable 中のショートカットを抑止`
  - `chore(deps): bump zustand to vX`
  - `chore(electron): bump electron to vXX`
  - `build(electron): switch packaging flow to forge`

## Gate 変更時ルール
- 対象: Gate 不変条件、`check:gate`、strict 運用、baseline、監査ロジックへの変更。
- ルール:
  - 件名の scope は主ゲートの `gateN` を使う。
  - 該当ガイド（`docs/guides/...`）の更新を行う。
  - 複数 Gate に跨る場合は件名に主ゲートのみを入れ、本文フッターで補足する。
- 本文フッター例:
  - `Affects: gate3, gate4`

## UI 変更時ルール
- UI の挙動変更: `feat(ui)` `fix(ui)` `refactor(ui)`。
- UI 見た目のみ変更:
  - `chore(ui)` または `refactor(ui)` など通常 type を使う。
  - 本文に `UI-Only: true` を必ず付ける。
- `src/ui/` 配下の変更で UI コンポーネントの責務・公開パターン・利用ルールが変わる場合は `docs/guides/implementation/ui-components.md` を更新する。

## docs 更新ルール
- 原則：コード変更と docs 更新は別コミット。
- 例外：用語統一・名称変更に伴う docs 修正は同時マージ可（同一タイミングで反映）。

## baseline 更新ルール
- Gate baseline 更新は専用コミットに分離する。
- 例:
  - `chore(gate-checks): update baseline`
- 本文に「baseline が増える理由」を短く残す。

## Codex 運用手順（必須）
- 作業前:
  - `docs/ARCHITECTURE.md` と対象ドメインガイド（`docs/guides/...`）を確認する。
- コミット前チェック:
  1. `git log --oneline <base>..HEAD` で自分のコミット一覧を確認する。
  2. 各コミットの `type/scope/subject` が規約に準拠していることを確認する。
  3. `scope=gateN` がある場合、docs を更新したことを確認する（例外時は PR に理由記載）。
  4. UI 見た目のみ変更コミットに `UI-Only: true` があることを確認する。
  5. 機械的変更が分離されているか。
- PR 作成前:
  - commit 一覧を再確認し、規約違反がないことを確認してから提出する。
