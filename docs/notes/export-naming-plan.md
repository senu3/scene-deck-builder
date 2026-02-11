# Export実装前 命名整理計画

**目的**: Export実装中の命名ブレを防ぎ、Line A/Bの変更を用語面で安定化する。  
**最終更新**: 2026-02-11

## ライン位置
- Workstream: **Line C (Naming / Glossary Governance)**
- Workstream履歴: `docs/notes/archive/export-workstreams-implemented-2026-02-11.md`

## 現在地
- Phase 1（docs先行の基本固定）は完了。
- 以後は Line B 実装に追従して都度確定する運用フェーズ。

## 管理対象（固定ルール）
1. 時間軸の語彙を混在させない。
- 編集: `StoryTimeline`
- 再生: `SequenceClock` / `useSequencePlaybackController`
- 出力: `RenderSequence` / `ExportRunner`

2. `MediaSource` 用語境界を維持する。
- docs初出時に app-specific abstraction であることを注記。

3. `source` 用語を分離する。
- UI文脈: `SourcePanel`
- ファイル由来文脈: `ImportSourcePath` / `OriginPath`

## 次アクション（Line B連動）
1. Framing実装で追加される型・関数名の命名レビュー。
2. Export入力構造の命名最終化（`RenderSequence*` 系）。
3. 実装後に `DOMAIN.md` / `MAPPING.md` へ反映。

## 完了条件
- Line B 実装で新規導入された Export関連名称が本ノートと一致する。
- `docs/references/DOMAIN.md` を最終正本として更新済みである。
