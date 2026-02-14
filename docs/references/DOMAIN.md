# Domain Glossary

**目的**: コア用語と境界を定義する正本。
**適用範囲**: データモデル/主要UI/保存対象。
**関連ファイル**: `src/types/index.ts`, `src/components/*`, `src/store/useStore.ts`。
**更新頻度**: 中。

> 注意: 本書は用語の正本です。重複説明は最小にし、他ドキュメントは本書を参照します。

## Naming Conventions

- 軸の命名は次で固定する:
  - 編集軸: `StoryTimeline`
  - 再生軸: public `useSequencePlaybackController` / internal `SequenceClock`
  - 出力軸:
    - 実行計画: `ExportPlan` / `Mp4ExportPlan` / `AviUtlExportPlan`
    - 計画解決: `resolveExportPlan`
    - 出力シーケンス: `ExportSequenceItem` / `buildSequenceItemsForExport`
    - 実行境界(IPC): `window.electronAPI.exportSequence`
- `MediaSource` は Web API 名と衝突しやすいため、docsでは「Preview向けの app-specific abstraction」を明記する。
- `source` は文脈ごとに分離する:
  - UI状態: `SourcePanel`
  - ファイル由来パス: `ImportSourcePath`（または `OriginPath`）

## High-Risk Term Disambiguation

- `Scene` / `Storyline` / `StoryTimeline`
  - `Scene`: データモデル単位
  - `Storyline`: 編集UI
  - `StoryTimeline`: 編集軸の概念名
- `Preview` / `PreviewModal` / `PreviewMode`
  - `Preview`: 機能ドメイン名（再生機能）
  - `PreviewModal`: 画面コンポーネント名
  - `PreviewMode`: 状態値（`scene` / `all`）
- `Metadata Store` / `AssetMetadata` / `SceneMetadata`
  - `Metadata Store`: `.metadata.json` 全体
  - `AssetMetadata` / `SceneMetadata`: エントリ型
- `Asset Index` / `Asset Reference Graph`
  - `Asset Index`: 永続インデックス（`assets/.index.json`）
  - `Asset Reference Graph`: 実行時に計算される参照集合
- `Controller`
  - 編集文脈は `DragController`、再生文脈は `PlaybackController` / `SequenceClock` を優先する。

## Core Data Model

| 用語 | 定義 | 境界（含む / 含まない） | 主要操作 | 関連TS型 / ファイル |
| --- | --- | --- | --- | --- |
| **プロジェクト** | `Project` は `id/name/vaultPath/scenes/sceneOrder/createdAt/updatedAt/version/sourcePanel` を持つ永続ルート。 | **含む:** vaultPath と scenes。**含まない:** UI状態（選択/再生）は `AppState` 側。 | **作成/保存/読み込み:** StartupModal → project.sdp。 | `Project`（`src/types/index.ts`）、`StartupModal.tsx` |
| **シーン** | `Scene` は `id/name/cuts/notes/folderPath/groups` を持つ編集単位。表示順は `sceneOrder: sceneId[]` を正とする。 | **含む:** cuts と notes。**含まない:** vaultPath。 | **追加/削除/名称変更/並び替え:** `addScene/removeScene/renameScene/reorderScenes`。 | `Scene`、`Storyline.tsx` |
| **シーンノート** | `SceneNote` はシーン内のメモ（text/image）を表す。 | **含む:** notes 配列。**含まない:** asset 本体。 | **追加/更新/削除:** `addSceneNote/updateSceneNote/removeSceneNote`。 | `SceneNote`、`DetailsPanel.tsx` |
| **カット** | `Cut` は `assetId/asset/displayTime/order/inPoint/outPoint/isClip/useEmbeddedAudio/audioBindings` を持つ再生単位。 | **含む:** clip(in/out)・loading 状態・cut単位の音声設定。**含まない:** scene の並び順。 | **追加/削除/時間更新/移動:** `addCutToScene/updateCutDisplayTime/moveCutToScene/moveCutsToScene`。 | `Cut`、`CutCard.tsx`、`DetailsPanel.tsx`、`Storyline.tsx` |
| **カットグループ** | `CutGroup` はタイムライン上の視覚的グルーピング。 | **含む:** `cutIds` と `isCollapsed`。**含まない:** カット本体。 | **作成/削除/折りたたみ/並び替え:** `useStore` 内 group 操作。 | `CutGroup`、`CutGroupCard.tsx`、`Storyline.tsx` |
| **アセット** | `Asset` は `id/name/path/type/thumbnail/duration/metadata/vaultRelativePath/originalPath/hash` を持つメディア単位。 | **含む:** vault 同期に必要な fields。**含まない:** displayTime や clip。 | **同期/インポート:** `importFileToVault` / `prepareAssetForSave` / `prepareAssetForLoad`。 | `Asset`、`assetPath.ts`、`Sidebar.tsx` |
| **Asset Index** | `assets/.index.json` に保存されるインデックス（`AssetIndex`）。 | **含む:** version/assets。**含まない:** 画像/音声のメタ本体。 | **読み書き:** `loadAssetIndex` / `vaultGateway.saveAssetIndex`。 | `AssetIndex`、`src/vite-env.d.ts` |
| **Metadata Store** | `.metadata.json` に保存されるアセット/シーンの付随情報。 | **含む:** assetId→`AssetMetadata`、sceneId→`SceneMetadata`（scene attachAudio を含む）。 | **読み書き:** `loadMetadataStore` / `saveMetadataStore`。 | `MetadataStore`、`metadataStore.ts` |
| **Asset Metadata** | `AssetMetadata` は displayTime/analysis/lipSync を保持する。 | **含む:** `displayTime` / `audioAnalysis` / `lipSync`。`lipSync.ownedGeneratedAssetIds` / `orphanedGeneratedAssetIds` は生成物ID（mask/composited等）のみを持つ。 | **更新:** `updateAudioAnalysis` / `setLipSyncForAsset`。 | `AssetMetadata`、`metadataStore.ts` |
| **Asset Reference Graph** | `collectAssetRefs` が scenes + metadata から参照種別付きの asset 参照集合を構築。 | **含む:** `cut` / `cut-audio-binding` / `scene-audio` / `lipsync-*`。**含まない:** 物理ファイル一覧。 | **利用:** usage算出 / 削除可否判定 / 保存前検証。 | `assetRefs.ts` |
| **Asset Delete Policy** | `deleteAssetWithPolicy` は asset 削除責務の単一入口。 | **含む:** 参照チェック + trash移動 + index/metadata整合更新。 | **呼び出し:** `assetActions.runAssetDelete` から store 経由。 | `useStore.ts`, `actions/assetActions.ts` |
| **Scene Metadata** | `.metadata.json` 内の `SceneMetadata`（scene notes/labels の永続化）。 | **含む:** シーン名・ノート。 | **更新:** シーン保存時に同期。 | `SceneMetadata`、`metadataStore.ts` |
| **ソースパネル状態** | `SourcePanelState` は source panel の folders/expanded/viewMode を保持。 | **含む:** ユーザが追加した外部フォルダ。 | **初期化/取得:** `initializeSourcePanel` / `getSourcePanelState`（`Project.sourcePanel` に保存）。 | `SourcePanelState`、`useStore.ts` |
| **保管庫パス** | `vaultPath` はプロジェクトの保管庫ルート。 | **含む:** `vault/assets` の初期化。 | **選択/作成:** StartupModal で作成。 | `Project.vaultPath`、`StartupModal.tsx` |

