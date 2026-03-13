# Export Audio Mix Guidelines

**目的**: Export 分離音声（`*.audio.flac`）の時間配置とミックス制約を固定する。
**適用範囲**: `src/utils/exportAudioPlan.ts`, `src/utils/storyTiming.ts`, `electron/main.ts`（`renderMixedAudioTrack`）。
**関連ファイル**: `docs/guides/export.md`, `docs/guides/preview.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: 開始時刻算出は `sceneOrder` + `cut.displayTime` の累積定義を使う。
- Must: Gate 5 parity を維持する経路では、`buildExportAudioPlan` へ渡す cut 列を canonical duration（`resolveCanonicalCutDuration` 系）で正規化済みにする。
- Must: 分離音声は `filter_complex` 1回レンダーで生成する。
- Must: `useEmbeddedAudio=false` は映像由来音声のみを無効化する。
- Must: attachAudio は種別に関わらず canonical timeline 上のイベントとして扱う。
- Must Not: 旧セグメント連結経路（wav concat）を再導入しない。
- Must Not: Preview/Export で別時間定義を持ち込まない。

## 対象
- MP4 export 実行時の分離音声レンダー
- scene/cut の timeline 秒計算と配置
- 映像由来音声 + Cut/Scene/Group attachAudio の同時ミックス

## 基本仕様
- 出力は `<exportBase>.audio.flac`。
- opt-in 時のみ、上記 mixed audio を使って `<exportBase>.master.mp4` を追加生成してよい。
- 音声はセグメント連結ではなく、`ffmpeg -filter_complex` で全体1回レンダー。
- 無音ベースは `anullsrc` を全体尺で混ぜる。
- ミックスは `amix=normalize=0`。
- 仕上げは `aformat=sample_rates=48000:channel_layouts=stereo,alimiter`。

## タイミング定義
- 開始時刻は `sceneOrder` と `cut.displayTime` の累積のみで算出する。
- `buildExportAudioPlan` 自体は `computeStoryTimingsForCuts` を使用し、受け取った `cut.displayTime` をそのまま時間軸へ反映する。
- parity 経路（Preview sequence / export sequence）では、呼び出し側で canonical timing API（`computeCanonicalStoryTimingsForCuts`）を通した displayTime を入力に使う。
- Preview / Export / UI の開始秒は同一定義を使う。

## イベント生成ルール
- 定義実装: `src/utils/exportAudioPlan.ts`。
- AttachAudio 共通:
  - `cut-attach` / `scene-attach` / `group-attach` は canonical timeline 上へ配置する。
  - `useEmbeddedAudio=false` は attachAudio を無効化しない。
  - `VIDEO_HOLD` が canonical timeline を延ばす場合、attachAudio もその延長を含む event 尺で継続する。
  - `VIDEO_HOLD` は embedded video audio の再生有無にのみ影響し、attachAudio を無音化しない。
- VideoAudioEvent:
  - `resolveCutAsset(cut, getAssetById)?.type === 'video'` かつ `cut.useEmbeddedAudio !== false` のときのみ生成。
  - `sourceStartSec` は clip の `inPoint`（なければ 0）。
  - `durationSec` は cut の `displayTime`。
- Cut attachAudio:
  - `cut.audioBindings[].enabled !== false` の音源を全て同時ミックス対象に入れる。
  - `sourceStartSec=0`、`durationSec=cutDuration`。
- Scene attachAudio:
  - `metadataStore.sceneMetadata[sceneId].attachAudio.enabled !== false` のとき生成。
  - `sourceStartSec=0`、`durationSec=sceneDuration`。
- Group attachAudio:
  - `metadataStore.sceneMetadata[sceneId].groupAudioBindings[groupId].enabled !== false` のとき生成。
  - 同一 scene 内の `groupId` 所属 cut 群を 1 つの連続 span として扱い、group ごとに単一 event を生成する。
  - 開始時刻は group 先頭 cut の canonical 開始時刻。
  - `sourceStartSec=0`。
  - `durationSec` は `min(audioAssetDuration, groupSpanDuration)`。
  - group 終端を超えて別 group / 別 scene へはみ出さない。
- `useEmbeddedAudio=false` は「映像由来音声のみ無効化」であり、attachAudio には影響しない。

## main 側レンダー
- 実装: `electron/main.ts` `renderMixedAudioTrack()`。
- 各イベントは以下で配置:
  - `atrim=start=<srcStart>:duration=<dur>`
  - `asetpts=PTS-STARTPTS`
  - `adelay=<dstMs>:all=1`
- 最後に `[base][a0]...[aN]amix=inputs=<N+1>:normalize=0` を適用。
- 入力に音声ストリームが無い場合は、そのイベントをスキップする（個別無音イベントは作らない）。
- Master MP4 を作る場合は、base video を copy しつつ mixed audio を audio codec 付きで mux する。timeline / timing の再計算は行わない。

## Canonical Guard
- `buildExportAudioPlan` の入口は canonical cut（`ExportAudioPlanCut`）を前提とする。
- `canonicalizeCutsForExportAudioPlan(...)` を通して `displayTime` を canonical duration に正規化してから渡す。
- 非canonical入力が混入した場合、`buildExportAudioPlan` は guard 設定に従って `warn/throw` し、回帰検知を行う。

## 関連
- `docs/guides/export.md`
- `src/utils/storyTiming.ts`
- `src/utils/exportAudioPlan.ts`
- `electron/main.ts`
