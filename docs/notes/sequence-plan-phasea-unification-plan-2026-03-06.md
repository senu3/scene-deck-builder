# SequencePlan Phase A Unification Plan (2026-03-06)

## TL;DR
- VIDEO HOLD 導入前に、Preview/Export の時間解決入口を `buildSequencePlan` へ寄せる。
- まずは LIPSync を対象外にして、`normal/clip/hold/mute/black` を Plan で表現できる状態を先に閉じる。
- LIPSync は SequencePlan の上に載せる拡張フェーズ（Phase B）として分離する。

## Update 2026-03-07 (Phase A-0)
- SequencePlan の公開入口を `buildSequencePlan(project, opts)` に統一した。
- Preview/Export は `target.kind='cuts'` を含む `opts` 経由で同一入口を利用する。
- VIDEO HOLD 本実装前の受け皿として `CutRuntimeState.hold` を追加した（挙動未接続）。

## Update 2026-03-08 (Temporary Persistence Exception)
- VIDEO HOLD は `CutRuntimeState.hold` に置かれているが、現時点では **project 保存対象の例外** として扱う。
- 実装上は `cutRuntimeById` 全体を永続化せず、`hold` のみを抽出して保存/復元する。
- `isLoading` / `clipRevision` など他の runtime 値は非永続のまま維持する。
- これは仮実装フェーズでの暫定対応であり、最終的には永続前提の専用フィールドへ移設する。

### 将来の移設候補（案）
- `Cut.hold`
- `cutDerivedById`
- `project.videoHoldByCutId`

### 注意点（方針上のリスク）
- runtime と永続の責務が一時的に混在するため、境界がにじみやすい。
- 混在を広げないため、例外は `hold` のみに限定し、他 runtime 値の永続化を追加しない。
- 移設時は旧 `cutRuntimeById.hold` 互換を残さず、永続前提の新フィールドへ切り替える。

## 目的
- Preview/Export parity を「同じ SequencePlan 消費」で担保する。
- VIDEO HOLD（末尾 duration 拡張）を asset 非破壊で実装できる土台を先に作る。

## 適用範囲
- 対象:
  - `buildSequencePlan(project, opts) -> SequencePlan` の薄い入口追加
  - Preview/Export の共通入口化（Phase A で最低限）
  - `normal/clip/hold/mute/black` の item 構築
- 非対象:
  - LIPSync v2 の本実装
  - 音声解析キャッシュ最適化
  - sourceTime 離散切替の高度最適化

## Must / Must Not
- Must: SequencePlan の責務を「cut から canonical な再生区間を組み立てる」に限定する。
- Must: Preview/Export は同じ `buildSequencePlan` を入口として使う。
- Must: Plan 生成は純粋関数で副作用を持たない。
- Must: Hold/CLIP/mute/黒カットを Plan だけで表現できるようにする。
- Must Not: LIPSync 未確定仕様を SequencePlan の中核へ埋め込まない。
- Must Not: LIPSync 対応を見越した過剰抽象化を先回りで導入しない。

## 方針
### 1) SequencePlan を先に閉じる（LIPSync 除外）
- 対象:
  - 通常 cut
  - CLIP
  - VIDEO HOLD
  - mute
  - 真っ黒カット
  - 基本的な audio/video item 構築
  - Preview/Export の同一入口化
- Done 条件:
  - Preview と Export が同じ Plan 入口を使う
  - Hold/CLIP/mute/黒カットが Plan で表現できる
  - asset 非破壊で時間解決できる

### 2) LIPSync は SequencePlan 上の拡張として分離
- Phase A 完了後に別フェーズで扱う。
- 候補:
  - Plan 生成前段で口形候補を解決
  - Plan 生成中に `time remap / frame select` を差し込む

## この分け方の理由
- Done 条件が曖昧にならない。
- LIPSync 側の設計自由度（前段解決/Resolver/専用 item 派生）を残せる。

## 先に固定する最小拡張点
1. `VideoItem.kind` または `VideoItem.flags`
- `normal`
- `hold`
- `black`
- 将来 `lipsync`

2. source mapping を差し込める構造
- 基本は `srcIn/srcOut` で開始し、将来の固定フレーム参照や離散切替に拡張可能な余地を残す。

3. `plan warnings`
- `lipsync-not-supported` や `fallback-applied` などを将来出せる拡張口を残す。

## フェーズ定義
### Phase A（先に Done）
- normal cut
- clip in/out
- video hold
- mute
- black cut
- preview/export 共通入口

### Phase B（後で拡張）
- LIPSync v2
- 音声解析キャッシュ接続
- sourceTime 切替最適化
- 必要なら専用 item 追加

## SequencePlan Done（LIPSync 除く）
- Preview/Export が同じ `buildSequencePlan` を入口として使う。
- cut/clip/hold/mute/black を Plan だけで表現できる。
- Plan 生成は純粋関数で副作用を持たない。
- 既存 LIPSync は Plan 外の暫定経路でもよい。
- 将来の LIPSync 拡張を妨げない最小拡張点がある。

## 実務メモ
- 完全な SequencePlan 全体設計は VIDEO HOLD 導入後に確定する。
- 現時点は「入口統一」と「Phase A の Done 条件固定」を優先する。
