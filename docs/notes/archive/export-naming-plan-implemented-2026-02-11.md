# Export 命名ガバナンス [Archive]

**目的**: Export実装後の命名を実装実体に合わせて固定し、以後の追加変更の基準を明確化する。  
**最終更新**: 2026-02-11

## ライン位置
- Workstream: **Line C (Naming / Glossary Governance)**
- Workstream履歴: `docs/notes/archive/export-workstreams-implemented-2026-02-11.md`
- 現行運用: `docs/guides/export.md`

## 現在地
- MP4 export 実装に追従した命名反映を実施済み。
- 以後は差分発生時のみ更新する維持運用フェーズ。

## 管理対象（固定ルール）
1. 時間軸の語彙を混在させない。
- 編集: `StoryTimeline`
- 再生: `SequenceClock` / `useSequencePlaybackController`
- 出力:
  - 実行計画: `ExportPlan` / `Mp4ExportPlan`
  - 計画解決: `resolveExportPlan`
  - 出力シーケンス: `ExportSequenceItem` / `buildSequenceItemsForExport`
  - 実行境界(IPC): `window.electronAPI.exportSequence`

2. `MediaSource` 用語境界を維持する。
- docs初出時に app-specific abstraction であることを注記。

3. `source` 用語を分離する。
- UI文脈: `SourcePanel`
- ファイル由来文脈: `ImportSourcePath` / `OriginPath`

## 反映済み事項
1. Framing実装で追加された型・関数名（`framingMode`/`framingAnchor`/`resolveFramingParams`）を docs へ反映。
2. Export入力構造の名称を `ExportSequenceItem` 系へ統一。
3. 実行計画名称を `ExportPlan` 系へ統一。
4. `DOMAIN.md` / `MAPPING.md` の出力軸記述を実装名へ更新。

## 完了条件
- MP4実装で導入された Export関連名称が本ノートと一致している。
- `docs/references/DOMAIN.md` / `docs/references/MAPPING.md` が実装名で同期されている。
