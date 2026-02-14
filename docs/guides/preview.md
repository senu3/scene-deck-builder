# Preview Guide (Single vs Sequence)

**目的**: Preview 再生の構造と変更禁止点を明文化する。
**適用範囲**: `PreviewModal` / 再生コントローラ / MediaSource。
**関連ファイル**: `src/components/PreviewModal.tsx`, `src/utils/previewPlaybackController.ts`, `src/utils/previewMedia.tsx`。
**更新頻度**: 中。

> TODO: UI変更に合わせた文言の更新は必要になりうる。
> 命名方針: public APIは `useSequencePlaybackController`、内部概念名は `SequenceClock` を使う。
> 用語注意: 本ガイドの `MediaSource` は Preview向け app-specific abstraction を指し、Web APIの `MediaSource` とは別。

## Modes

### Single Mode
- Activated when `PreviewModal` receives a single `asset` prop.
- In Storyline, video cut preview is opened via `openVideoPreview(cutId)` and always enters Single Mode.
- If `focusCutId` is missing, Single Mode runs as **asset-only preview** (no cut-bound settings).
- Video: uses direct `<video>` rendering with per-element handlers.
- Image: uses the Sequence playback engine (`useSequencePlaybackController` + `createImageMediaSource`) even in Single Mode.
- Image display time resolves from metadata (`displayTime`) and falls back to `1.0s` (clamped to `>= 0.1s`).
- IN/OUT is stored in local component state (video) or controller range (image/sequence).
- Audio sync uses a dedicated `AudioManager`.
- Video: starts from `video.currentTime` on play/pause changes.
- Image: follows the sequence controller’s absolute time.

### Sequence Mode
- Activated when no single `asset` is provided.
- In Storyline, non-video cut preview (image/lipsync) is opened via `openSequencePreview(cutId)`.
- Builds `PreviewItem[]` from cuts, then drives playback through a controller.
- Uses `useSequencePlaybackController` to unify play/pause/seek/loop/range/buffering state.
- Each cut creates a `MediaSource`.
- Video: `createVideoMediaSource`.
- Image: `createImageMediaSource`.
- Cut changes are triggered by `onEnded` from the current `MediaSource`.

## Resolution Defaults (Export Trigger)
- `Free` resolution is treated as `1280x720` when invoking MP4 export from Preview/App.
- Fixed presets (`FHD/HD/4K/SD`) use their explicit width/height values.

## Preview Media Source Abstraction
`MediaSource` provides a common interface:
- `play()` / `pause()`
- `seek(localTimeSec)`
- `setRate(rate)`
- `getCurrentTime()`
- `dispose()`
- `element` (JSX to render)

Video sources queue play/seek until the element is mounted, avoiding the cut boundary stop issue.

## Audio Sync (Sequence Mode)
- Audio uses `AudioManager.play(absoluteTimeSec)`.
- Absolute time is derived from the controller’s `currentIndex + localProgress`.
- Audio managers are separate for Single and Sequence to prevent cross-mode races.
- Embedded audio (video element) mute is controlled by `globalMuted || !cut.useEmbeddedAudio`.
- Attached audio keeps the current shared control (`globalMuted/globalVolume`) for now.
- Attached audio binding selection priority is deterministic: `voice.lipsync` > `voice.other` > `se` (enabled entries only).
- Scene attached audio is resolved via `resolvePreviewAudioTracks(...)` and takes priority over cut attached audio.
- Single video preview keeps the video render path unchanged and syncs scene audio by `video.currentTime + scenePreviewOffset`.
- Sequence preview syncs scene audio by scene-relative absolute time (`absoluteTime - sceneStartAbs + previewOffsetSec`).

## Focused Cut Fallback
- When `focusCutId` is specified but not found, Preview does not fall back to full-sequence playback.
- Instead it shows an empty state (`Selected cut is no longer available`).

## Timeline Marker Interaction
- Timeline progress bar click always performs seek (it does not move IN/OUT markers even when a marker is focused).
- IN/OUT marker movement is limited to marker drag and frame-step shortcuts when a marker is focused.
- Marker drag end clears focused marker state to avoid accidental marker edits after drop.
- IN/OUT constraints (IN <= OUT, OUT >= IN) are applied in a shared path used by marker drag and focused marker frame-step.
- Keyboard shortcuts are ignored when focus is on editable targets (`input/textarea/select/contentEditable`) or when `ctrl/meta/alt` modifiers are pressed.

## Export Interaction
- Export entry points share a common pre-export pause path so playback stop behavior stays consistent across full export and range export flows.

## Clip Save Behavior
- In Single Mode video preview, saving clip points behaves differently for first-time and existing clips.
- If the target cut is not clipped yet, the source cut is duplicated and clip points are applied to the duplicated cut.
- If the target cut is already clipped, clip points are updated in place on that cut.
- Clip thumbnails are treated as cut-specific. Thumbnail updates during clip save/clear should not mutate shared asset cache thumbnails.

## Buffering / Preload
- Sequence preloads URLs in a time window (`PLAY_SAFE_AHEAD`, `PRELOAD_AHEAD`).
- Initial preload warms the first `INITIAL_PRELOAD_ITEMS`.
- Video URL cache is pruned as the playhead moves (keeps a small rewind window).
- Video URL cache is keyed by **assetId** to prevent mismatched URLs.
- Image preview sources use thumbnail IPC with a sequence-only profile (`sequence-preview`) instead of asset-grid sizing.

## Must NOT Do
- Do not control Sequence Mode playback by directly calling `<video>` methods.
- Do not special-case Single Mode images back to plain `<img>` timers.
- Do not remove the pending play/seek logic in `createVideoMediaSource`.
- Do not reuse or keep old `MediaSource` instances.
- Do not attach Sequence Mode audio to the video element's currentTime events.
- Do not bypass the assetId check when binding video URLs.
- Do not switch Sequence Mode back to blob/base64 video URLs.

## Related Docs
- `docs/guides/media-handling.md`
- `docs/guides/thumbnail-profiles.md`
- `docs/references/DOMAIN.md`
