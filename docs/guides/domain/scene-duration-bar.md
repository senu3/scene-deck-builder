# Storyline Controller & SceneDurationBar

**目的**: StorylineのD&D制御とSceneDurationBarの役割を整理する。
**適用範囲**: `Storyline` / `useStorylineDragController` / `SceneDurationBar`。
**関連ファイル**: `src/components/Storyline.tsx`, `src/hooks/useStorylineDragController.ts`, `src/components/SceneDurationBar.tsx`。
**更新頻度**: 中。

## Must / Must Not
- Must: `SceneDurationBar` は編集軸（`StoryTimeline`）の要約表示に限定する。
- Must: Scene 選択イベントのみを emit し、スクロール実制御は `Storyline` が担う。
- Must: target モード時は `Remaining/Over` の表示条件を固定ルールで扱う。
- Must Not: 再生時間軸 UI として扱わない。
- Must Not: Header 層から DOM 直接スクロール制御を行わない。

> TODO は `docs/TODO_MASTER.md`（`TODO-DEBT-003`）を参照。

## Storyline Controller

**Location**
- `src/hooks/useStorylineDragController.ts`
- `src/components/Storyline.tsx`

**Responsibilities**
- Handles drag-and-drop interactions for cuts and external file drops.
- Manages placeholder state for cross-scene moves and external drops.
- Creates new cuts for external assets using `createCutFromImport`.
- Ensures selection changes are reflected in the Storyline view.
- `Storyline` is the primary inbound drop handler for scene-targeted drops.
- `App` keeps a workspace-level fallback drop handler for drops outside scene columns (imports to selected/first scene).
- D&D accepts image/video only; audio is excluded from Timeline D&D.

**Interaction Performance Notes**
- During native drag, `closeDetailsPanel()` is triggered once on drag-enter (not every drag-over event) to avoid repeated store updates and re-renders.
- External file drops are queued sequentially in `queueExternalFilesToScene` so multi-file imports do not burst heavy work at once.
- Each queued import yields back to the event loop between items (`setTimeout(..., 0)`) to preserve drag/scroll responsiveness.
- Drop handlers prioritize immediate UI return; long-running import/thumbnail/vault work continues asynchronously via loading cuts.

**Scroll Behavior**
- `Storyline` owns scene scrolling. It observes `selectedSceneId` and scrolls the matching scene into view.
- This avoids DOM querying from the Header layer.

**Key Data Flow**
- Selection state is sourced from `useStore()` (`selectedSceneId`, `selectScene`).
- `useStorylineDragController` receives `executeCommand` for undo/redo integration and `createCutFromImport` for import flows.
- `createCutFromImport` no longer refreshes all source folders per item; caller-side bulk flows should refresh explicitly only when needed.

## SceneDurationBar

**Location**
- `src/components/SceneDurationBar.tsx`
- `src/components/SceneDurationBar.module.css`

**Purpose**
- Replaces `SceneChipBar` as the primary scene navigation in the Header.
- Shows per-scene segments sized by scene duration.
- Clicking a segment selects the scene; Storyline handles scrolling.
- `SceneDurationBar` is a UI for the edit axis (`StoryTimeline`) and does not represent preview playback time.

**Props / API**
- `scenes: Scene[]`
- `selectedSceneId: string | null`
- `onSelectScene(sceneId: string)`
- `targetSec?: number`（未設定時は相対モードのみ）

**Display Modes**
- `relative`（既定）:
  - 従来挙動。各シーン幅は「シーン尺同士の相対比」。
  - 0秒シーンは最小幅確保のため weight=1 を使用。
- `target`（目標尺モード）:
  - 各シーン幅は `sceneSec / targetSec`。
  - 未超過時は末尾に `Remaining` セグメントを追加（暗色 + 斜線）。
  - 超過時は `Remaining` を出さず、末尾に `Over` セグメントを追加（警告色）。
  - `Over` 幅は `min((total-target)/target, 0.25)` で 25% cap。

**Mode Toggle**
- バー右端の小トグルで切替。
- `targetSec` が未設定のときはトグル非表示。
- 切替状態は localStorage（`scene-deck.duration-target-settings.v1`）に保存。

**Duration Rules**
- Scene duration = sum of `cut.displayTime` in that scene.
- If a scene has 0 duration, it still renders with minimum width (weight = 1).

**Styling Rules**
- Base surface uses tokens: `--panel-bg`, `--border-color`.
- Segment colors use `--timeline-scene-*` tokens (see `docs/guides/implementation/color-system.md` → Timeline Scene Colors).

## Header Stats

The Header displays project statistics alongside the action buttons.

**Location**
- `src/components/Header.tsx` (`.header-stats` section)
- `src/components/Header.css`

**Stats**
| Stat | Icon | Description |
|------|------|-------------|
| Scenes | `Layers` | `scenes.length` |
| Cuts | `Film` | Total cuts across all scenes |
| Time | `Clock` | Selected cut position / total duration |
| Target Gauge | (custom) | `Total / Target` progress (battery-style) |

**Time Display Rules**
- Current position: cyan (`--accent-primary`), monospace, bold — shows timeline start time of the selected cut.
- Total duration: secondary text (`--text-secondary`), monospace.
- When no cut is selected: current position shows `--`.
- Format uses `formatTimeCode()` from `useStoryTimelinePosition`.

**Target Gauge Rules**
- `effectiveTarget = projectTarget ?? envDefaultTarget ?? undefined`
- `effectiveTarget` 未設定（`undefined`/`0`）時は非表示。
- 超過判定は `totalSec > targetSec` のときのみ（`==` は通常色）。
- ツールチップ:
  - 未超過: `Total ... / Target ... (xx%)` + `Remaining ...`
  - 超過: `Total ... / Target ... (xx%)` + `Over +...`

**Header Background**
- Uses depth gradient: `linear-gradient(180deg, var(--bg-depth-1), var(--bg-depth-2))`.

## Integration Points
- `Header` renders `SceneDurationBar` under the main header row.
- `SceneChipBar` was removed.
- `Header` renders `DurationTargetGauge` in `.header-stats`.
- Project target duration input (`min`) is available in Header more-menu (`0` = clear).

## Known Constraints
- Header must not use `document.querySelector` to scroll Storyline.
- SceneDurationBar does not own scroll behavior; it only emits selection events.
