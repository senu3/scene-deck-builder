# SceneDurationBar UI

## TL;DR
対象: Headerのscene要約バー
責務: scene比率表示とscene選択通知
非責務: Storylineスクロール実制御
正本: duration解釈は canonical timing

**目的**: `SceneDurationBar` のUI仕様を実装観点で固定する。
**適用範囲**: `src/components/SceneDurationBar.tsx`, `src/components/SceneDurationBar.module.css`。
**関連ファイル**: `docs/guides/storyline.md`, `docs/DECISIONS/ADR-0004-canonical-timing-api.md`, `docs/guides/implementation/color-system.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: `SceneDurationBar` は scene比率表示と scene選択通知に限定する。
- Must: 表示に使う scene duration の意味は canonical timing 正本と一致させる。
- Must: target モード時の `Remaining` / `Over` 表示条件を固定する。
- Must Not: 再生進捗タイムラインとして説明しない。
- Must Not: scroll実制御責務を持たせない。

## Component API
- `scenes: Scene[]`
- `selectedSceneId: string | null`
- `onSelectScene(sceneId: string): void`
- `targetSec?: number`

## Display Modes
- `relative`:
  - scene幅は scene同士の相対比。
  - 0秒sceneでも最小幅を確保する。
- `target`:
  - scene幅は target に対する比率。
  - 合計が target 未満のときは `Remaining` を表示。
  - 合計が target 超過のときは `Over` を表示。

## Mode Toggle
- トグルはバー右端に表示する。
- `targetSec` が未設定または無効値のときはトグルを表示しない。
- 選択モードは localStorage キー `scene-deck.duration-target-settings.v1` に保存する。

## Duration Interpretation Rules
- UIが参照する scene duration は canonical timing の解釈に合わせる。
- `cut.displayTime` をUI仕様の正本として定義しない。
- 非有限値は集計対象外として扱う。

## Styling Rules
- 表面トークン: `--panel-bg`, `--border-color`
- segment色: `--timeline-scene-*`（循環利用）
- 色の意味づけは `docs/guides/implementation/color-system.md` を正本とする。

## Known Constraints
- Scroll ownership は `Storyline` が持つ。
- Header/SceneDurationBar から Storyline DOM を直接スクロールしてはならない。