## UI / Playback

| 用語 | 定義 | 境界（含む / 含まない） | 主要操作 | 関連TS型 / TSX |
| --- | --- | --- | --- | --- |
| **アセットドロワー** | vault のアセット一覧 Drawer。 | **含む:** vault/assets の一覧・検索・使用状況表示。 | **一覧構築:** `loadAssetIndex` / `metadataStore` 集計。 | `AssetDrawer.tsx` |
| **アセットパネル** | アセット一覧の共通 UI。 | **含む:** 検索/フィルタ/並び替え/選択。 | **操作入口:** `assetActions`（Finalize/Reverse/Extract/Delete）。 **一覧構築:** `loadAssetIndex` / `getFolderContents`。 | `AssetPanel.tsx`, `actions/assetActions.ts` |
| **アセットモーダル** | `AssetPanel` のモーダルラッパー。 | **含む:** オーバーレイ/ESC/閉じる挙動。 | **選択結果の返却。** | `AssetModal.tsx` |
| **ストーリーライン** | シーン列とカットの D&D 配置を扱う編集軸（`StoryTimeline`）のUI。 | **含む:** シーン/カット D&D、外部ファイル投入。 | **ドロップ処理:** vault 取込とカット追加。 | `Storyline.tsx` |
| **プレビュー** | `PreviewModal` が単体/シーケンス再生を行う。 | **含む:** Single/Sequence モードと再生 UI。 | **起動:** `CutCard`。 | `PreviewModal.tsx` |
| **プレビュー項目** | `PreviewItem` は Sequence 用の派生構造体。 | **含む:** cut/sceneName/thumbnail。 | **構築:** `PreviewModal` 内で生成。 | `PreviewModal.tsx` |
| **プレビュー制御** | public APIは `useSequencePlaybackController`、内部概念は `SequenceClock` として再生状態を管理。 | **含む:** currentIndex/localProgress/range/loop/buffering。 | **操作:** `setSource/seek/skip` 等。 | `PlaybackState`、`previewPlaybackController.ts` |
| **プレビューメディアソース** | `MediaSource` は Preview再生専用の app-specific abstraction（Web APIの `MediaSource` とは別）。 | **含む:** play/pause/seek/setRate/getCurrentTime/dispose と JSX 要素。 | **生成:** `createVideoMediaSource` / `createImageMediaSource`。 | `previewMedia.tsx` |
| **エクスポート実行計画** | `ExportPlan` は出力形式別の実行パラメータを保持する。 | **含む:** `Mp4ExportPlan` / `AviUtlExportPlan`。**含まない:** Preview再生状態。 | **生成:** `resolveExportPlan`。 | `src/features/export/plan.ts` |
| **エクスポート出力シーケンス** | `ExportSequenceItem` は export 実行用の時系列素材列を表す。 | **含む:** path/duration/clip/framing/lipSync payload。**含まない:** UI状態。 | **生成:** `buildSequenceItemsForCuts` / `buildSequenceItemsForExport`。 | `src/utils/exportSequence.ts` |

## Vault / Sync

| 用語 | 定義 | 境界（含む / 含まない） | 主要操作 | 関連TS型 / ファイル |
| --- | --- | --- | --- | --- |
| **VaultGateway** | `.index.json` と `.trash/.trash.json` の唯一の書き込み口。 | **含む:** import/register/save/trash。 | **呼び出し:** `window.electronAPI.vaultGateway.*`。 | `electron/vaultGateway.ts` |
| **Trash Log** | `.trash/.trash.json` に削除履歴を記録。 | **含む:** deletedAt/originalPath/originRefs。 | **保存:** `moveToTrashWithMeta`。 | `electron/vaultGateway.ts` |
