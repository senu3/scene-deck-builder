# Media Handling Overview

## TL;DR
対象：media I/O と ffmpeg実行境界
正本：media:// 経路と queue 境界
原則：
- 大容量をbase64全量読み込みへ戻さない
- ffmpeg個別spawnを乱立させない
- thumbnail生成入口を単一化する
詳細：サムネイル/監査は implementation を参照

**目的**: media://, ffmpeg, PCM, thumbnail, queue の概要をまとめる。
**適用範囲**: main/renderer のメディア I/O と preview 再生。
**関連ファイル**: `electron/main.ts`, `electron/preload.ts`, `electron/services/ffmpegController.ts`, `electron/services/thumbnailService.ts`, `src/components/PreviewModal.tsx`, `src/features/thumbnails/provider.ts`, `src/utils/videoUtils.ts`, `src/utils/thumbnailCache.ts`, `src/utils/audioUtils.ts`。
**更新頻度**: 中。

## Must / Must Not
- Must: 動画再生は `media://` ストリームを基本経路とする。
- Must: ffmpeg 実行は queue 境界（light/heavy）を守る。
- Must: thumbnail は profile ベースの単一生成入口を維持する。
- Must Not: 大容量メディアを base64 全量読み込みへ戻さない。
- Must Not: ffmpeg 個別spawn を乱立させない。

## 分割方針（運用）
- 現時点では単一ファイルを維持する（参照コスト最小化を優先）。
- 次のいずれかを満たした時点で分割を検討する:
  - 1ファイルで 300 行超かつ、変更が独立セクションに反復している。
  - 同時変更で Preview/I/O/ffmpeg queue の3領域を毎回またぐ。
  - レビューで「責務混在」による差分追跡コストが継続的に発生する。
- 分割候補は `protocol.md` / `ffmpeg-queue.md` / `audio-pcm.md`。
- 追跡タスクは `docs/TODO_MASTER.md`（`TODO-INVEST-004`）で管理する。

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
- Renderer-side provider (`features/thumbnails/provider.ts`) decides IPC usage and fallback.
- Fallback uses renderer-only helpers (`videoUtils`) to avoid direct `electronAPI` dependency in utility layers.
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
- Derive/Extract
- Audio extraction from video is handled in main process via ffmpeg (`extract-audio` IPC, wav).
- AssetPanel/Cut options extraction registers audio as a new asset only (no Cut card creation).
- Offsets
- Per-asset offset is stored in metadata and applied during playback.
- Attached Audio
- Asset attachments are resolved via `.metadata.json` and loaded on asset/cut change.
- Scene attached audio is stored in `sceneMetadata.attachAudio` and resolved in Preview via `resolvePreviewAudioTracks(...)`.
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
- finalize/extract/export concat は共通 runner 経由で heavy queue に統一（stderr制御・出力検証を共通化）。
- Thumbnail generation also has an on-disk cache (tmp) keyed by `path + size + mtime + type + timeOffset + profile`.

## ffmpeg Handler Boundary
- `electron/main.ts` の ffmpeg系 IPC は、共通 runner（`runFfmpegWithResult`）を使って spawn/exit/error/output検証を揃える。
- `finalize-clip` / `extract-audio` / `extract-video-frame` / `export-sequence` concat は共通 runner 経由。
- 新しい ffmpeg IPC を追加する場合は、個別spawnを増やさず、まず共通 runner + queue種別（light/heavy）選択で実装する。

## Related Docs
- `docs/guides/preview.md`
- `docs/guides/implementation/buffer-memory.md`
- `docs/guides/implementation/thumbnail-profiles.md`
