# Storyline Controller & SceneDurationBar

## TL;DR
対象：StorylineヘッダーのScene要約表示
正本：StoryTimeline上のscene duration集計
原則：
- Scene選択通知のみ担当
- スクロール実制御はStoryline側
- 再生進捗UIとして扱わない
詳細：配色/UI実装は implementation を参照

**目的**: Storyline のD&D制御と SceneDurationBar の責務境界を固定する。  
**適用範囲**: `Storyline` / `useStorylineDragController` / `SceneDurationBar`。  
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/implementation/ui-components.md`, `docs/guides/implementation/color-system.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: `SceneDurationBar` は編集軸（`StoryTimeline`）の要約表示に限定する。
- Must: Scene 選択イベントのみを emit し、スクロール実制御は `Storyline` が担う。
- Must: Scene duration は `cut.displayTime` 集計で算出する。
- Must Not: 再生時間軸 UI として扱わない。
- Must Not: Header の総尺ゲージと同一責務として説明しない。
- Must Not: Header 層から DOM 直接スクロール制御を行わない。

## 責務境界
- `Storyline`:
  - D&D、selection、スクロール制御の実行責務を持つ。
- `SceneDurationBar`:
  - Scene 比率可視化と scene 選択通知のみを持つ。
- Header 統計UI:
  - 総尺・目標尺サマリを表示するが、Scene選択責務は持たない。

## 表示ルール
- Scene 幅は Scene duration 比率で決まる。
- 0秒 Scene でも最小幅を確保する。
- target モードでは `Remaining/Over` 表示ルールを固定し、解釈を変えない。

## 運用メモ
- UI文言や表示細則の未確定事項は `docs/TODO_MASTER.md` で管理する。
- 詳細実装差分・運用経緯は `docs/notes/` へ分離する。

## 関連ガイド
- Storyline編集境界: `docs/guides/storyline.md`
- Preview責務: `docs/guides/preview.md`
