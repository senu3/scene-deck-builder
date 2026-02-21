# Wave5 Media/Storyline Compression Notes (Implemented 2026-02-21)

## 対象
- `docs/guides/media-handling.md`
- `docs/guides/storyline.md`

## 目的
- L1 を境界仕様に限定し、探索コストを下げる。

## L1から外した主な詳細
- `media-handling.md`:
  - Video/Audio/PCM/thumbnail の実装手順列挙
  - ffmpeg handler の個別実装説明
  - 実装ファイル単位の運用メモ
- `storyline.md`:
  - UI操作フローの詳細列挙
  - パフォーマンス最適化メモの詳細記述
  - 実装関数名中心の記述

## 残した正本情報
- `media-handling.md`:
  - `assetId -> index -> filename` 解決順
  - read-path / write-path 禁止事項
  - missing時の停止原則（暗黙補完しない）
- `storyline.md`:
  - Command/Event 境界
  - 順序正本（`sceneOrder` / `cut.order`）
  - 禁止事項（配列順正本化禁止、UI直書き禁止）

## 補足
- `autoclip.md` は本Waveでは保留。
