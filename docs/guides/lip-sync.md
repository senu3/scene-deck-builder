# LipSync Guide (RMS-based, Mask Preprocess)

**目的**: AI-Scene-Deck における LipSync のデータ構造、保存、前処理、再生の実装仕様を定義する。  
**適用範囲**: `LipSyncModal`, `PreviewModal`, `metadataStore`, `lipSyncUtils`, `electron/main`。  
**関連ファイル**:  
- `src/components/LipSyncModal.tsx`  
- `src/components/PreviewModal.tsx`  
- `src/components/DetailsPanel.tsx`  
- `src/utils/lipSyncUtils.ts`  
- `src/utils/metadataStore.ts`  
- `src/store/useStore.ts`  
- `electron/main.ts`, `electron/preload.ts`  
- `src/vite-env.d.ts`  
**更新頻度**: 中。  

## Design Principles
- **再生は軽く、登録時に重く**  
  マスク合成は登録時に前処理し、再生中は RMS -> フレーム切替のみを行う。
- **base64 を metadata に永続化しない**  
  画像/マスクは Vault asset に保存し、metadata は `assetId` 参照のみ保持する。
- **既存 LipSync との互換を維持**  
  `compositedFrameAssetIds` が無い場合は `baseImageAssetId + variantAssetIds` にフォールバックする。

## Data Model
`AssetMetadata.lipSync` に設定を格納する。

```ts
type LipSyncSettings = {
  baseImageAssetId: string;         // closed
  variantAssetIds: string[];        // [half1, half2, open]
  maskAssetId?: string;             // Optional mouth mask
  compositedFrameAssetIds?: string[]; // Optional [closed, half1, half2, open]
  ownerAssetId?: string;            // LipSync owner (target assetId)
  ownedGeneratedAssetIds?: string[]; // Current generated bundle (mask/composited)
  orphanedGeneratedAssetIds?: string[]; // Old generated assets from re-register
  rmsSourceAudioAssetId: string;
  thresholds: { t1: number; t2: number; t3: number };
  fps: number;
  sourceVideoAssetId?: string;
  version?: 1 | 2;
};
```

## Asset Handling
- フレーム/マスクは `importDataUrlAsset` で Vault に保存する。
- metadata にはバイナリを持たせない。
- 再生で使うフレーム列は `getLipSyncFrameAssetIds(settings)` で解決する。
  - 優先: `compositedFrameAssetIds`
  - fallback: `[baseImageAssetId, ...variantAssetIds]`

## Bundle Ownership
- LipSync 生成物（mask/composited）は `ownerAssetId` を軸に同一バンドルとして扱う。
- 現在有効な生成物は `ownedGeneratedAssetIds` に保持する。
- 再登録時に前回バンドルとの差分は `orphanedGeneratedAssetIds` に自動移行する。
- 物理保存先は当面 `vault/assets` のまま（論理管理のみ実施）。

## Mask Preprocess (Register Time)
1. `LipSyncModal` で closed/half1/half2/open + mask を用意する。  
2. `maskAssetId` を先に Vault 登録する。  
3. `precompose-lipsync-frames` IPC を呼び、ffmpeg で4フレーム合成する。  
4. IPC が失敗した場合のみ renderer Canvas 合成へフォールバックする。  
5. 合成結果を Vault に保存し、`compositedFrameAssetIds` として metadata に保持する。  

### IPC
- channel: `precompose-lipsync-frames`
- request:
  - `baseImagePath`
  - `frameImagePaths` (closed含む4件)
  - `maskImagePath`
- response:
  - `success`
  - `frameDataUrls?: string[]`
  - `error?: string`

## Edit Behavior
- 再EDIT時は、編集用フレームとして常に `baseImageAssetId + variantAssetIds` を読む。
- `compositedFrameAssetIds` は再生用であり、編集用入力に使わない。
- これにより「マスク二重適用」や「口形状の潰れ」を回避する。
- 再登録時は未変更フレームを既存 asset のまま再利用し、再キャプチャ分のみ更新する。
- 再登録時は `ownerAssetId = target assetId` を維持し、生成物バンドルを更新する。

## Playback
- `PreviewModal` / `DetailsPanel` は `getLipSyncFrameAssetIds` でフレーム列を取得する。
- RMS 変換は `absoluteTimeToRmsIndex` / `rmsValueToVariantIndex` を使用する。
- RMS 不足時は base フレームで継続する。

## Must NOT Do
- `compositedFrameAssetIds` を編集入力として再利用しない。
- base64 を metadata に保存しない。
- 再生ループで Canvas 合成を行わない。

## Related Docs
- `docs/guides/lip-sync-requirements.md`
- `docs/guides/preview.md`
- `docs/guides/media-handling.md`
- `docs/guides/buffer-guide.md`
