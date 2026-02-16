# LipSync Mask Requirements / Design

**目的**: LipSync の「口マスク」機能について、現行実装の調査結果と、実装方針を定義する。  
**適用範囲**: `LipSyncModal`, `MaskPaintModal`, `PreviewModal`, `previewMedia`, `metadataStore`, `vaultGateway`。  
**関連ファイル**:  
- `src/components/LipSyncModal.tsx`  
- `src/components/MaskPaintModal.tsx`  
- `src/components/PreviewModal.tsx`  
- `src/utils/previewMedia.tsx`  
- `src/types/index.ts`  
- `electron/vaultGateway.ts`  
- `docs/guides/lip-sync.md`  
**更新頻度**: 中。  
**ステータス**: 実装反映済み（要件ドキュメントとして維持）。

## 1. 調査結果（As-Is）

### 1.1 既存の LipSync 再生
- 再生時は RMS に応じてフレーム index を切り替える方式。
- `PreviewModal` は `createLipSyncImageMediaSource` を使い、`[closed, half1, half2, open]` の画像を差し替える。
- 切り替えロジックは `absoluteTimeToRmsIndex` + `rmsValueToVariantIndex` に集約されている。

### 1.2 マスク機能の現状
- `MaskPaintModal` は既に存在し、白黒 PNG マスク（8-bit grayscale）を書き出せる。
- `LipSyncModal` では `maskDataUrl` を作成し、Vault asset として保存できる。
- `LipSyncSettings.maskAssetId` は metadata に保存される。
- ただし再生時は `maskAssetId` を参照しておらず、見た目は「フレーム全体差し替え」のまま。

### 1.3 技術的制約とリスク
- マスク編集時は 3 枚 canvas + `ImageData` を保持するため、高解像度でメモリ負荷が高い。
- `LipSyncModal` は capture 画像/マスクを Data URL で保持するため、base64 膨張の影響を受ける。
- 現行 `PreviewModal` は「画像ソース切り替え」前提で、リアルタイム合成をしていない。

## 2. 追加要件（To-Be）

### 2.1 機能要件
- ユーザーは口周辺をマスクとしてペイントできる。
- 再生時は「顔全体は固定、口部分だけが差し替わる」見た目を実現する。
- 再生中に Canvas 合成は行わず、事前生成済みフレーム切り替えのみを行う。
- 既存の RMS -> index 切替モデルは維持する。

### 2.2 非機能要件
- 重い処理は登録時（前処理）に寄せる。
- 再生時の CPU/GPU 負荷とメモリ増加を最小化する。
- 既存 LipSync データ（mask なし）との後方互換を維持する。

## 3. 設計方針

### 3.1 マスクの位置づけ
- マスクは「編集機能」ではなく「前処理入力データ」として扱う。
- 再生に必要なのは最終的に切替可能なフレーム群（完成画像）。

### 3.2 データ保存形式（推奨）
- 画像実体はすべて Vault asset として保存する。
- metadata には asset ID 参照のみを持つ。
- `maskAssetId` は保持し、再編集に使う。
- 新規フィールドとして `compositedFrameAssetIds`（4件）を追加し、再生時はこれを優先。

例:

```ts
type LipSyncSettingsV2 = {
  baseImageAssetId: string;
  variantAssetIds: string[];         // 既存（互換用）
  maskAssetId?: string;              // 再編集用
  compositedFrameAssetIds?: string[]; // [closed, half1, half2, open]
  rmsSourceAudioAssetId: string;
  thresholds: { t1: number; t2: number; t3: number };
  fps: number;
  sourceVideoAssetId?: string;
  version?: 2;
};
```

## 4. 前処理パイプライン設計

### 4.1 入力
- `baseImage`（closed）
- `variants`（half1/half2/open、必要なら closed も含め4枚固定）
- `mask`（grayscale: 0=非表示, 255=表示）

### 4.2 出力
- `compositedFrameAssetIds` 向けの完成フレーム 4 枚。
- 必要に応じてデバッグ用中間生成物は破棄。

### 4.3 合成方式（推奨）
- main process 側で ffmpeg 合成を実行する IPC を追加する。
- 各 variant について `base + (variant × mask)` を生成し、PNG で Vault 取り込みする。
- renderer 側でのピクセル合成は行わない（登録時の UI 表示を除く）。

## 5. 再生時の挙動

### 5.1 ソース選択優先順
1. `compositedFrameAssetIds` があればそれを使用  
2. なければ既存 `baseImageAssetId + variantAssetIds` を使用（互換モード）

### 5.2 再生ロジック
- `PreviewModal` / `previewMedia` の RMS 判定ロジックは変更しない。
- 画像 source 配列を差し替えるだけで動作させる。

## 6. 実装ステップ（推奨）

1. 型拡張  
`LipSyncSettings` に `compositedFrameAssetIds` と `version: 2` を追加。

2. 前処理 API  
`electron/main.ts` + `preload.ts` に「マスク合成フレーム生成」IPCを追加。

3. 登録フロー更新  
`LipSyncModal` 登録時に、mask がある場合のみ前処理を実行して合成済みフレームを保存。

4. 再生フロー更新  
`PreviewModal` で `compositedFrameAssetIds` 優先読み込みに変更。

5. 互換検証  
mask なし既存データ、新旧 version 混在時の再生/保存を確認。

## 7. テスト観点

- `rmsValueToVariantIndex` 既存テストが回帰しないこと。
- mask あり登録で `compositedFrameAssetIds` が保存されること。
- mask なし登録でも従来どおり再生できること。
- `compositedFrameAssetIds` が欠損した場合に base fallback で再生継続すること。

## 8. 未決事項（要決定）

- 前処理解像度
  - 原寸固定にするか、上限（例: 長辺 1920/2048）を設けるか。
- 出力フォーマット
  - PNG 固定か、容量優先で WebP を許可するか。
- マスク資産の運用
  - mask を常に保存するか、合成後に任意で破棄可能にするか。

## 9. 本ガイドの位置づけ

- 本ドキュメントは `docs/guides/lip-sync.md` の補足（要件/設計編）。
- 実装詳細は `docs/guides/lip-sync.md` に反映し、こちらは要件判断の記録として維持する。

## 10. 実装反映メモ

- `compositedFrameAssetIds` を metadata に追加済み。
- 再生は `compositedFrameAssetIds` 優先、無い場合は旧方式にフォールバック。
- 前処理は `precompose-lipsync-frames` (ffmpeg IPC) を優先使用。
- IPC失敗時は renderer Canvas 合成にフォールバック。
- 再EDIT時は元フレーム (`baseImageAssetId + variantAssetIds`) を編集入力として使う。
