# Sequence Preview: 同一ソース連続Clip切替のバッファ表示 TODO

## 背景
- SequenceMode で同一動画ソースから作成した Clip が連続すると、先頭 Clip 終了時に再生が止まる不具合があった。
- 2026-02-14 の修正で「停止せず次 Clip へ進む」挙動は回復済み。

## 実装済み修正
- `src/components/PreviewModal.tsx`
  - Sequence動画ソースの key を URL 固定から `cut.id + url + in/out` を含む一意キーに変更。
- `src/utils/previewMedia.tsx`
  - 再利用された `<video>` が metadata 済みの場合、`onLoadedMetadata` を待たず初期化するフォールバックを追加。

## 残課題 (TODO)
- 同一ソース連続 Clip の境界切替で、短時間の buffering/loading 表示が入る場合がある。
- これは Preview の体感品質課題であり、Export の出力内容・並び・尺には影響しない。

## 影響範囲
- 影響あり: `PreviewModal` の SequenceMode UX（切替時の見え方）。
- 影響なし: `buildSequenceItemsForCuts` / `buildSequenceItemsForExport` を含む Export 経路。

