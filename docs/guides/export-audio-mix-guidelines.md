# Export Audio Mix Guidelines

Export 時の分離音声（`*.audio.flac`）生成仕様を定義する。

## 対象
- MP4 export 実行時の分離音声レンダー
- scene/cut の timeline 秒計算と配置
- 映像由来音声 + Cut/Scene attachAudio の同時ミックス

## 基本仕様
- 出力は `<exportBase>.audio.flac`。
- 音声はセグメント連結ではなく、`ffmpeg -filter_complex` で全体1回レンダー。
- 無音ベースは `anullsrc` を全体尺で混ぜる。
- ミックスは `amix=normalize=0`。
- 仕上げは `aformat=sample_rates=48000:channel_layouts=stereo,alimiter`。

## タイミング定義
- 開始時刻は `sceneOrder` と `cut.displayTime` の累積のみで算出する。
- 共有 util は `src/utils/storyTiming.ts`（`computeStoryTimings` / `computeStoryTimingsForCuts`）。
- Preview / Export / UI の開始秒は同一定義を使う。

## イベント生成ルール
- 定義実装: `src/utils/exportAudioPlan.ts`。
- VideoAudioEvent:
  - `cut.asset.type === 'video'` かつ `cut.useEmbeddedAudio !== false` のときのみ生成。
  - `sourceStartSec` は clip の `inPoint`（なければ 0）。
  - `durationSec` は cut の `displayTime`。
- Cut attachAudio:
  - `cut.audioBindings[].enabled !== false` の音源を全て同時ミックス対象に入れる。
  - `sourceStartSec=0`、`durationSec=cutDuration`。
- Scene attachAudio:
  - `metadataStore.sceneMetadata[sceneId].attachAudio.enabled !== false` のとき生成。
  - `sourceStartSec=0`、`durationSec=sceneDuration`。
- `useEmbeddedAudio=false` は「映像由来音声のみ無効化」であり、attachAudio には影響しない。

## main 側レンダー
- 実装: `electron/main.ts` `renderMixedAudioTrack()`。
- 各イベントは以下で配置:
  - `atrim=start=<srcStart>:duration=<dur>`
  - `asetpts=PTS-STARTPTS`
  - `adelay=<dstMs>:all=1`
- 最後に `[base][a0]...[aN]amix=inputs=<N+1>:normalize=0` を適用。
- 入力に音声ストリームが無い場合は、そのイベントをスキップする（個別無音イベントは作らない）。

## 変更時チェック
1. `useEmbeddedAudio=false` の video cut で映像音声が混ざらないこと。
2. attachAudio（cut/scene）は `useEmbeddedAudio` に関係なく混ざること。
3. 分離音声の総尺が export 対象の totalDuration と一致すること。
4. 旧 `wav` セグメント連結経路を再導入しないこと。

## 関連
- `docs/guides/export-guide.md`
- `src/utils/storyTiming.ts`
- `src/utils/exportAudioPlan.ts`
- `electron/main.ts`
