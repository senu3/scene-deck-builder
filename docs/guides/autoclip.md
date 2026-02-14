# AutoClip Guide

**目的**: Simple AutoClip の挙動・モード定義・既知課題を整理し、実装変更時の判断基準を固定する。  
**適用範囲**: `src/components/CutCard.tsx`, `src/components/context-menus/CutContextMenu.tsx`, `src/store/commands.ts`, `src/features/cut/simpleAutoClip.ts`。  
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/thumbnail-profiles.md`, `docs/guides/cut-history-guidelines.md`, `docs/references/MAPPING.md`。  
**更新頻度**: 中。

## 対象機能
- 対象は `AutoClip (Simple)` のみ。
- 実行入口は Cut のコンテキストメニュー。
- 対象 Cut が動画でない場合は実行不可（`invalid-target`）。

## 実行フロー
1. `CutCard` で `AutoClipSimpleCommand(sceneId, cutId, mode)` を実行。
2. `AutoClipSimpleCommand` が source cut / source asset / duration を検証。
3. `generateSimpleAutoClipSplitPoints` で分割候補を作成。
4. `buildSimpleAutoClipRanges` で連続レンジへ変換。
5. source cut の直後に複数 clip cut を挿入。

## モード定義（2026-02-14時点）
- `default`
  - 現在は従来 `aggressive` 相当の設定。
  - `targetLenSec: 2.0`, `minLenSec: 1.0`, `maxCuts: 12`
  - `rmsFps: 30`, `smoothingSec: 0.4`, `strongPercentile: 0.88`, `snapWindowSec: 0.7`
- `conservative`
  - `targetLenSec: 4.0`, `minLenSec: 1.0`, `maxCuts: 10`
  - `rmsFps: 24`, `smoothingSec: 0.6`, `strongPercentile: 0.92`, `snapWindowSec: 1.0`
- `aggressive`
  - `targetLenSec: 1.5`, `minLenSec: 1.0`, `maxCuts: 16`
  - `rmsFps: 30`, `smoothingSec: 0.35`, `strongPercentile: 0.86`, `snapWindowSec: 0.65`

## 生成ルール
- 基本分割は `targetLenSec` 間隔の境界で作成。
- 音声解析（RMS）が使える場合は強変化点へスナップ。
- `minLenSec` 未満の区間や末尾不足区間は除外。
- 上限は `maxCuts`（境界数ではなく生成 clip 数基準）。
- source cut は保持し、生成 cut は通常 cut として挿入（グループ化しない）。

## Undo/Redo
- `AutoClipSimpleCommand` は scene スナップショットを保持し、`undo` で丸ごと復元する。
- `redo` は保存済み `nextScene` を再適用し、再解析は行わない。

## 既知課題 / TODO
- TODO: AutoClip で新規追加された clip cut のサムネイルが inPoint 基準で再生成されない場合がある。
- 現状は `AutoClipSimpleCommand` が cut を直接構築して挿入しており、通常の「clip保存時サムネイル更新」経路（`DetailsPanel` 側）と処理が分離している。
- 対応方針:
  - clip作成後に「clip inPoint からのサムネイル再生成」を共通ユーティリティ化する。
  - `AutoClipSimpleCommand` と通常 clip 作成（`DuplicateCutWithClipCommand` / clip保存処理）で同じヘルパーを使う。
  - サムネイル生成失敗時は機能継続し、既存サムネイルを維持する。

## 変更時チェック
- `src/features/cut/simpleAutoClip.ts` の mode 値変更時は本ドキュメントを更新する。
- `maxCuts` の変更時は `src/store/__tests__/timelineIntegrityCommands.test.ts` の期待値を同期する。
- サムネイル処理を変更したら `docs/guides/thumbnail-profiles.md` との整合を確認する。
