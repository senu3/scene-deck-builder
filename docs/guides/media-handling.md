# Media Handling Overview

**目的**: media://, ffmpeg, PCM, thumbnail, queue の概要をまとめる。
**適用範囲**: main/renderer のメディア I/O と preview 再生。
**関連ファイル**: `electron/main.ts`, `electron/preload.ts`, `electron/services/ffmpegController.ts`, `electron/services/thumbnailService.ts`, `src/components/PreviewModal.tsx`, `src/utils/videoUtils.ts`, `src/utils/thumbnailCache.ts`, `src/utils/audioUtils.ts`。
**更新頻度**: 中。

> 仮: 実装は進行中のため、詳細はコード参照が正。
> 用語注意: 本ガイドの `MediaSource` は Preview向け app-specific abstraction を指し、Web APIの `MediaSource` とは別。

## Video
- Playback
- Video elements use `media://` protocol URLs (streamed with Range support).
- Avoids base64/Blob loading of full files into memory.
- Sequence preview uses a MediaSource abstraction (`createVideoMediaSource`) instead of direct `<video>` control.
- The media protocol tolerates invalid Range requests by returning a minimal response (prevents noisy 416 logs).
- Metadata
- Video metadata (duration/width/height) is read in the main process via ffmpeg (`get-video-metadata` IPC).
- Renderer falls back to shared `<video>` element if needed.
- Thumbnails
- Generated in the main process via ffmpeg (`generate-thumbnail` IPC).
- Both image/video thumbnails use the same ffmpeg path and profile-based resizing (`timeline-card`, `asset-grid`, `sequence-preview`, `details-panel`).
- Returned to renderer as small JPEG base64 data URLs.
- `generate-video-thumbnail` remains as a backward-compatible alias for video-only callers.
- Renderer falls back to shared `<video>` + canvas only when the new IPC path is unavailable.
- Caching
- Preview caches video URLs by assetId and releases old entries as the preview window moves.
- Sequence buffer checks use a play safe ahead window to avoid cut-boundary stalls.

## Preview Playback (Single vs Sequence)
- Single Mode
- Uses the `<video>`/`<img>` elements directly with per-mode handlers.
- Images still run through the Sequence playback engine for timing consistency.
- IN/OUT is stored in local component state (video) or controller range (image).
- Sequence Mode
- Uses `useSequencePlaybackController` to unify play/pause/seek/loop/range.
- Media sources are created per cut (`createVideoMediaSource` / `createImageMediaSource`).
- Image cuts are driven by a synthetic clock (setInterval) to match video-like playback.
- Audio playback is aligned by absolute sequence time.

## Audio
- Decode/Playback
- Audio is decoded in the main process via ffmpeg to PCM s16le (`read-audio-pcm` IPC).
- Renderer builds `AudioBuffer` directly from PCM (no `decodeAudioData`).
- Single and Sequence preview use separate AudioManager instances.
- Offsets
- Per-asset offset is stored in metadata and applied during playback.
- Attached Audio
- Asset attachments are resolved via `.metadata.json` and loaded on asset/cut change.
- RMS Analysis
- RMS is computed from PCM at 60 fps and stored in metadata (JSON array).
- Stored under the audio asset's metadata entry for reuse.

## Metadata Store
- Stored in `.metadata.json` at vault root.
- Keyed by assetId.
- Scene notes and labels are also persisted under `sceneMetadata`.

## Vault Gateway (Index/Trash Writes)
- Asset import/registration and trash moves update `.index.json` / `.trash.json` via VaultGateway.
- Renderer-side media flows should call `window.electronAPI.vaultGateway.*` for write operations.

## ffmpeg Work Queue
- Light queue (concurrency 2): metadata, thumbnail, PCM decode.
- Heavy queue (concurrency 1): export/clip/frame operations.
- Thumbnail generation also has an on-disk cache (tmp) keyed by `path + size + mtime + type + timeOffset + profile`.

## Related Docs
- `docs/guides/preview.md`
- `docs/guides/buffer-guide.md`
- `docs/guides/thumbnail-profiles.md`
