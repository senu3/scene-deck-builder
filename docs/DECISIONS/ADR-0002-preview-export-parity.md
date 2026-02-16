# ADR-0002: Preview/Export parity を不変条件として維持する

## Status
Accepted (2026-02-16)

## Context
- ユーザー価値は「見たまま書き出せること」に依存する。
- Preview と Export が別々に時系列や解決ロジックを持つと、表示と出力が乖離する。
- Framing、displayTime、audio mix、scene/cut 順序は乖離が起きやすい主要点である。

## Decision
- Preview と Export は共通の時系列定義・順序正規化・解決ロジックを使う。
- 乖離リスクがある変更（Framing/順序/音声/displayTime）は parity チェックを必須にする。
- 仕様変更時は Preview と Export の両 docs を同時更新する。

## Consequences
- 片側だけの最適化は原則不可（必要なら ADR で例外化する）。
- テストとチェックリストは parity 観点を最小セットで維持する。
- 開発フローで「どの軸に影響するか」の明記が必須になる。
