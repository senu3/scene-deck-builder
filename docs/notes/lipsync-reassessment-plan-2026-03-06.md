# LipSync Reassessment Plan (2026-03-06)

## TL;DR
- LipSync は現行の部分最適パッチを積み増さず、課題を再棚卸しして再設計する。
- 既存の `TODO-DEBT-011`（Gate9 thumbnail resolver-only）は本計画に統合し、単独タスクとしてはクローズする。
- SequencePlan Phase A（LIPSync 除外）の完了後に、Phase B として LipSync v2 を計画する。

## 目的
- LipSync の課題を「サムネ」だけでなく、生成物管理・再生一致・export 一致・回復性まで含めて再定義する。
- 今後の実装を、暫定パッチではなく段階計画（Hotfix / Re-design / Migration）で進める。

## 適用範囲
- 対象:
  - LipSync のサムネ解決経路
  - LipSync 生成 asset の所有/孤児管理
  - Preview/Export での LipSync 時間解決整合
  - fallback と warning の観測設計
- 非対象:
  - SequencePlan Phase A 自体（`normal/clip/hold/mute/black`）
  - 既存仕様と同一の軽微修正のみで閉じる対応

## Must / Must Not
- Must: 課題は再現条件つきで分類し、優先度を明示する。
- Must: SequencePlan への依存点を明示し、Phase A と B の境界を崩さない。
- Must: 既存 TODO との対応関係（置換/継承）を明示する。
- Must Not: 課題未整理のまま、局所修正を新規負債として積み増さない。
- Must Not: LIPSync v2 仕様を SequencePlan Phase A に混在させない。

## 現時点の扱い
- `TODO-DEBT-011` は「Gate9 thumbnail resolver-only」限定の旧タスクとしてクローズする。
- 本ノートを LipSync 見直しの正本メモとし、新規追跡IDで管理する。

## フェーズ案
### Phase 0: Triage（課題棚卸し）
- 既知問題の列挙と再現条件整理
- 影響領域の分類（thumbnail / plan parity / generated asset lifecycle / recovery）
- 緊急修正が必要な項目の切り出し

### Phase 1: Guardrails（境界固定）
- 現行経路に最小ガードを追加（warning, fallback 境界, 破壊的更新の抑止）
- Gate監査で検知できる範囲を増やす（必要な場合のみ）

### Phase 2: LipSync v2 Design
- SequencePlan Phase B との接続方式を決定
- time remap / frame select / source mapping の責務分離を確定
- generated asset の所有・孤児管理モデルを確定

### Phase 3: Migration
- 旧経路から v2 経路へ段階移行
- 後方互換と migration（必要時）を適用

## Done 条件（見直し完了）
- LipSync の課題一覧に再現条件・優先度・担当フェーズが紐づいている。
- SequencePlan Phase B への接続方式が docs で固定されている。
- `TODO-DEBT-011` を含む旧タスクの置換関係が TODO_MASTER で追跡可能。

## 関連
- `docs/notes/sequence-plan-phasea-unification-plan-2026-03-06.md`
- `docs/guides/lip-sync.md`
- `docs/notes/archive/gate9-provider-unification-update-2026-02-28.md`
