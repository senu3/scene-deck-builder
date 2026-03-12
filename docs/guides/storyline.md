# Storyline Guide

## TL;DR
対象: Storyline編集操作と境界責務
正本: `sceneOrder` / Command実行境界 / Scene選択イベント境界
原則:
- 構造変更はCommand経由でのみ行う
- 並び順の正本は `sceneOrder` と `cut.order` に固定する
- UIは選択イベントをemitし、構造データを直書きしない
詳細: Preview/Export/AutoClip は各ガイドを参照

**目的**: Storyline の編集責務、Command/Event 境界、禁止事項を固定する。  
**適用範囲**: `src/components/Storyline.tsx`, `src/hooks/useStorylineDragController.ts`, `src/components/SceneDurationBar.tsx`。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/export.md`, `docs/guides/autoclip.md`, `docs/guides/implementation/scene-duration-bar-ui.md`, `docs/guides/implementation/dnd-import.md`, `docs/references/DOMAIN.md`, `docs/references/MAPPING.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Timeline 構造変更は Command 経由で行う。
- Must: Scene/Cut の順序正本は `sceneOrder` / `cut.order` とする。
- Must: Scene系操作は `sceneId` 直指定で解決する。
- Must: Storyline は D&D の主受け口として scene-targeted drop を処理する。
- Must: 空の scene は scene 内 drop hint で image/video 投入を案内する。
- Must: Storyline は hover 中の `Space` 押下で横パン（hand tool）を有効化する。
- Must: hand tool 有効中は Storyline 内の click/D&D を一時抑止し、パンを優先する。
- Must: `SceneDurationBar` は scene選択イベント通知に限定する。
- Must: 外部D&Dは image/video のみを受理し、audio は受理しない。
- Must Not: 配列の現在並び（描画順）を正本として扱わない。
- Must Not: UI から scene/cut 構造を直書き変更しない。
- Must Not: `selectedSceneId` 依存で scene preview/export 対象を解決しない。
- Must Not: Header から Storyline DOM を直接スクロール制御しない。

## Naming Boundary
- `Storyline`: 編集UI。
- `StoryTimeline`: 編集軸の概念名（UI名ではない）。
- `SceneDurationBar`: `StoryTimeline` 要約のHeader UI（再生タイムラインではない）。

## Command Boundary
- 対象:
  - scene 追加/削除/リネーム
  - cut 移動/並べ替え/複数移動
  - group 同期を伴う reorder
- ルール:
  - 書き換えは command 実行経路に統一する。
  - undo/redo 一貫性を壊す直接更新を禁止する。

## Event Boundary
- `SceneDurationBar`:
  - scene 選択イベントを emit するのみ。
  - Storyline の DOM 制御責務は持たない。
- `Storyline`:
  - `selectedSceneId` に追従して scroll 実行を所有する。
  - scene header と scene surface の click で scene 選択を所有する。
  - hand tool の有効化条件（hover + `Space`）と横スクロール実行を所有する。
  - scene-targeted drop を主処理し、`App` はワークスペース fallback を担う。

## Empty Scene Hint
- all scenes empty の初期状態では、先頭 scene のみ強い初回導線を表示する。
- 他の空 scene は compact な drop hint に留め、scene-targeted drop を崩さない。
- hint は説明専用であり、click 操作や別経路 import を強制しない。

## Ordering Canonical Rules
- scene chronology source: `sceneOrder: sceneId[]`
- cut chronology source: `cut.order`
- multi-select move/reorder は timeline 順へ正規化してから実行する。
- export chronology でも同じ順序正規化を再利用する。
- expanded group 内 reorder は scene順と `group.cutIds` を同時同期する。

## Disallowed Patterns
- 配列の偶然の順序を仕様として前提にする実装。
- UI 層での scene/cut 配列の直接再構成。
- Scene preview/export 解決を `selectedSceneId` だけに依存させる実装。
- Header 層の DOM query で Storyline scroll を起動する実装。

## Related Docs
- Preview routing: `docs/guides/preview.md`
- Export scope: `docs/guides/export.md`
- AutoClip entry: `docs/guides/autoclip.md`
- SceneDurationBar UI仕様: `docs/guides/implementation/scene-duration-bar-ui.md`
- DnD/Import 実装ルール: `docs/guides/implementation/dnd-import.md`
