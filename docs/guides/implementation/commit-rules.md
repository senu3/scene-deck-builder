# Commit Rules

## 目的
- コミット単位で変更意図と影響範囲を追跡可能にする。
- Gate 不変条件に関わる変更を識別可能にし、レビューと監査の精度を上げる。
- Codex と人間のどちらでも、実コードと docs の整合を崩さず運用できる導線を固定する。

## 適用範囲
- すべての通常コミット（`main`/`master` 向け PR を含む）。
- Gate（`gate1` から `gate10`）に関わる `feat`/`fix`/`refactor`。

## Must
- コミット件名は `type(scope): subject` を使用する。
- `type` は `feat` `fix` `refactor` `docs` `test` `chore` `build` `ci` のみを使用する。
- `scope` は必須とし、主影響範囲を 1 つ選ぶ。
- Gate に触れる `feat`/`fix`/`refactor` は `scope=gateN` を使う。
- `scope=gateN` のときは docs を最低 1 つ更新する。
- 見た目のみの変更はコミット本文フッターに `UI-Only: true` を付与する。
- Electron 更新は `build(electron)` を使う。
- 依存更新は `chore(deps)` を使う。
- baseline 更新（`scripts/check-gate-baseline.json` など）は専用コミットに分離する。

## Must Not
- Gate 影響があるのに `scope=gateN` を使わない。
- `scope=gateN` で docs 更新も理由記載もない状態で PR を出す。
- UI 見た目のみ変更を通常ロジック変更と同じ扱いにして追跡不能にする。

## コミット件名ルール
- 形式: `type(scope): subject`
- 例:
  - `feat(gate1): sceneOrder を唯一正本として enforce`
  - `fix(gate5): export の missing asset を skip + warn に統一`
  - `refactor(store): cutGroupOps を commands 経由に統一`
  - `fix(ui): contentEditable 中のショートカットを抑止`
  - `chore(deps): bump zustand to vX`
  - `build(electron): upgrade electron to vXX`

## Gate 変更時ルール
- 対象: Gate 不変条件、`check:gate`、strict 運用、baseline、監査ロジックへの変更。
- ルール:
  - 件名の scope は主ゲートの `gateN` を使う。
  - 複数 Gate に跨る場合は件名に主ゲートのみを入れ、本文フッターで補足する。
- 本文フッター例:
  - `Affects: gate3, gate4`

## UI 変更時ルール
- UI の挙動変更: `feat(ui)` `fix(ui)` `refactor(ui)`。
- UI 見た目のみ変更:
  - `chore(ui)` または `refactor(ui)` など通常 type を使う。
  - 本文に `UI-Only: true` を必ず付ける。

## docs 更新ルール
- `feat(gateN)` `fix(gateN)` `refactor(gateN)` は以下のどちらかを更新する。
  - `docs/ARCHITECTURE.md`
  - 該当ガイド（`docs/guides/...`）
- 例外:
  - 仕様不変の純粋な移動/リネームなどで docs 更新不要な場合は、PR 本文に理由を 1 から 2 行で記載する。

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
  5. Electron 更新が `build(electron)`、依存更新が `chore(deps)` になっていることを確認する。
- PR 作成前:
  - commit 一覧を再確認し、規約違反がないことを確認してから提出する。
