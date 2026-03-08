# Export Guide

## TL;DR
対象：Export時系列生成と出力境界
正本：sceneOrder + domain正規化後canonical cut timing
原則：
- Preview/Exportで時間定義を分離しない
- Exportは独自の時間再計算を持たない
- Exportはdomain構造を変更しない
詳細：音声詳細は export-audio-mix を参照

**目的**: Export の時系列・出力境界・Preview parity を固定する。  
**適用範囲**: Export 計画解決、出力シーケンス生成、Export実行境界。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/cut-history.md`, `docs/guides/implementation/export-audio-mix.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Scene順序は `sceneOrder` を唯一の正本とする。
- Must: export 入力は domain 正規化後の canonical timing を使う。
- Must: Export は canonical timing を消費する側とし、独自再計算を持たない。
- Must: Export は domain 構造を変更しない。
- Must: canonical timing が破綻している場合は fail-fast する。
- Must: Preview と Export は同一の framing/time 解決ルールを維持する。
- Must: Export consumer は `buildSequencePlan(project, opts)` を公開入口として使う。
- Must: `displayTime` は export前に有限正数へ正規化する。
- Must: Export の正規化は出力整形に限定する。
- Must: SequencePlan consumer は warning を戻り値として扱い、implicit console logging に依存しない。
- Must Not: `scenes` 配列順を Scene index 算出の根拠にしない。
- Must Not: AudioPlan を時間源として扱わない。
- Must Not: Export consumer が `buildSequenceItemsForCuts` / `buildSequenceItemsForExport` を直接公開入口として増やさない。
- Must Not: parity を壊す変更を片側（Preview/Export）だけに入れない。

## 境界ルール
- Export が担当:
  - export plan の正規化
  - 出力シーケンス生成
  - 出力実行境界（IPC）への受け渡し
- Export が担当しない:
  - Preview 側の再生制御
  - Vault index/trash 更新

## 時間整合ルール
- canonical timing は domain 正規化後の値を正本とする。
- Scene export の scene index 表示値は `sceneOrder` から算出する。
- AudioPlan は canonical cut 列に整合する時間軸で生成し、時間源にはしない。
- SequencePlan 入口は `buildSequencePlan(project, opts)` を使用し、Export 側で独自の入口を増やさない。
- `buildSequenceItemsForCuts` / `buildSequenceItemsForExport` は lower-level helper であり、主要 consumer は `SequencePlan.exportItems` を渡す。
- export helper の warning は構造化して上位へ返し、consumer 側で UI / telemetry / test に利用する。

## 出力ルール
- MP4 系出力では sidecar（manifest/timeline）整合を維持する。
- 分離音声（`*.audio.flac`）の扱いは audio mix ガイドを正本とする。

## 運用メモ
- 実装到達点・検証手順・日付付き経緯は `docs/notes/` へ分離する。
- 未確定事項は `docs/TODO_MASTER.md` で管理する。

## 関連ガイド
- Preview時間正本: `docs/guides/preview.md`
- Cut履歴境界: `docs/guides/cut-history.md`
- 音声ミックス実装: `docs/guides/implementation/export-audio-mix.md`
