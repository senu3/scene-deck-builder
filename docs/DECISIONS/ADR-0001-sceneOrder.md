# ADR-0001: `sceneOrder` を唯一の Scene 順序源とする

## Status
Accepted (2026-02-16)

## Context
- Scene 順序は編集/再生/出力で共通である必要がある。
- `scenes` 配列順を直接参照すると、復元・移動・Undo/Redo で順序の意味がぶれやすい。
- Export の時系列整合は Scene 順序の単一正本を前提にしている。

## Decision
- Scene 順序の正本は `sceneOrder: sceneId[]` のみとする。
- `scenes` 配列順は表示や格納都合であり、時系列の正本として扱わない。
- Scene index の表示・export scope・timeline 計算は `sceneOrder` から算出する。

## Consequences
- Scene 並び替え実装は `sceneOrder` 更新を中核に設計する。
- 回帰テストは `sceneOrder` 基準で期待値を持つ。
- docs/実装の双方で `sceneOrder` 不変条件の明記が必須になる。
