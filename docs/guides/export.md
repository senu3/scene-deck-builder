# Export Guide

## TL;DR
対象：Export時系列生成と出力境界
正本：sceneOrder + canonical cut timing
原則：
- Preview/Exportで時間定義を分離しない
- export入力は正規化済みcut列のみ
- scenes配列順を順序根拠にしない
詳細：音声詳細は export-audio-mix を参照

**目的**: Export の時系列・解決ロジック・出力運用を固定し、Preview/Export parity を維持する。
**適用範囲**: `src/features/export/*`, `src/utils/exportSequence.ts`, `src/utils/timelineOrder.ts`, `electron/main.ts`（export系 IPC）。
**関連ファイル**: `docs/ARCHITECTURE.md`, `docs/guides/preview.md`, `docs/guides/implementation/export-audio-mix.md`, `docs/guides/cut-history.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: Scene順序は `sceneOrder` を唯一の正本とする。
- Must: export 入力は時系列正規化済み列のみを参照する。
- Must: Preview と Export は同一の framing/time 解決ルールを維持する。
- Must Not: `scenes` 配列順を Scene index の計算根拠にしない。
- Must Not: export 前の `displayTime` ガードを省略しない。
- Must Not: parity を壊す変更を片側（Preview/Export）だけに入れない。

## 対象範囲
- MP4 export（LipSync / VideoClip / Framing）
- MP4 export（分離音声ミックス: FLAC）
- Export実行計画と出力シーケンス生成
- Preview/Export の見た目整合
- Export時系列整合性（scene/cut order, displayTime ガード）
- 命名ガバナンス（Export関連）

## 現在の実装到達点
- ExportModal は MP4 実運用を基準とする。
- Export設定は `resolveExportPlan` で正規化し、UIと実行境界を分離。
- 出力シーケンスは `buildSequenceItemsForExport` / `buildSequenceItemsForCuts` で生成。
- Scene more menu 起点の Scene export は `startExportForCuts(scene.cuts, scope)` の専用入口で実行する。
- Scene export の `resolveExportPlan` には任意で `exportScope: { kind: 'scene', sceneId }` を保持できる。
- Scene export の出力先は `export/<project>/scenes/scene_<index>_<title>-<sceneId短縮>/` を標準とする。
- Framing は `resolveFramingParams` を単一入口として Preview/Export で同一解決。
- LipSync export は strict 検証を通過しない場合に失敗（silent fallback なし）。
- LipSync concat から動画セグメント化する経路は ffmpeg 6系互換のため CFR 固定（`-fps_mode cfr` + `-r <fps>`）を使用する。
- 成果物は `export/<folder>/video.mp4` + sidecar `manifest.json` / `timeline.txt`。
- 分離音声は `*.audio.flac` を同時出力（詳細は `docs/guides/implementation/export-audio-mix.md`）。
- エクスポート進行中は Banner（progress/info）を表示し、完了時に削除。

## 命名ガバナンス（固定）
- 編集軸: `StoryTimeline`
- 再生軸: `SequenceClock` / `useSequencePlaybackController`
- 出力軸:
  - 実行計画: `ExportPlan` / `Mp4ExportPlan`
  - 計画解決: `resolveExportPlan`
  - 出力シーケンス: `ExportSequenceItem` / `buildSequenceItemsForExport`
  - 実行境界(IPC): `window.electronAPI.exportSequence`
- `MediaSource` は docs 上で「Preview向け app-specific abstraction」と注記する。

## 時系列整合性ルール（Invariant）
1. Scene順は `sceneOrder: sceneId[]` を唯一の正として扱う。
2. Cut順は配列順と `cut.order` が常に一致する。
3. export入力は時系列正規化済み列のみを参照する。
4. Undo/Redo 後も 1-3 が維持される。
5. `displayTime` は export前に有限正数へ補正される。
6. Scene export の scene index 表示値は `sceneOrder` から算出する（`scenes` 配列順を直接使わない）。

## 継続運用チェックリスト
1. Export関連変更時は `resolveExportPlan` と実行側の差分を同時確認する。
2. Framing変更時は Preview (`object-fit/object-position`) と Export filter の parity を確認する。
3. LipSync変更時は payload検証と strict failure を維持する。
4. LipSync concat出力で可変フレームレートを導入する場合は、`-r` との同時指定禁止（`-vsync/-fps_mode` の整合を必ず確認）。
5. timeline順序変更時は `timelineOrder` と export生成系テストを更新する。
6. sidecar仕様を変える場合は `manifest.json` と `timeline.txt` の整合を同時更新する。

## テスト観点（最小）
- `src/features/export/__tests__/plan.test.ts`
- `src/utils/__tests__/exportSequence.test.ts`
- `src/utils/__tests__/lipSyncExport.test.ts`
- `src/store/__tests__/timelineIntegrityCommands.test.ts`

## 既知メモ
- `TODO-NICE-002` を参照: `docs/TODO_MASTER.md`
- MP4 export は分離音声 `*.audio.flac` を同時出力する（映像と同一ベース名）。`filter_complex` で映像由来音声 + Cut/Scene attachAudio を timeline 配置して `amix(normalize=0)` で1回レンダーする。
- Cut/Undo/Redo の運用ルールは `docs/guides/cut-history.md` 側で管理。

## 参照
- `docs/references/DOMAIN.md`
- `docs/references/MAPPING.md`
- `docs/guides/implementation/export-audio-mix.md`
- `docs/guides/cut-history.md`
- `docs/notes/archive/store-slice-plan-implemented-2026-02-12.md`
- `docs/notes/archive/audio_pre_export_design-closed-2026-02-11.md`
- `docs/notes/archive/export-mp4-lipsync-videoclip-plan-implemented-2026-02-11.md`
- `docs/notes/archive/export-naming-plan-implemented-2026-02-11.md`
- `docs/notes/archive/export-timeline-integrity-plan-implemented-2026-02-11.md`
