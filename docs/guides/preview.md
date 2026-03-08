# Preview Guide (Single vs Sequence)

## TL;DR
対象：Sequence Previewの再生制御
正本：cut canonical timing
原則：
- Sequence再生制御は単一コントローラ経由
- Preview操作は command 単一入口経由
- 時間正本は canonical cut timing
詳細：再生実装は preview系実装を参照

**目的**: Preview 再生の責務境界と変更禁止点を固定する。  
**適用範囲**: `PreviewModal` / 再生コントローラ / Preview media source。  
**関連ファイル**: `docs/guides/export.md`, `docs/guides/media-handling.md`, `docs/guides/implementation/thumbnail-profiles.md`, `docs/guides/implementation/debug-overlay.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Sequence 再生は `useSequencePlaybackController` を単一制御面として使う。
- Must: Preview 操作（play/pause/seek/step/skip/in/out/loop/mute/marker）は `usePreviewInteractionCommands` を単一入口として通す。
- Must: timing 解決は domain 正規化後の canonical cut timing を正本とする。
- Must: Sequence consumer は `buildSequencePlan(project, opts)` を公開入口として使う。
- Must: `sequenceCuts` 指定時はその範囲のみで sequence を構築する。
- Must: `PreviewModal.tsx` は Composition Root とし、配線（hook 呼び出し＋View props 組み立て）に限定する。
- Must: Debug Overlay は Preview の時間正本を変更しない。
- Must Not: Preview/Export で時間定義を分岐させない（ad-hoc タイマー含む）。
- Must Not: Preview consumer が `buildSequenceItemsForCuts` / `buildSequenceItemsForExport` を直接公開入口として使わない。
- Must Not: Sequence Mode を `<video>` 直接制御へ戻さない。
- Must Not: Controller はドメイン構造を書き換えない。

## モード境界
- Single Mode:
  - 単一 asset（または単一 cut）の確認に使う。
  - clip-local な IN/OUT 調整を許可する。
- Sequence Mode:
  - cut 列の連続再生を行う。
  - play/pause/seek/loop/range/buffering をコントローラで一元管理する。

## 時間・音声の原則
- 表示時間は cut canonical timing を正本とする。
- AudioPlan/再生同期は cut 列由来の時間軸で扱う。
- focus cut 不在時は曖昧なフォールバック再生を行わず、欠落状態を明示する。

## 責務境界
- 操作入口（Commands）:
  - 対象は play/pause/seek/step/skip、IN/OUT、loop/mute/marker。
  - progress bar click/drag や marker drag による seek も command 入口で処理する。
  - 表示整形、DOM 計測、fullscreen/overlay など純UI状態は command 対象外。
- 時間の正本（Timebase）:
  - 正本は domain 正規化後の canonical cut timing とし、Preview 側の独自再計算や Preview/Export の時間定義分岐を禁止する。
- IN/OUT（Clip Range）:
  - 更新入力は playhead、基準は canonical timing。
  - clamp/normalize/swap/reject は `clipRangeOps` の純関数に集約し、`PreviewModal.tsx` に戻さない。
  - clip 保存/clear 後のサムネイル更新は command 外の非同期 queue（`features/cut`）で追随させる。
- 表示（View）:
  - UI playhead time の丸め/fps/表示単位は View 側の純関数で完結し、controller/domain に混ぜない。
## Export連携
- Preview 起点 export は Export ガイドの正本ルールに従う。
- Preview 側で独自の export 時間定義を持たない。
- SequencePlan 入口は `buildSequencePlan(project, opts)` を使用し、`opts.target` で対象 cut 範囲を指定する。
- `buildSequenceItemsForCuts` / `buildSequenceItemsForExport` は lower-level helper として扱い、Preview の主要 consumer から直接呼ばない。

## Debug Overlay Boundary
- Debug Overlay の仕様は `docs/guides/implementation/debug-overlay.md` に従う。
- Preview の時間正本・ドメイン構造に干渉してはならない。

## 運用メモ
- UI文言の未確定事項は `docs/TODO_MASTER.md` で管理する。
- 実装手順・性能調整・既知事象は `docs/notes/` へ分離する。

## 関連ガイド
- Export正本: `docs/guides/export.md`
- Media I/O: `docs/guides/media-handling.md`
