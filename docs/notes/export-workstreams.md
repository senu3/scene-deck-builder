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
- 現在地: **進行中（解像度/Framing確定前提で段階実装）**
- 依存:
  - Line A の音声分類
  - Line C の命名規約

#### Line B 補足方針（2026-02-11）
- Framing は当面「Preview/Export で同一パラメータを使う」最小仕様で進める。
- 画像Crop追加後の適用順は `crop -> framing -> export` で固定する。
- Framing既定値は `cover + center`（center crop）とする。
- Framing解決優先順位は `cut値 -> global値 -> 固定値` とする。
- ただし将来のグローバルFraming設定追加に備え、実装境界は先に分離する。
  - 例: `resolveFramingParams(cut, projectDefaults)` を単一入口にし、現時点では `projectDefaults` は固定値運用。
  - 後続で設定画面を追加する場合は、`projectDefaults` の供給元のみ差し替える。

#### Line B 実装進捗（2026-02-11）
- `resolveFramingParams(cut, projectDefaults)` を導入し、解決優先順位を `cut -> global -> fixed` で実装。
- Export入力 (`SequenceItem`) に `framingMode` / `framingAnchor` を追加。
- App / Preview / Electron の export 経路を同一 framing 入力で接続。
- LipSync cut 用に Export入力へ `framePaths/rms/thresholds` を追加し、ffmpeg 側でフレーム列セグメント生成を実装。
- LipSync cut で必要データ不足時は export 入力生成で明示エラー化し、silent fallback を禁止。
- Preview からの export 実行は App 側へ委譲し、実行経路の入口を一本化。
- Free 既定値 `1280x720` の参照を定数化し、App/Preview/Crop の重複参照を削減。
- Framing の `projectDefaults`（`cover + center`）を定数化し、Preview/Export の両方へ明示供給。
- 回帰テストに統合ケース（`order + clip + lipsync + framing`）を追加。
- Preview framing 表示と export framing filter の整合を parity テストで自動検証。

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

## Line B 実装前チェックポイント
1. Framing入力構造（mode/anchor）の型を Preview/Export 共通で一本化する。
2. Free 解像度既定値（`1280x720`）の参照箇所を単一化し、Preview/Crop/Exportでズレないようにする。
3. LipSync/VideoClip 経路で Framing適用漏れが起きないよう、出力シーケンス生成点で必ず解決する。
4. `assets/` 内生成物（crop/finalize）は再インポート再命名しない方針を維持する。
5. Export入力生成時に「各cutの最終Framing値（解決後）」を確認できるログ/デバッグ表示を用意する。

## アーカイブ方針
- 実装済みで今後変更予定が低い内容は `docs/notes/archive/` に退避。
- 主ノートは「現行の意思決定と未完了タスク」に限定し、可読性を維持する。

## 関連
- `docs/notes/cut-refactor-plan.md`
- `docs/notes/export-timeline-integrity-plan.md`
