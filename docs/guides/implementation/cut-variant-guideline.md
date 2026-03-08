# Cut Variant Guideline

## TL;DR
対象：`VIDEO_CLIP` / `VIDEO_HOLD` の定義と時間・音声ルール  
正本：canonical timeline 上の cut variant 合成  
原則：
- Cut Variant は asset を破壊せず timeline 上で合成する
- `VIDEO_CLIP` は source window の変更、`VIDEO_HOLD` は末尾延長の追加
- Preview / Export は同じ variant 解釈を共有する

**目的**: Cut Variant の意味と、Preview / Export / store 実装で守るべき境界を固定する。  
**適用範囲**: `Cut` の clip 属性、cut runtime hold 属性、SequencePlan / Preview / Export の variant 解釈。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/export.md`, `docs/guides/implementation/export-audio-mix.md`, `docs/DECISIONS/ADR-0002-preview-export-parity.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Cut Variant は asset 非破壊で表現する。
- Must: canonical timeline は variant 適用後の再生尺を正本とする。
- Must: `VIDEO_CLIP` は source time の切り出しであり、timeline 追加ではない。
- Must: `VIDEO_HOLD` は cut 末尾に追加される延長として扱う。
- Must: Preview / Export は同じ variant 解釈を共有する。
- Must: embedded video audio は hold 区間で再生しない。
- Must: Sequence Preview の clip / hold 再生 spec は SequencePlan 由来の値を正本とする。
- Must Not: Hold を派生 mp4 生成で実装しない。
- Must Not: Preview / Export で variant ごとに別時間定義を持たない。
- Must Not: store / UI で variant ごとの ad-hoc 時間補正を持ち込まない。

## 用語
- Cut Variant:
  - cut の再生解釈を変える派生ルール。
  - asset 自体は変更しない。
- Source Time:
  - 元 media 上の時間。
- Cut Time:
  - cut 本体の再生時間。
- Canonical Timeline:
  - Preview / Export / AudioPlan が共有する最終時間軸。

## Variant 定義
### `VIDEO_CLIP`
- 定義:
  - `inPoint / outPoint` により source window を切り出す variant。
- 意味:
  - cut の再生尺は `outPoint - inPoint` を canonical とする。
  - `displayTime` は clip 時に正本にならない。
- 音声:
  - embedded video audio は clip window に従う。
  - attach audio の扱いは `docs/guides/implementation/export-audio-mix.md` を正本とする。

### `VIDEO_HOLD`
- 定義:
  - cut 本体の末尾に、静止した末尾フレーム再生区間を追加する variant。
- 意味:
  - hold は cut 本体を伸ばすのではなく、末尾に追加される延長として扱う。
  - canonical timeline には hold duration を加える。
  - hold の基準フレームは clip が有効なら clip 後端、そうでなければ元 cut 後端。
- 音声:
  - embedded video audio は hold 区間では無音。
  - attach audio の扱いは `docs/guides/implementation/export-audio-mix.md` を正本とする。

## 関連
- `docs/guides/preview.md`
- `docs/guides/export.md`
- `docs/guides/implementation/export-audio-mix.md`
