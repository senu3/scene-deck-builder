# Vault / Asset Guide

**目的**: Vault と asset 管理の不変条件を定義する。
**適用範囲**: `vault/assets`, `.index.json`, `.metadata.json`, `.trash`。
**関連ファイル**: `src/utils/assetPath.ts`, `src/utils/assetRefs.ts`, `src/store/useStore.ts`, `electron/vaultGateway.ts`, `src/components/AssetPanel.tsx`。
**更新頻度**: 中。

## Must / Must Not
- Must: `.index.json` / `.trash/.trash.json` の書き込みは VaultGateway 経由に統一する。
- Must: `assetId -> filename` を `.index.json` に保持し続ける。
- Must: `originalPath` は vault-relative を維持する。
- Must Not: renderer から index/trash を直接書き換えない。
- Must Not: `vault/assets` 内生成物を再コピーして二重登録しない。

> TODO は `docs/TODO_MASTER.md`（`TODO-DEBT-001`）を参照。

This note defines the Vault and asset management rules that ensure recovery. Cut-related flows are included only where they automatically create or register assets.

## Core Goal (Recovery)
JSON + Vault must be enough to restore:
- Story order
- Cut durations
- Adopted assets (which files are used)

## Canonical Asset Rules
- All assets live in `vault/assets/` and are named by hash (e.g. `img_abc123.png`, `vid_abc123.mp4`).
- `assets/.index.json` is the canonical index and must always be updated.
- `assetId -> filename` mapping is always stored in `.index.json` (even for duplicates).
- `originalPath` is vault-relative (relative to vault root), not absolute.
- Naming note: `SourcePanel` (UI state) and file-origin paths must be written separately in docs (`ImportSourcePath` / `OriginPath`).

## `.index.json` (Asset Index)
Each entry stores:
- `id` (assetId)
- `filename` (hash-based name)
- `originalName`
- `originalPath` (vault-relative path)
- `hash`, `type`, `fileSize`, `importedAt`
- `usageRefs`: scene/cut usage for recovery
- `sceneId`, `sceneName`, `sceneOrder`
- `cutId`, `cutOrder`, `cutIndex` (1-based)

## `.metadata.json` (Scene Metadata + Attachments)
Used for information that is not a core asset index:
- Asset metadata (displayTime, analysis, lipSync)
- LipSync links (base/variant/mask/composited/rms/sourceVideo) and bundle ownership
- Scene metadata: name + notes

## Reference Graph (Single Source of Truth)
- Asset references are collected by `collectAssetRefs(scenes, metadataStore)`.
- Reference kinds:
- `cut`
- `cut-audio-binding`
- `lipsync-base`
- `lipsync-variant`
- `lipsync-mask`
- `lipsync-composited`
- `lipsync-rms-audio`
- `lipsync-source-video`
- This graph is shared by:
- Asset usage calculation in `AssetPanel`
- Delete policy blocking checks
- Save-time dangling reference validation

## `.trash/.trash.json` (Trash Log)
When assets are deleted or rehashed:
- The file is moved to `.trash/`
- A record is added to `.trash/.trash.json`:
- `deletedAt`, `assetId`, `originalPath` (vault-relative), `trashRelativePath`
- `originRefs` (scene/cut) and `reason`
- Optional snapshot of the asset index entry
- Retention: items older than the retention period are purged.

## Asset Creation / Registration Paths
All paths must end with `.index.json` being updated via VaultGateway.

### Import Rule: Re-import vs Index-only Registration
- Primary API is `importFileToVault(sourcePath, vaultPath, assetId, existingAsset?)` (`src/utils/assetPath.ts`).
- 判定基準:
- `sourcePath` が `vault/assets` **外**:
- `vaultGateway.importAndRegisterAsset` を使って vault へコピー（hash名化/重複判定）し、`.index.json` を更新。
- `sourcePath` が `vault/assets` **内**:
- ファイルは再コピーせず、`saveAssetIndex` による **index登録のみ** を行う。
- 目的: ffmpeg で `vault/assets` に直接生成した派生ファイルを二重インポートしない。

