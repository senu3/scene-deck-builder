# Storyline Guide

## TL;DR
対象：Storyline編集操作とD&D境界
正本：sceneOrder と Command境界
原則：
- 構造変更はCommand経由
- Scene操作はsceneId直指定
- Preview/Export軸へ責務越境しない
詳細：関連挙動は preview / autoclip を参照

**目的**: `Storyline` と `useStorylineDragController` の仕様と運用ルールを整理する。
**適用範囲**: `src/components/Storyline.tsx`, `src/hooks/useStorylineDragController.ts`, `src/components/CutCard.tsx`, `src/components/SceneDurationBar.tsx`。
**関連ファイル**: `docs/references/DOMAIN.md`, `docs/references/MAPPING.md`, `docs/guides/preview.md`, `docs/guides/autoclip.md`, `docs/guides/implementation/scene-duration-bar-ui.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: Timeline 構造変更は Command 経由で行う。
- Must: Scene の時系列順序は `sceneOrder` を正本とする。
- Must: Scene more menu の Scene 解決は `sceneId` 直指定で行う。
- Must Not: `selectedSceneId` 依存で Scene preview/export を解決しない。
- Must Not: Storyline から Preview/Export 軸の命名を上書きしない。

## Naming Boundaries (Must Follow)
- `Storyline`: 編集UI。
- `StoryTimeline`: 編集軸の概念名（UI名ではない）。
- `SceneDurationBar`: `StoryTimeline` を要約表示するHeader UI。
- `Preview`: 再生機能ドメイン。
- `PreviewModal`: 再生UIコンポーネント。
- `PreviewMode`: 再生状態値（`scene` / `all`）。
- 再生制御の命名は public `useSequencePlaybackController` / internal `SequenceClock` を使う。

## Core Responsibilities
- Handles drag-and-drop interactions for cuts and external file drops.
- Manages placeholder state for cross-scene moves and external drops.
- Creates new cuts for external assets using `createCutFromImport`.
- `Storyline` is the primary inbound drop handler for scene-targeted drops.
- `App` keeps a workspace-level fallback drop handler for drops outside scene columns (imports to selected/first scene).

## Preview Routing Rules
- Storyline cut double-click uses media type routing.
- Video cuts open Single Mode preview via `openVideoPreview(cut.id)`.
- Non-video cuts (image/lipsync) open Sequence Mode preview via `openSequencePreview(cut.id)`.
- Scene more menu has `Preview this Scene` entry.
- Scene more menu preview must pass `sceneId` directly (must not depend on selected scene state).

## AutoClip Entry
- Video cut context menu provides `AutoClip (Simple)` actions.
- AutoClip mode profiles and generation rules are defined in `docs/guides/autoclip.md`.

## Scene More Menu Actions
- Scene more menu has `Export this Scene` entry.
- Both entries (`Preview this Scene` / `Export this Scene`) are guarded when `scene.cuts.length === 0` (disabled and runtime early return).
- Scene resolution should use `resolveSceneById(sceneId)` and not `selectedSceneId`.

## External D&D Rules
- StoryTimeline/Storyline drop targets accept image/video assets.
- Audio files are excluded from StoryTimeline/Storyline external D&D targets.
- Unsupported external payloads do not create cuts.

## Storyline UI Boundary
- `Storyline` owns drag-and-drop execution, scene selection, and scene scroll execution.
- `SceneDurationBar` is a Header-side summary UI of `StoryTimeline` and only emits scene selection events.
- Header must not directly query Storyline DOM for scrolling (`document.querySelector` based scroll control is prohibited).
- External file drop flow is scene-targeted in `Storyline`; workspace-level fallback drop handling remains in `App`.
- Timeline structure mutation in this boundary must stay on command execution paths (`executeCommand`).

## Interaction Performance Notes
- During native drag, `closeDetailsPanel()` is triggered once on drag-enter (not every drag-over event) to avoid repeated store updates and re-renders.
- External file drops are queued sequentially in `queueExternalFilesToScene` so multi-file imports do not burst heavy work at once.
- Each queued import yields back to the event loop between items (`setTimeout(..., 0)`) to preserve drag/scroll responsiveness.
- Drop handlers prioritize immediate UI return; long-running import/thumbnail/vault work continues asynchronously via loading cuts.

## Scroll Ownership
- `Storyline` owns scene scrolling and follows `selectedSceneId`.
- `SceneDurationBar` only emits scene selection events; it does not control Storyline DOM directly.

## Disambiguation Notes
- `Scene` is a data unit; `Storyline` is the editing UI that renders scenes.
- `SceneDurationBar` is not a playback timeline. It summarizes edit-axis duration only.
- Preview route switching (`openVideoPreview` / `openSequencePreview`) is playback behavior and must not rename editing-axis concepts.

## Timeline Integrity Rules
- Multi-select drag (`MoveCutsToSceneCommand`) must normalize selected cut IDs by timeline order before move.
- `moveCutsToScene` must preserve timeline order even if caller passes IDs in arbitrary order.
- Scene chronology source is `sceneOrder: sceneId[]`; cut chronology source is `cut.order`.
- Export chronology must reuse the same normalization helpers (`src/utils/timelineOrder.ts`).
- Reorder inside an expanded group must update both scene cut order and group `cutIds` order in one command (`ReorderCutsWithGroupSyncCommand`).
- The same expanded-group reorder rule applies to both single-drag and multi-select drag.
