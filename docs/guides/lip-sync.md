# LipSync Guide

## TL;DR
対象：現行 LipSync 廃止後の扱い
目的：廃止状態と将来方針を明示する
正本：現行アプリでは LipSync の保存・回復・参照正本は存在しない

**目的**: 現行 LipSync が廃止済みであることと、将来の再導入先が BakeNodes 系であることを固定する。  
**適用範囲**: project load/save、asset reference、Preview、Export、UI導線。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/vault-assets.md`, `docs/DECISIONS/ADR-0007-lipsync-deprecation.md`。  
**更新頻度**: 低。

## Must / Must Not
- Must: 現行アプリでは LipSync を新規作成・編集・保存しない。
- Must: 旧 `lipSync` metadata や旧 cut flag は load 時に静かに無視する。
- Must: asset reference / delete validation / recovery 正本は cut / cut-audio-binding / scene-audio / group-audio に限定する。
- Must: 将来再導入する場合は BakeNodes 系として再設計する。
- Must Not: 旧 LipSync データを自動 migrate しない。
- Must Not: 旧 LipSync generated asset を recovery 正本や使用中 asset として扱わない。
- Must Not: 互換 UI や legacy 案内 UI を追加しない。

## 現在の扱い
- `.metadata.json` は `displayTime` / `audioAnalysis` / scene/group audio などの補助情報のみを保持する。
- 旧 `lipSync` entry は load 時に読み飛ばし、save 時にも再出力しない。
- 旧 `Cut.isLipSync` / `lipSyncFrameCount` は現行アプリでは保持しない。
- Preview / Export / manifest は LipSync 特別経路を持たない。

## 将来方針
- LipSync 相当の機能が必要になった場合は BakeNodes 系で再設計する。
- 現行の AssetMetadata ベース設計は再利用前提にしない。
