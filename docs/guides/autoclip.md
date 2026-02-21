# AutoClip Guide

## TL;DR
対象: AutoClip（Simple）の責務境界
正本: 動画cut対象 / Command経由追加 / source非破壊
原則:
- 対象は動画cutのみ
- 生成cut追加はCommand経由で可逆にする
- mode値や分割ロジック詳細はL2実装ガイドを正本にする
詳細: 実装詳細は implementation、未確定事項は notes を参照

**目的**: AutoClip のL1責務と不変条件を固定し、未確定仕様を分離して運用する。  
**適用範囲**: `src/components/CutCard.tsx`, `src/components/context-menus/CutContextMenu.tsx`, `src/store/commands.ts`, `src/features/cut/simpleAutoClip.ts`。  
**関連ファイル**: `docs/guides/storyline.md`, `docs/guides/cut-history.md`, `docs/guides/implementation/autoclip-simple.md`, `docs/notes/autoclip-open-items-2026-02-21.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: `AutoClip (Simple)` は動画cutのみ対象にする。
- Must: 生成cutの追加は Command 経由で行い、Undo/Redo で可逆にする。
- Must: source cut を破壊更新しない。
- Must: AutoClip の境界変更時は `storyline.md` と整合させる。
- Must Not: UI配置未確定事項をL1で確定仕様として書かない。
- Must Not: modeパラメータ値をL1正本として固定しない。

## Scope
- 対象機能は `AutoClip (Simple)` のみ。
- 現行実行入口は cut context menu。
- Scene/Preview/Export の責務境界は各L1ガイドに従う。

## Canonical Boundaries
- Timeline構造変更は Command 境界で実行する。
- AutoClip は split候補生成と cut挿入までを責務とする。
- アルゴリズム詳細（mode値、RMSスナップ、フォールバック挙動）は L2 正本で管理する。

## Open Items Handling
- 精度課題、UI配置未確定、RMS有効性評価は notes で管理する。
- 未確定事項を解消した時点で、L1には「確定した責務境界」だけを反映する。

## Related Docs
- 実装詳細: `docs/guides/implementation/autoclip-simple.md`
- 未確定事項: `docs/notes/autoclip-open-items-2026-02-21.md`
