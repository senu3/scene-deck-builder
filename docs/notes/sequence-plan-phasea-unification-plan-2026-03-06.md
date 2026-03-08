# SequencePlan Phase A Unification Plan (2026-03-06)

## TL;DR
- Phase A の主目的は「Preview/Export が同じ `buildSequencePlan(project, opts)` を入口として使う」状態を固定すること。
- 現状コードでは入口統一と `VIDEO_HOLD` 実装はすでに導入済みなので、このノートは「導入前計画」ではなく「到達点と残件の整理」として扱う。
- Phase A の対象は `normal/clip/hold/mute`。`black cut` は将来の internal asset フェーズへ分離する。
- LIPSync は Phase A 完了条件に含めず、temporary route warning を維持したまま Phase B へ持ち越す。

## 目的
- Preview/Export parity を `SequencePlan` 消費で担保する。
- `VIDEO_HOLD` を asset 非破壊で Preview/Export 共通解釈に載せる。
- LIPSync v2 や black internal asset を混ぜず、Phase A の Done 条件を曖昧にしない。

## 適用範囲
- 対象:
  - `buildSequencePlan(project, opts) -> SequencePlan` の公開入口維持
  - Preview/Export consumer の共通入口化
  - `normal/clip/hold/mute` の plan 表現
  - hold 永続化例外の境界固定
- 非対象:
  - `black cut` / black internal asset
  - LIPSync v2 の本実装
  - 音声解析キャッシュ最適化
  - sourceTime 離散切替の高度最適化

## Must / Must Not
- Must: SequencePlan の責務を「cut 列から canonical な再生/出力区間を組み立てる」に限定する。
- Must: Preview/Export は `buildSequencePlan` を同じ公開入口として使う。
- Must: Plan 生成は pure function のまま維持する。
- Must: `VIDEO_HOLD` は timeline 末尾延長として扱い、asset を破壊しない。
- Must: hold 永続化例外は `CutRuntimeState.hold` のみに限定する。
- Must Not: LIPSync 未確定仕様を SequencePlan の中核へ入れない。
- Must Not: `black cut` の将来仕様を仮想 API として先回り導入しない。
- Must Not: runtime 値の永続化例外を `hold` 以外へ広げない。

## 現在の到達点
### 入口統一
- `buildSequencePlan(project, opts)` は公開入口として導入済み。
- Preview sequence は `usePreviewSequenceDerived` から `target.kind='cuts'` 経由で利用している。
- Preview export は `usePreviewExportActions` から同じ入口を利用している。
- App 側 export も `buildSequencePlan` を利用している。

### Phase A で実装済みの表現
- `normal`
- `clip`
- `hold`
- `mute`

### Phase A で意図的に未完了の表現
- `black cut`
  - 理由: 現時点の実装・型・UI には存在せず、将来の internal asset として扱う前提に変更したため。

### hold 実装の現況
- `CutRuntimeState.hold` が hold 入力を保持する。
- `buildSequencePlan` は hold 用の video/export item を追加し、audio timeline も gap 補正する。
- project 保存では `cutRuntimeById` 全体を永続化せず、`hold` のみを抽出して保存/復元する。

## Phase A Done 条件
- Preview/Export が `buildSequencePlan` を共通入口として使う。
- `normal/clip/hold/mute` を Plan だけで表現できる。
- `VIDEO_HOLD` が Preview/Export/audio timeline で同じ canonical 解釈になる。
- Plan 生成が pure function のまま維持される。
- docs/references/TODO が現状実装に追随している。

## 残件
1. docs の正本更新
- `Preview` / `Export` ガイドに「consumer は `buildSequencePlan` を使う」を明記する。
- `DOMAIN` / `MAPPING` に `SequencePlan` を Preview/Export 共通の canonical sequence assembly として反映する。

2. consumer 前処理の重複削減
- Preview 側の `target.kind='cuts'` 構築重複を helper 化する。
- App 側は project 由来の cut->scene 解決を `buildSequencePlan` 側で補完し、呼び出し側の map 構築を減らす。

3. 回帰テストの補強
- `target.kind='cuts'` で resolver を省略しても project から scene 解決できることを固定する。
- hold / attach audio / mute の組み合わせが崩れないことを継続監視する。

## Phase B 以降
- LIPSync v2
- black internal asset
- 音声解析キャッシュ接続
- sourceTime 切替最適化

## 実務メモ
- SequencePlan は完成形を一気に設計せず、Phase A では parity の基線固定を優先する。
- 互換 bridge としての `SequencePlan.exportItems` / `audioPlan` は当面維持する。
- `lipsync-temporary-route` warning は Phase A では許容し、Phase B で撤去方針を決める。
