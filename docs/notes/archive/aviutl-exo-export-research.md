# AviUtl(EXO) Export 調査書 v2

**目的**: EXO Export 実装着手前に、仕様・命名・責務分割・テスト計画を統合して確定する。  
**適用範囲**: AviUtl(EXO) 出力の設計調査（実装前）。  
**関連ファイル**: `docs/references/DOMAIN.md`, `docs/references/MAPPING.md`, `docs/guides/preview.md`, `docs/guides/media-handling.md`, `docs/guides/storyline.md`, `docs/guides/export-guide.md`, `.notes/export_plan.md`。  
**更新頻度**: 中。  

## ステータス（2026-02-10）
- 進捗: 「1. 命名・境界（実装前に固定）」まで完了
- 判断: EXO 出力は中止し、MP4 export 実装へ移行
- 扱い: 本ノートはアーカイブ（履歴参照用）。新規実装の正本としては使わない

## 中止理由（要約）
- 最新 AviUtl 環境で EXO の互換運用に問題があり、実運用リスクが高い。
- 既存パイプラインとの親和性・保守性を優先し、出力軸は MP4 に一本化する。

## 引き継ぎ先（MP4）
- `docs/notes/archive/export-timeline-integrity-plan-implemented-2026-02-11.md`
- `docs/notes/archive/audio_pre_export_design-closed-2026-02-11.md`
- `docs/notes/archive/export-naming-plan-implemented-2026-02-11.md`

## 0. ゴール（最終アウトプット）
1. EXO最小仕様ドラフト（対応範囲 / 非対応 / 例外）
2. `AviUtlExportPlan` 型案（入力/出力/丸め/素材参照）
3. 実装分割案（純粋関数 / 副作用 / IPC / queue）
4. テスト計画（unit/integration、配置、ケース）
5. 既存 Export/ffmpeg queue と衝突しない接続設計

> 注: 上記ゴールは EXO 方針時点のもの。現在は新規作業対象外。

## 0.1 現在の前提（2026-02 時点）
- docs側の命名境界は反映済み（`DOMAIN.md`/`MAPPING.md`）。
- `Storyline` ガイドは現行命名へ更新済み（`SceneDurationBar`, `StoryTimeline`）。
- `CuttableMediaType` への移行は進行中で、`getTimelineMediaType` は互換エイリアスとして残存。
- したがって本調査書は「実装設計の確定」に集中し、命名再議論は避ける。

## 1. 命名・境界（実装前に固定）
- 編集軸: `StoryTimeline`
- 再生軸: public `useSequencePlaybackController` / internal `SequenceClock`
- 出力軸（暫定）: `RenderSequence` / 実行制御: `ExportRunner`
- `MediaSource` は Preview専用 app-specific abstraction（Web API `MediaSource` とは別）
- `source` の使い分け:
  - UI状態: `SourcePanel`
  - ファイル由来: `ImportSourcePath` / `OriginPath`
- ルール: Export実装内で `Timeline` 語を新規導入しない（`RenderSequence` 系へ統一）

## 2. 最小スコープ（V1）
- シーン→カット順で EXO を1ファイル出力
- 画像/動画を素材として配置（最初は読み込み成功と尺一致を優先）
- 秒→フレーム変換で丸めモード（四捨五入/切り捨て/切り上げ）
- オプション: `media/` へ素材コピー
- 目標: AviUtl で「読み込める」「並びと長さが一致」

## 3. 調査タスク
### A. 既存 export/IPC/queue の特定
1. `electron/` で `export`, `exo`, `aviutl`, `ffmpeg`, queue 関連を列挙
2. 責務分割を比較:
   - renderer: `RenderSequence`/plan 生成（純粋）
   - main: 書き込み/コピー（副作用、queue）
3. VaultGateway/index/trash 更新要否を判断（通常 export は index 更新不要）

### B. `AviUtlExportPlan` 入力設計
1. `Scene/Cut/Asset` から必要値の所在を確定
2. 素材参照パス方針を比較:
   - `media/` コピー参照（推奨）
   - vault 既存参照
3. clip in/out は V1 で未対応にするか判断（必要なら仕様に明記）
4. 丸め仕様を秒→frame規約として固定
5. V1は単一EXO、分割出力は拡張に回す
6. frame規約の境界条件を先に固定:
   - `start` 1-based / `end` inclusive の採用可否
   - ゼロ長カットの扱い（最小1frameに丸めるか）

### C. EXOテンプレート方針
1. 文字列テンプレ vs AST serialize を比較して採用方針を決定
2. 最小テンプレ要件:
   - `[exedit]` ヘッダ
   - object セクション（カット単位）
   - 素材参照（画像/動画）
3. エンコード/改行方針（Shift_JIS, CRLF など）を実機検証で確定
4. パス方針を先に固定:
   - 既定は相対 `media\\...`
   - 必要時のみ絶対パスモードを追加（オプション）

### D. 実装分割と配置案
- `src/export/aviutl/plan.ts`（純粋）
- `src/export/aviutl/exo.ts`（AST/serialize、純粋）
- `electron/handlers/exportAviUtl.ts`（副作用）
- `ipc`: Export開始/進捗/完了/失敗
- `src/types/export.ts`（任意）:
  - `AviUtlExportPlan`, `ExportProgressEvent`, `ExportFailureReason` を集約

### E. テスト計画
1. Unit:
   - plan変換（順序、丸め、素材分岐）
   - serialize結果（必須キー、object数）
2. Integration:
   - 出力フォルダ構成
   - mediaコピー件数/命名
   - 異常系（欠損、書込失敗、中断）
3. 固定フィクスチャ（最低3種）:
   - minimal
   - heavy
   - missing-asset

## 4. 実装前に先に決めるべき契約
1. 入力契約: どの store/metadata を使うか
2. 出力契約: ファイル命名、保存先、上書きルール
3. 失敗契約: 中断/部分成功/再試行の扱い
4. 進捗イベント契約: `queued/running/progress/completed/failed/cancelled`
5. キャンセル契約:
   - キャンセル要求の受理タイミング
   - partial出力物の扱い（保持/削除）
6. ログ契約:
   - ユーザー表示メッセージと開発者向け詳細ログを分離

## 5. 落とし穴チェック
- renderer に巨大データを載せない（コピー/書込は main 側）
- export で index/trash 更新を誤って発火させない
- Preview用語（`SequenceClock`, `PreviewMediaSource`）とExport用語（`RenderSequence`, `ExportRunner`）を混在させない

## 6. 実行チェックリスト
- [x] 用語を `DOMAIN.md` / `MAPPING.md` と一致させる
- [ ] `RenderSequence` と `ExportRunner` の仮名を実装で採用（MP4 側で継続判断）
- [ ] `AviUtlExportPlan` の型ドラフト作成（中止）
- [ ] EXO最小テンプレを確定（中止）
- [ ] `start/end` とゼロ長カットのフレーム規約を確定（中止）
- [ ] 相対/絶対パス方針を確定（既定: 相対）（中止）
- [ ] unit/integration のテストファイル配置を決定（中止）
- [ ] 失敗系と進捗イベントの契約を決定（MP4 側へ移管）
- [ ] キャンセル時の partial出力物ポリシーを決定（MP4 側へ移管）
