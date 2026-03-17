# ADR-0007: 現行 LipSync を廃止し BakeNodes 再設計へ送る

## Status
Accepted (2026-03-17)

## Context
- 現行 LipSync は `AssetMetadata.lipSync`、cut flag、Preview/Export 分岐、generated asset 所有管理まで広がっていた。
- しかし recovery の正本は `project.sdp` の cut 順序と `assets/.index.json` の assetId 対応であり、`.metadata.json` は補助情報に留めたい。
- 現行 LipSync を保持したまま recovery / delete policy / save validation に乗せ続けると、generated asset 管理が主経路を汚染しやすい。
- 将来の再導入は BakeNodes 系で再設計したい。

## Decision
- 現行 LipSync 機能は廃止する。
- `AssetMetadata.lipSync`、`Cut.isLipSync`、`lipSyncFrameCount` は現行アプリの保存対象・実行経路から外す。
- 旧 LipSync metadata と旧 cut flag は load 時に静かに無視する。
- migration は行わない。
- asset reference / delete validation / recovery 正本から `lipsync-*` 参照を除外する。
- 旧 generated asset の自動 cleanup は今回行わない。
- `docs/guides/lip-sync.md` は廃止状態の案内だけを残し、将来は BakeNodes 系で再設計する。

## Consequences
- `.metadata.json` は補助メタ情報に責務を絞れる。
- save/load/recovery/delete の主経路が単純化される。
- 旧 LipSync データは開けるが機能としては再現されない。
- vault 内の旧 generated asset は残る可能性があるため、必要なら one-shot cleanup を別タスクで行う。
- LipSync を再導入する場合は現行設計を引き継がず、BakeNodes 前提で仕様を作り直す。
