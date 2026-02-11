# MP4 Export Plan (LipSync + VideoClip + Framing)

**目的**: MP4 export の実装ラインを、現行の未完了タスク中心に管理する。  
**最終更新**: 2026-02-11

## ライン位置
- Workstream: **Line B (MP4 Export)**
- 親ノート: `docs/notes/export-workstreams.md`
- 参照:
  - `docs/notes/export-timeline-integrity-plan.md`
  - `docs/notes/cut-refactor-plan.md`
  - `docs/notes/audio_pre_export_design.md`

## 現在地
- 事前整備（画像Crop導線、Free既定値 `1280x720`）は導入済み。
- 本線は **LipSync + VideoClip + Framing を export 経路へ統合** する段階。
- LipSync cut は export 入力へ `framePaths + rms + thresholds` を渡し、ffmpeg 側でフレーム列化して MP4 へ反映する実装を導入済み。

## In Scope（現行フェーズ）
1. LipSync cut の見た目を MP4 出力へ反映（silent fallback しない）。
2. VideoClip (`inPoint/outPoint`) を非破壊で export に適用。
3. Preview/Export の framing パラメータを一致させる。
4. export 実行経路を App 側に一本化。

## Out of Scope（別ライン/後続）
1. ExportModal の全面UX再設計
2. 音声分離実装（master/lipsync）本体
3. Cut全面リファクタ（`docs/notes/cut-refactor-plan.md` の Phase 2 以降）

## 先行決定
1. Free 解像度は export 実行時 `1280x720` を既定とする。
2. 画像の例外調整は `Crop Image (Add Cut)` を利用（派生asset追加）。
3. export 順序は時系列整合性ルール（scene/cut order）を必須維持。

## 受け入れ条件
1. LipSync cut が MP4 に正しく反映される。
2. VideoClip の `inPoint/outPoint` が MP4 に反映される。
3. preview/export の framing 結果が仕様内で一致する。
4. 既存 image/video export が回帰しない。

## リスク
1. Framing仕様が未固定のまま進めると見た目差分が再発する。
2. Cut副作用重複を放置すると export 実装中に修正漏れが増える。

## 直近アクション
1. Framing仕様（fit/cover + anchor）を確定。 ✅（既定: `cover + center`）
2. Export入力生成へ framing パラメータを追加。 ✅（`framingMode` / `framingAnchor`）
3. ffmpeg側 filter へ同一パラメータ適用。 ✅（`cover`/`fit` + anchor）
4. 回帰テスト（順序/clip/lipsync/framing）を追加。