補足（派生処理）:
- `CutCard` の Add Cut 系（Finalize/Crop）は `createCutFromImport` 経由で asset + cut を作る。
- `AssetPanel` の asset-only 系（Finalize/Reverse/Extract Audio）は asset 登録のみを行い、Cut は作らない。
- いずれも asset登録時の最終判定は上記 `importFileToVault` のルールに従う。

### 1) Cut Creation (Timeline / Drag & Drop)
- External file drop or sidebar asset add:
- Import file into `vault/assets/` (hash name)
- Read metadata + thumbnail
- Create Cut with `assetId`
- Update `.index.json` via VaultGateway

### 2) Attach Audio
- Attaching audio creates or registers an audio asset:
- Audio file is imported into `vault/assets/`
- Cut側 (`Cut.audioBindings`) に attachment link/offset/kind を保存
- `.index.json` stores the audio asset entry via VaultGateway
- Audio assets are attachment-only and do not become cuts on the timeline.

### 3) Video Capture (Frame Capture)
- Captured frames are saved into `vault/assets/` and indexed through `importFileToVault`.
- Since output is already in vault, registration is index-only (no re-copy), then a Cut is created below the source cut.

### 4) Clip Export (Finalize Clip)
- Exported clip is saved to `vault/assets/`, then registered via `importFileToVault`.
- Since output is already in vault, registration is index-only (no re-copy).
- Add Cut flows create a Cut; asset-only flows register only the asset.

### 5) Image Crop (Finalize-equivalent)
- Cropped image output is saved to `vault/assets/`, then registered via `importFileToVault`.
- Since output is already in vault, registration is index-only (no re-copy).
- The resulting asset is indexed and a new Cut is inserted (source cut remains unchanged).
- Crop is launched from Cut context menu (`Crop Image (Add Cut)`), not DetailsPanel.

## VaultGateway (Single Write Entry)
VaultGateway is the only writer for `.index.json` and `.trash/.trash.json`.
Renderer code must call `window.electronAPI.vaultGateway.*` for:
- Import + register (hash naming + index update)
- Index save (ordering + usageRefs update)
- Trash move (trash file + trash index + index removal)

## Delete Policy (Single Entry in Store)
- Asset deletion is executed via `deleteAssetWithPolicy` (`useStore`).
- The policy performs, in order:
- Reference check via `collectAssetRefs` (block when in use)
- Physical move to `.trash` via VaultGateway
- `.index.json` cleanup for deleted `assetId`s
- `.metadata.json` / `assetCache` reference cleanup
- UI components must not directly call `moveToTrashWithMeta` for normal asset deletion.

## Performance Notes
- Hash calculation for vault import uses streaming SHA-256 in the main process (`createReadStream`), not full-file in-memory reads.
- `createCutFromImport` does not refresh all source folders per imported item; bulk drop flows should avoid per-file folder rescans.

## Recovery Priority
1. `project.sdp` for story order and cuts
2. `.index.json` for assetId -> file mapping + usageRefs
3. `.metadata.json` for scene notes/labels and asset metadata (analysis/lipSync/displayTime)
4. `.trash/.trash.json` for audit/history

## Project Load / Save Notes
- Save-time cut asset snapshots keep minimal fields and should include `vaultRelativePath` when available.
- Load flow must treat `.index.json` as fallback source of truth for file path hydration (`assetId -> filename`) when `cut.asset.path` is empty.
- This fallback is required to prevent Sequence video preview from stalling at LoadingVideo after project reload.
- `project.sdp` load 時は、埋め込み `vaultPath` より「実際に開いた project ファイルのディレクトリ」を優先し、不一致時は file-directory を採用する。
- v5 で `resolveCutAsset` が `assetId` 専用になったため、初期 `assetCache` は `cut.asset` snapshot から再構築する（resolver に依存して空キャッシュ化しない）。

## Related Docs
- `docs/references/DOMAIN.md`
- `docs/guides/media-handling.md`
