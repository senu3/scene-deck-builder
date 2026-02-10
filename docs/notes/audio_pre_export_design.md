# Audio整備 + Export前提仕様（引き継ぎ用）

最終更新: 2026-02-10

## 0. 現在地（実装済み）
- AttachAudio は `AssetMetadata.attachedAudioId` ではなく、`Cut.audioBindings` が主経路。
- `CutAudioBinding.kind` により音声分類を cut 単位で保持できる状態。
- Preview は cut の `audioBindings` を参照して再生する。
- `Cut.useEmbeddedAudio` は実装済み（既定 `true`、未定義も `true` 扱い）。
- DetailsPanel で `Audio from the video:` トグルを編集可能（Video cut のみ表示）。
- `metadata attachedAudio` は互換残骸として型/ユーティリティ/参照列挙に一部残存。
- 互換維持は不要（旧データ非対応で進めてよい）。

---

## 1. 音声データモデル（確定方針）

### 1.1 CutAudioBinding（正）
```ts
type AudioTrackKind = 'voice.lipsync' | 'voice.other' | 'se' | 'embedded';

interface CutAudioBinding {
  id: string;
  audioAssetId: string;
  sourceName?: string;
  offsetSec: number;
  gain?: number;
  enabled: boolean;
  kind: Exclude<AudioTrackKind, 'embedded'>;
}

interface Cut {
  ...
  audioBindings?: CutAudioBinding[];
  useEmbeddedAudio?: boolean; // default true (legacy undefined -> true)
}
```

### 1.2 運用ルール
- AttachAudio は cut 単位で管理する。
- 論理分類は `kind` で固定し、export 側は `kind` だけで振り分ける。
- `embedded` は binding ではなく `Cut.useEmbeddedAudio` で管理する。

---

## 2. `useEmbeddedAudio`（実装済み）

### 2.1 追加先
- `src/types/index.ts`: `Cut.useEmbeddedAudio?: boolean`
- `src/store/useStore.ts`:
  - cut 作成系 (`addCutToScene`, `addLoadingCutToScene`, `pasteCuts`) の初期値
  - 読み込み正規化（`initializeProject`, `loadProject` で `undefined -> true`）
  - 更新 action `setCutUseEmbeddedAudio(sceneId, cutId, enabled)`
- `src/store/commands.ts`:
  - `restoreCutState` で `useEmbeddedAudio` を復元（undo/redo 経路）

### 2.2 デフォルト・保存
- デフォルト: `true`
- 旧データ（`useEmbeddedAudio` 未定義）: `true` として扱う
- 保存先: `project.sdp` の `scenes[].cuts[]`
- autosave: `scenes` 比較に乗るため追加実装不要

### 2.3 UI
- 採用: `DetailsPanel` の cut 詳細にトグル追加（最小改修）
- ラベル: `Audio from the video:`
- アイコン: `Volume2`
- 実装部品: `src/ui/primitives` の `Toggle`
- 表示条件: Video cut のみ
- PreviewModal は再生責務を維持し、設定UIを増やさない

### 2.4 PreviewModal 連動（実装済み）
- `useEmbeddedAudio=false` の cut は、Preview で内蔵音声（video要素側）をミュートする。
- 判定は `globalMuted || !useEmbeddedAudio`。
- 適用対象は Single/Sequence の両モード。
- AttachAudio 側は現状維持（global volume/mute 連動）。

### 2.5 既存データの扱い（確定）
- `useEmbeddedAudio` が未定義の cut は `true` 扱い。
- 保存済み `useEmbeddedAudio=false` はユーザー設定として維持する（自動移行しない）。

---

## 3. ExportPlan / AudioPlan（実装前固定）

### 3.1 成果物
- `video.mp4`（無音）
- `audio_master.wav`（`se` + `voice.other` + `embedded ON`）
- `audio_lipsync.wav`（`voice.lipsync` のみ）
- `media/voice/*`（voice素材コピー）
- `timeline.json`

### 3.2 Plan 概念
- renderer: 純粋関数で `ExportPlan` 生成（秒ベース）
- main: heavy queue で ffmpeg 実行 + copy
- embedded は cut 区間のみ `atrim + adelay + amix` で合成

### 3.3 コピー仕様
- 対象: `audioBindings.kind in {'voice.lipsync','voice.other'}`
- 方式: 再エンコードなしコピー
- 出力名: `<audioAssetId><ext>`
- 同一 `audioAssetId` は重複コピーしない

---

## 4. 未使用 `metadata attachedAudio` 経路の削除計画

### 4.1 削除対象
- 型:
  - `src/types/index.ts`
    - `AssetMetadata.attachedAudioId`
    - `AssetMetadata.attachedAudioSourceName`
    - `AssetMetadata.attachedAudioOffset`
- metadata util:
  - `src/utils/metadataStore.ts`
    - `attachAudio`
    - `detachAudio`
    - `updateAudioOffset`
    - `removeAssetReferences` 内の attachedAudio cleanup
- 参照列挙:
  - `src/utils/assetRefs.ts`
    - `AssetRefKind` の `attached-audio`
    - `collectAssetRefs` の metadata attachedAudio 収集
- テスト:
  - `src/utils/__tests__/metadataStore.test.ts` の attachedAudio 系ケース
  - `src/utils/__tests__/assetRefs.test.ts` の attached-audio 期待値

### 4.2 実施順（推奨）
1. `assetRefs` を cut binding のみ参照に整理し、`attached-audio` 種別を削除  
2. store/UI から metadata attachedAudio 呼び出しが無いことを最終確認  
3. `AssetMetadata` から attachedAudio 3フィールドを削除  
4. `metadataStore.ts` の未使用 API を削除  
5. テストを `CutAudioBinding` 前提へ更新  

### 4.3 影響
- 旧 `.metadata.json` の attachedAudio 情報は読み捨て（問題なし）
- AttachAudio の正経路は `Cut.audioBindings` のみになる

---

## 5. サムネイル仕様メモ（今回確定）
- `sequence-preview` と `details-panel` は分離済み。
- `asset-grid` は Assets Panel 専用プロファイル。
- 詳細は `docs/guides/thumbnail-profiles.md` を正とする。

---

## 6. テスト計画（更新）
1. `Cut.useEmbeddedAudio` の保存/復元（実装済み）
2. `setCutUseEmbeddedAudio` 更新と既定値 `true` の担保（実装済み）
3. DetailsPanel トグルで store/project が更新されること（実装済み）
4. ExportPlan 生成で `kind` ごとの出力分離が正しいこと
5. voice素材コピー列挙（重複除去/命名安定）
6. metadata attachedAudio 削除後の参照列挙回帰（assetRefs）

---

## 7. TODO（次フェーズ）
- AttachAudio の ON/OFF は新しい状態を増やさず `audioBindings[].enabled` を UI で切り替えるだけで実現可能。
- 先に ON/OFF だけ実装し、個別音量（内蔵音声/AttachAudio 分離）は後続フェーズで検討する。
