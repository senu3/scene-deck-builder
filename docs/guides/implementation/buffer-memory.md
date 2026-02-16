# Buffer / Memory Guide (可視化→分類→対策)

**目的**: Buffer/ArrayBuffer まわりの生成・保持・解放点を棚卸しする。
**適用範囲**: main/renderer のバッファ・キャッシュ。
**関連ファイル**: `electron/main.ts`, `electron/vaultGateway.ts`, `src/utils/thumbnailCache.ts`, `src/utils/audioUtils.ts`, `src/components/PreviewModal.tsx`。
**更新頻度**: 低。

## Must / Must Not
- Must: 大容量処理は stream/queue 前提で設計する。
- Must: キャッシュは上限（件数/バイト）を持たせる。
- Must: バッファ保持の生成点・解放点を追跡可能に保つ。
- Must Not: base64 全量保持経路を安易に増やさない。
- Must Not: ffmpeg 出力の無制限バッファリングを導入しない。

> TODO は `docs/TODO_MASTER.md`（`TODO-DEBT-004`）を参照。

このドキュメントは、バッファ（Buffer/ArrayBuffer/Uint8Array/ImageData/Blob/Canvas backing store）の生成・保持・解放点を棚卸しし、リーク/膨張パターンを点検したものです。
検索キー: `Buffer` / `ArrayBuffer` / `Uint8Array` / `ImageData` / `createImageBitmap` / `URL.createObjectURL` / `stream`

---

## 可視化（生成・保持・解放の一覧）

### バッファ一覧（サイズ推定 + 寿命）

| 区分 | 生成点 (ファイル) | バッファ種別 | サイズ推定 | 保持場所 / 寿命 | 解放・クリア点 |
| --- | --- | --- | --- | --- | --- |
| Media protocol (stream) | `electron/main.ts` | ReadableStream (Range対応) | チャンク単位 | リクエスト処理中のみ | レスポンス完了で自然解放 |
| Read file → base64 | `electron/main.ts` | Node `Buffer` → base64 string | Buffer=ファイルサイズ / base64≈4/3倍 | 主に legacy 経路で返却 | GC（State/Cacheから消えたタイミング） |
| Read audio file | `electron/main.ts` | Node `Buffer` | ファイルサイズ | IPC返却の一時 | GC（参照解放） |
| Decode audio (PCM) | `electron/main.ts` | `Buffer[]` → `Buffer.concat` | PCM = duration * sampleRate * channels * 2 bytes | IPC返却の一時（戻り値で保持） | GC（参照解放） |
| Image metadata | `electron/main.ts` | Node `Buffer` | ファイルサイズ | 関数内ローカル | GC |
| Thumbnail (ffmpeg unified) | `electron/services/thumbnailService.ts` | ffmpeg出力JPEG + Node `Buffer` → base64 | 縮小JPEGサイズ / base64≈4/3倍 | tmpキャッシュ + Rendererへ返却 | tmpキャッシュ削除/上書き + GC |
| Vault import hashing | `electron/vaultGateway.ts` | Node `Buffer` | ファイルサイズ | 関数内ローカル | GC |
| Audio PCM → WebAudio | `src/utils/audioUtils.ts` | `Uint8Array` → `AudioBuffer` | PCM bytes + AudioBuffer = duration * sampleRate * channels * 4 bytes (Float32) | `AudioManager.audioBuffer` に保持 | `unload()` / `dispose()` で `audioBuffer=null` |
| RMS analysis | `src/utils/audioUtils.ts` | `Uint8Array` + `number[]` | PCM bytes + rms array (fps * duration) | `AudioAnalysis` を metadata JSON に保持 | metadata更新/削除で消える |
| Video thumbnail (renderer fallback) | `src/utils/videoUtils.ts` | `HTMLCanvasElement` backing store + base64 | Canvas=width*height*4 bytes / base64≈4/3倍 | sharedCanvas はモジュール内で常駐 | sharedCanvas は使い回し（明示解放なし） |
| Preview video cache | `src/components/PreviewModal.tsx` | URL文字列 + Set/Map | 文字列サイズ | `useRef(Map/Set)` に保持 | `cleanupOldUrls()` / unmount で clear |
| Preview image data | `src/components/PreviewModal.tsx` | base64 data URL | base64≈4/3倍 | `useState(singleModeImageData)` / `items[].thumbnail` | component lifecycle |
| Asset cache | `src/store/useStore.ts` | `Map<string, Asset>` (thumbnail含む) | thumbnail base64 + metadata | グローバルストア | `clearProject()` 等で更新（明示上限なし） |
| Thumbnail cache (LRU) | `src/utils/thumbnailCache.ts` | `Map<string, { data, bytes }>` (base64) | base64≈4/3倍 | module-level LRU | `clearThumbnailCache()` / LRU eviction |
| Cut/Details thumbnails | `src/components/CutCard.tsx`, `CutGroupCard.tsx`, `DetailsPanel.tsx` | base64 data URL | base64≈4/3倍 | 各コンポーネント state | component lifecycle |
| LipSync frames | `src/components/LipSyncModal.tsx` | base64 data URL | base64≈4/3倍 | `frames` state / `maskDataUrl` | component lifecycle |
| MaskPaint canvases | `src/components/MaskPaintModal.tsx` | Canvas backing store (3枚) | 3 * width * height * 4 bytes | refsに保持 | component lifecycle |
| MaskPaint undo/redo | `src/components/MaskPaintModal.tsx` | `ImageData` | width * height * 4 bytes / entry | `useState(undoState/redoState)` | 1段階のみ。上書きで解放 |
| Mask export | `src/components/MaskPaintModal.tsx` | `ImageData` + base64 | ImageData + base64≈4/3倍 | 一時生成 | GC（関数終了） |
| LipSync frame capture | `src/components/LipSyncModal.tsx` | Canvas backing store + base64 | width * height * 4 bytes / base64≈4/3倍 | base64は `frames` に保持 | component lifecycle |

