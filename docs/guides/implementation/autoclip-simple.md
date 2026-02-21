# AutoClip (Simple) Implementation

## TL;DR
対象: `AutoClip (Simple)` の分割アルゴリズムと実行経路
正本: `simpleAutoClip.ts` / `AutoClipSimpleCommand`
原則:
- base境界を作り、RMS解析がある場合のみスナップ補正する
- split確定後にCommandでcutを挿入する
- 解析失敗時はベース分割へフォールバックして継続する
詳細: 未確定事項は `docs/notes/autoclip-open-items-2026-02-21.md` を参照

**目的**: AutoClip の実装依存仕様をL2として固定する。  
**適用範囲**: `src/features/cut/simpleAutoClip.ts`, `src/store/commands.ts`, `src/components/CutCard.tsx`, `src/components/context-menus/CutContextMenu.tsx`。  
**関連ファイル**: `docs/guides/autoclip.md`, `docs/guides/storyline.md`, `src/store/__tests__/timelineIntegrityCommands.test.ts`。  
**更新頻度**: 中。

## Must / Must Not
- Must: split点計算は `generateSimpleAutoClipSplitPoints` を単一入口にする。
- Must: 挿入処理は `AutoClipSimpleCommand` で行う。
- Must: `undo`/`redo` は scene snapshot を使って可逆性を維持する。
- Must: 解析失敗時は例外停止せずベース分割へフォールバックする。
- Must Not: UIから scene/cut 構造を直接更新しない。

## Current Runtime Path
1. `CutCard` から `AutoClipSimpleCommand(sceneId, cutId, mode)` を実行。
2. command 側で source cut / source asset / duration を検証。
3. `generateSimpleAutoClipSplitPoints` で split候補生成。
4. `buildSimpleAutoClipRanges` で ranges 化。
5. source cut 直後へ生成cutを挿入。

## Mode Definitions (Current)
- `default`
- `conservative`
- `aggressive`

現在のUI公開:
- context menu では `default` / `aggressive` を公開。
- `conservative` は型・実装上は存在するがUI公開されていない。

## Split Generation Rules
- base境界:
  - `targetLenSec` 間隔で境界を作成。
- RMS補正:
  - `analyzeAudioRms` 成功時に強変化点を検出し、`snapWindowSec` 内で境界を補正。
- 正規化:
  - `minLenSec` 未満区間を除外。
  - `maxCuts` 上限を適用。
  - 重複・範囲外境界を除外。

## Failure/Fallback
- sourcePath 未取得またはRMS解析失敗時:
  - base境界のみで継続。
- split点が生成されない場合:
  - no-op 終了（`outcome=noop`）。
- 動画cut以外:
  - `invalid-target`。

## Thumbnail Handling
- 生成cutのサムネイル更新は共通ヘルパー経由。
- サムネイル生成失敗時もcut作成自体は継続する。

## Tests to Keep in Sync
- `src/store/__tests__/timelineIntegrityCommands.test.ts`
  - created/noop/invalid-target
  - aggressive上限適用
  - undo/redo可逆性
  - フォールバック経路
