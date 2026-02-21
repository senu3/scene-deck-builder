# Preview Guide (Single vs Sequence)

## TL;DR
対象：Sequence Previewの再生制御
正本：cut canonical timing
原則：
- 再生制御は単一コントローラ経由
- 表示と出力で時間正本を分離しない
- assetIdベースの解決整合を維持する
詳細：再生実装は preview系実装を参照

**目的**: Preview 再生の責務境界と変更禁止点を固定する。  
**適用範囲**: `PreviewModal` / 再生コントローラ / Preview media source。  
**関連ファイル**: `docs/guides/export.md`, `docs/guides/media-handling.md`, `docs/guides/implementation/thumbnail-profiles.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Sequence 再生は `useSequencePlaybackController` を単一制御面として使う。
- Must: `sequenceCuts` 指定時はその範囲のみで sequence を構築する。
- Must: timing 解決は canonical cut timing を使う。
- Must: canonical timing は domain 正規化後の値を使用する。
- Must: URL/asset 解決は `assetId` 整合を維持する。
- Must: Preview は独自の時間再計算を持たない。
- Must Not: Sequence Mode を `<video>` 直接制御へ戻さない。
- Must Not: 画像 Sequence の時間制御を ad-hoc タイマーへ戻さない。
- Must Not: Preview/Export で時間定義を分岐させない。
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

## Export連携
- Preview 起点 export は Export ガイドの正本ルールに従う。
- Preview 側で独自の export 時間定義を持たない。

## 運用メモ
- UI文言の未確定事項は `docs/TODO_MASTER.md` で管理する。
- 実装手順・性能調整・既知事象は `docs/notes/` へ分離する。

## 関連ガイド
- Export正本: `docs/guides/export.md`
- Media I/O: `docs/guides/media-handling.md`
