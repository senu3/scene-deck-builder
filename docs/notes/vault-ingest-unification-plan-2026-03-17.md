# Vault Ingest Unification Plan (2026-03-17)

## TL;DR
- コア方針は ADR-0008 に移し、この note では実装整理と follow-up だけを扱う。
- Vault ingest の再設計は write model の置換を対象とし、load/recovery 境界は広げない。

## 目的
- Vault ingest の再設計で触る実装面を整理し、ADR と L1 guide の外に残す論点を記録する。

## 前提
- `project-load-boundary-refactor-2026-03-15` の方針を維持し、load diagnosis は read-only のままにする。
- `recovery-flow-minimum-plan-implemented-2026-03-12` の方針を維持し、load/recovery の責務は広げない。
- したがって、このメモは Vault ingest write model の再設計を扱い、load/recovery の拡張は扱わない。
- 現行 LipSync は廃止済みのため、Vault ingest の設計基準には含めない。

## 問題点
- 登録経路が import / register / generated / recovery で分裂している。
- `assets/` に未登録ファイルが発生しうる。
- UI が `assets/` 直スキャンで疑似 asset を生成している。
- write 整合が renderer 依存になっている。
- `originalPath` の意味が source path / vault path / recovery clue で混線している。

## 実装上の整理対象
- gateway write は finalize transaction へ集約する。
- generated asset 出力は hidden staging 前提へ切り替える。
- recovery / unregistered sync / drag/import helper は finalize 契約へ揃える。
- 表示名は `originalName` 主経路へ寄せ、`originalPath` 依存表示を縮小する。

## 実装順
1. gateway に finalize transaction を追加し、既存 import/register write を内部実装として吸収する。
2. generated asset を staging 出力へ切り替え、`assets/` 直書きをやめる。
3. recovery / unregistered sync / UI helper を finalize 前提へ揃え、`AssetPanel` の疑似 asset 扱いを整理する。

## Follow-up
- hidden staging を導入するなら、stale staging file の cleanup policy を先に決める必要がある。
- `originalPath` 依存の表示ロジックが一部に残っているため、display name の正本を `originalName` へ寄せる移行が必要になる。
- `AssetPanel` だけでなく、drag/import 系 helper も「vault にあるが未登録」の扱いを finalize 契約へ揃える必要がある。

## 非スコープ
- `.index.json` を完全 DB 化すること。
- load/recovery の責務を拡張すること。
- UI の大規模改修。

## 備考
- 過去の「`assets/` 内生成物は既存名のまま登録する」方針は、この再設計で置き換える。
- `project-load-boundary-refactor-2026-03-15` と `recovery-flow-minimum-plan-implemented-2026-03-12` で固定した read-only/load boundary は崩さない。
