# ADR-0008: Vault ingest finalize policy を固定する

## Status
Proposed (2026-03-17)

## Context
- Vault asset の write が import / register / generated / recovery / 未登録 sync に分裂している。
- file 実体と `.index.json` が別操作として扱われており、half-state を作りやすい。
- `assets/` に未登録 file が混入しうるうえ、UI 側が直スキャンで疑似 asset を作る経路も残っている。
- at-rest filename と UI 表示名の責務が混線し、`originalPath` も source path / vault path / recovery clue で意味が揺れている。

## Decision
- Vault への正式登録は `finalizeAssetIntoVault` 相当の単一入口に集約する。
- write は `staging -> finalize` の 2 段階とし、generated asset を直接 `assets/` へ書かない。
- managed asset の at-rest filename は hash に統一し、UI 表示名は `originalName` を正本とする。
- detect は read-only、finalize は write-only として分離する。
- file 実体と `.index.json` の commit / rollback は gateway で完結させ、renderer 側 queue に整合性を依存しない。

## Consequences
- import / generated / recovery / 未登録 sync は同じ finalize contract を共有する。
- `assets/` は managed file のみを置く領域になり、未登録 file の半端状態を減らせる。
- 命名 rule は 1 本化され、UI は `originalName` を中心に表示する前提へ寄る。
- hidden staging の cleanup policy、`originalName` 主経路への表示移行、drag/import helper の finalize 契約統一が follow-up になる。
- load diagnosis と recovery の read-only 境界は維持し、write model のみを置き換える。

## Superseded
- Superseded ADR: none
- Replaced note-level rule: `docs/notes/archive/cut-refactor-plan-implemented-2026-02-12.md` にある「`assets/` 内生成物は既存名のまま index 登録する」方針
