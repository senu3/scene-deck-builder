# Export Workstreams

**目的**: Export関連の複数計画をライン（workstream）単位で管理し、優先順位と依存関係を明確化する。  
**最終更新**: 2026-02-11

## ライン一覧

### Line A: Audio Model / Routing
- 主ノート: `docs/notes/audio_pre_export_design.md`
- 目的: cut単位音声モデルの整理と、export前提の音声分離仕様を確定する。
- 現在地: **進行中（実装済み＋未完了タスク混在）**
- 依存:
  - Line B（MP4 export）へ `kind`/`useEmbeddedAudio` 仕様を提供

### Line B: MP4 Export (LipSync + VideoClip + Framing)
- 主ノート: `docs/notes/export-mp4-lipsync-videoclip-plan.md`
- 目的: MP4 exportの実行経路と見た目整合（preview/export）を確定・実装する。
- 現在地: **進行中（解像度/Faming確定前提で段階実装）**
- 依存:
  - Line A の音声分類
  - Line C の命名規約

### Line C: Naming / Glossary Governance
- 主ノート: `docs/notes/export-naming-plan.md`
- 目的: Export実装中の用語ブレを防ぎ、docs/code命名の一貫性を維持する。
- 現在地: **継続運用（Phase 1完了、Phase 2以降は実装連動）**
- 依存:
  - Line B 実装差分を受けて最終反映

## 優先順位（現時点）
1. **Line B を先行**（Framing + Export の実装を優先）
2. Line A は Export実装に必要な最小範囲を並行で補強
3. Line C は実装に合わせて追従（都度固定）

## アーカイブ方針
- 実装済みで今後変更予定が低い内容は `docs/notes/archive/` に退避。
- 主ノートは「現行の意思決定と未完了タスク」に限定し、可読性を維持する。

## 関連
- `docs/notes/cut-refactor-plan.md`
- `docs/notes/export-timeline-integrity-plan.md`
