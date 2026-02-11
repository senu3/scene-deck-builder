# Export Guide

Export機能の現行運用ルールと、実装完了済み計画から引き継ぐ継続メモを集約する。

## 対象範囲
- MP4 export（LipSync / VideoClip / Framing）
- Export実行計画と出力シーケンス生成
- Preview/Export の見た目整合
- Export時系列整合性（scene/cut order, displayTime ガード）
- 命名ガバナンス（Export関連）

## 現在の実装到達点
- ExportModal は MP4 実運用、AviUtl は Coming Soon。
- Export設定は `resolveExportPlan` で正規化し、UIと実行境界を分離。
- 出力シーケンスは `buildSequenceItemsForExport` / `buildSequenceItemsForCuts` で生成。
- Framing は `resolveFramingParams` を単一入口として Preview/Export で同一解決。
- LipSync export は strict 検証を通過しない場合に失敗（silent fallback なし）。
- 成果物は `export/<folder>/video.mp4` + sidecar `manifest.json` / `timeline.txt`。
- エクスポート進行中は Banner（progress/info）を表示し、完了時に削除。

## 命名ガバナンス（固定）
- 編集軸: `StoryTimeline`
- 再生軸: `SequenceClock` / `useSequencePlaybackController`
- 出力軸:
  - 実行計画: `ExportPlan` / `Mp4ExportPlan` / `AviUtlExportPlan`
  - 計画解決: `resolveExportPlan`
  - 出力シーケンス: `ExportSequenceItem` / `buildSequenceItemsForExport`
  - 実行境界(IPC): `window.electronAPI.exportSequence`
- `MediaSource` は docs 上で「Preview向け app-specific abstraction」と注記する。

## 時系列整合性ルール（Invariant）
1. Scene順は配列順と `scene.order` が常に一致する。
2. Cut順は配列順と `cut.order` が常に一致する。
3. export入力は時系列正規化済み列のみを参照する。
4. Undo/Redo 後も 1-3 が維持される。
5. `displayTime` は export前に有限正数へ補正される。

## 継続運用チェックリスト
1. Export関連変更時は `resolveExportPlan` と実行側の差分を同時確認する。
2. Framing変更時は Preview (`object-fit/object-position`) と Export filter の parity を確認する。
3. LipSync変更時は payload検証と strict failure を維持する。
4. timeline順序変更時は `timelineOrder` と export生成系テストを更新する。
5. sidecar仕様を変える場合は `manifest.json` と `timeline.txt` の整合を同時更新する。

## テスト観点（最小）
- `src/features/export/__tests__/plan.test.ts`
- `src/utils/__tests__/exportSequence.test.ts`
- `src/utils/__tests__/lipSyncExport.test.ts`
- `src/store/__tests__/timelineIntegrityCommands.test.ts`

## 既知メモ
- AttachAudio ON/OFF UI は `audioBindings[].enabled` を使う最小導入案で保留。
- 音声分離出力（`audio_master.wav` / `audio_lipsync.wav`）は現フェーズ中止。
- Cut全面リファクタは `docs/notes/cut-refactor-plan.md` 側で管理。

## 参照
- `docs/references/DOMAIN.md`
- `docs/references/MAPPING.md`
- `docs/notes/archive/audio_pre_export_design-closed-2026-02-11.md`
- `docs/notes/cut-refactor-plan.md`
- `docs/notes/archive/export-mp4-lipsync-videoclip-plan-implemented-2026-02-11.md`
- `docs/notes/archive/export-naming-plan-implemented-2026-02-11.md`
- `docs/notes/archive/export-timeline-integrity-plan-implemented-2026-02-11.md`