※ base64文字列はJS内ではUTF-16で保持されるため、実メモリは **バイト数 × 約2**（目安）。

---

## 分類（バッファ種別ごとの現状）

### 1) Buffer / ArrayBuffer / Uint8Array
- Node Buffer（mainプロセス）
- `read-file-as-base64`(legacy), `read-audio-file`, `read-audio-pcm`, `read-image-metadata`, `generate-thumbnail`, `vaultGateway` のハッシュ計算などで Buffer 生成が発生。
- Renderer Uint8Array
- `readAudioPcm` の戻りを `Uint8Array` 化し `AudioBuffer` を生成。
- `analyzeAudioRms` でも PCM を `Uint8Array` として保持し、RMS配列を生成。

### 2) ImageData / Canvas backing store
- `MaskPaintModal` で **3枚キャンバス**を常時保持。
- `ImageData` は **Undo/Redo 1段**だけ保持する設計（メモリ制限あり）。
- `videoUtils` の **sharedCanvas** はモジュール全体で使い回し（寿命はアプリ全体）。

### 3) Base64 / data URL
- `generate-thumbnail` の結果（縮小済み base64）が多数のコンポーネントに保持される。
- Asset cache / thumbnail cache と UI state の両方に入るため、重複保持が起きやすい。

### 4) Stream
- `media://` は fs.createReadStream → ReadableStream で Range 対応。
- 大きなファイルでも **全量読み込みせずストリーミング**できる設計。

### 5) createImageBitmap / URL.createObjectURL / Blob
- `createImageBitmap` の使用は **なし**。
- `URL.createObjectURL` の使用は **なし**（`revokeIfBlob` は将来用）。
- `Blob` の生成は **なし**。

---

## キャッシュ / State 抽出（キー検索結果）

### Map / useRef / useState での保持
- `src/components/PreviewModal.tsx`
- `videoUrlCacheRef: Map<assetId, url>`
- `readyItemsRef: Set<assetId>`
- `preloadingRef: Set<assetId>`
- `singleModeImageData` / `videoObjectUrl`
- `src/utils/thumbnailCache.ts`
- `cache: Map<key, { data, bytes }>`（LRU / module-level）
- `inFlight: Map<key, Promise>`（同一取得の重複抑制）
- `src/store/useStore.ts`
- `assetCache: Map<assetId, Asset>`（thumbnail含む）
- `src/components/LipSyncModal.tsx`
- `frames` / `maskDataUrl`（base64）
- `src/components/MaskPaintModal.tsx`
- `undoState` / `redoState`（ImageData）

※ サムネイル取得は `getThumbnail()` に集約（単一入口）。LRUは「総バイト + 件数」の二重ガード。

---

## 対策（リーク/膨張パターンの点検と対応案）

### 1) URL.createObjectURL の revoke 漏れ
- 該当なし。
- `revokeIfBlob` は将来用で、現在は `media://` URL のため実質 noop。

### 2) イベント解除漏れ
- 重大な漏れは見当たらない。
- ほとんどの `addEventListener` が `useEffect` cleanup で解除されている。
- `window.addEventListener('beforeunload'...)` はアプリ終了時の解放目的で常駐設計。

### 3) 無制限キャッシュ
- 該当
- `assetCache`（全 Asset を保持）
- 対応済み
- サムネイルは `thumbnailCache` で LRU + 総バイト上限 + 件数上限。
- `initializeProject` / `clearProject` で `clearThumbnailCache()` 実行。
- 環境設定モーダルで上限値を変更可能（`EnvironmentSettingsModal`）。

### 4) base64 保持（data URL の膨張）
- 該当あり。
- `PreviewModal` / `CutCard` / `CutGroupCard` / `DetailsPanel` / `AssetPanel` / `Sidebar` / `LipSyncModal`
- 対策案。
- サムネイルは ffmpeg 縮小 + tmpディスクキャッシュを維持する。
- 大きい画像は base64 ではなく `media://` or Blob URL を検討。
- base64 を使う場合は縮小済みサムネイルに限定。

### 5) ffmpeg stdout/stderr の溜め込み
- 該当あり。
- `read-audio-pcm`（stdout → Buffer[] 全量保持）
- `finalize-clip` / `export-sequence` / `extract-video-frame`（stderr を文字列で全量保持）
- 対策（実装済み）。
- `stderr` は末尾 128KB のリングバッファで保持。
- `read-audio-pcm`（PCM）は上限で超過時は拒否。

---

## 追加メモ

- `media://` はストリーミング前提なので、基本はフルバッファ化を避けられる。
- 音声は PCM + AudioBuffer の二重保持が起きるため、長尺ではメモリが急増しやすい。
- サムネイルは単一入口（getThumbnail）+ LRU に統一。
