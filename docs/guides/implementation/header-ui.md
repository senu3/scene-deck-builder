# Header UI

## TL;DR
対象: Header統計表示
責務: 全体サマリ表示
非責務: Storylineスクロール/D&D制御
境界: SceneDurationBarとは別責務

**目的**: Header統計UI（Stats / Time / Duration Goal）の表示仕様を固定する。
**適用範囲**: `src/components/Header.tsx`, `src/components/Header.css`。
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/implementation/scene-duration-bar-ui.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: Header はプロジェクト全体サマリ（scenes/cuts/time/duration goal）を表示する。
- Must: Duration Goal は project 固有設定のみを表示する。
- Must: SceneDurationBar の表示モードと Header の Duration Goal 編集責務を混在させない。
- Must Not: Header から Storyline DOM の直接スクロール制御を行わない。
- Must Not: Header Stats を Scene選択UIと同一責務として扱わない。

## Owned Responsibilities
- Header が持つのは全体統計表示と duration goal summary だけとする。
- scene 選択、scene 比率表示、scroll ownership は持たない。

## Stats and Time
- `Scenes`: `scenes.length`
- `Cuts`: 全sceneのcuts合計
- `Time`: 選択cutの開始位置 / 全体duration
- 選択cutなし時は current位置を `--` 表示

## Duration Goal Rules
- `effectiveTarget = projectTarget ?? undefined`
- Header では Duration Goal の現在値だけを表示する
- 編集確定は `Set` / `Clear` / `Enter` のみ
- outside click と blur は popover を閉じるだけで、保存はしない

## Styling Boundary
- Header 背景は `color-system.md` の deep surface token を使う。
- Header 固有の見た目調整を書いてよいが、色の意味定義は持たない。
