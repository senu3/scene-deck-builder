# Header UI

## TL;DR
対象: Header統計表示とTarget Gauge
責務: 全体サマリ表示
非責務: Storylineスクロール/D&D制御
境界: SceneDurationBarとは別責務

**目的**: Header統計UI（Stats / Time / Target Gauge）の表示仕様を固定する。
**適用範囲**: `src/components/Header.tsx`, `src/components/DurationTargetGauge.tsx`, `src/components/Header.css`。
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/implementation/scene-duration-bar-ui.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: Header はプロジェクト全体サマリ（scenes/cuts/time/target）を表示する。
- Must: `effectiveTarget` 未設定時は Target Gauge を非表示にする。
- Must: SceneDurationBar と Target Gauge の責務を分離して記述する。
- Must Not: Header から Storyline DOM の直接スクロール制御を行わない。
- Must Not: Header Stats を Scene選択UIと同一責務として扱わない。

## Stats and Time
- `Scenes`: `scenes.length`
- `Cuts`: 全sceneのcuts合計
- `Time`: 選択cutの開始位置 / 全体duration
- 選択cutなし時は current位置を `--` 表示

## Target Gauge Rules
- `effectiveTarget = projectTarget ?? envDefaultTarget ?? undefined`
- `effectiveTarget` が `undefined` または `0` のときは非表示
- 超過判定は `totalSec > targetSec`
- ツールチップは未超過時 `Remaining`、超過時 `Over` を表示

## Background
- Header背景は depth gradient を使用する。
- 使用トークン: `--bg-depth-1`, `--bg-depth-2`

## Boundary with SceneDurationBar
- `SceneDurationBar`: scene選択用の編集軸サマリUI
- `DurationTargetGauge`: 全体尺の目標サマリUI
- 近接表示しても責務を混同しない。
