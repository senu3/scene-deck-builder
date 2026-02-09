# Mapping (Concept → Types/Store/UI)

**目的**: 概念と実装の対応表を示す正本。
**適用範囲**: TypeScript型・ストア・主要UI。
**関連ファイル**: `src/types/index.ts`, `src/store/useStore.ts`, `src/components/*`。
**更新頻度**: 中。

> 注意: 用語定義は `docs/references/DOMAIN.md` を参照。

| 概念 | データモデル（TS型） | ストア/ユーティリティ | 主要UI/コンポーネント |
| --- | --- | --- | --- |
| プロジェクト | `Project`（vaultPath, scenes, sourcePanel）。 | `initializeProject` / `loadProject` / `window.electronAPI.saveProject`。 | `StartupModal`、`Header` |
| シーン | `Scene`（cuts/order/notes/groups）。 | `addScene/removeScene/renameScene`。 | `Storyline` |
| シーンノート | `SceneNote`。 | `addSceneNote/updateSceneNote/removeSceneNote`。 | `DetailsPanel` |
| カット | `Cut`（assetId/displayTime/in/out）。 | `addCutToScene/updateCutDisplayTime/moveCutToScene`。 | `CutCard`、`PreviewModal` |
| カットグループ | `CutGroup`（cutIds/isCollapsed）。 | `createGroup/deleteGroup/toggleGroupCollapsed/renameGroup`。 | `CutGroupCard`、`Storyline` |
| アセット | `Asset`（path/type/vaultRelativePath 等）。 | `assetPath` 同期/解決/インポート（VaultGateway 経由）。 | `Sidebar`、`CutCard`、`PreviewModal` |
| Asset Index | `AssetIndex` / `AssetIndexEntry`。 | `loadAssetIndex` / `vaultGateway.saveAssetIndex`。 | `AssetDrawer`、`AssetPanel` |
| Metadata Store | `MetadataStore` / `AssetMetadata` / `SceneMetadata`。 | `loadMetadataStore` / `saveMetadataStore`。 | `DetailsPanel`、`PreviewModal` |
| アセット参照グラフ | `AssetRef` / `AssetRefKind`。 | `collectAssetRefs` / `findDanglingAssetRefs` / `getBlockingRefsForAssetIds`。 | `AssetPanel`、`Header`(save validation) |
| アセット削除ポリシー | （store action） | `deleteAssetWithPolicy`（参照チェック + trash + index/metadata整合）。 | `AssetPanel` |
| LipSync バンドル所有 | `LipSyncSettings.ownerAssetId` / `ownedGeneratedAssetIds` / `orphanedGeneratedAssetIds`。 | `setLipSyncForAsset`（再登録時の orphan 移行）。 | `LipSyncModal`、`PreviewModal` |
| アセットパネル | `Asset` / `AssetIndexEntry`。 | `loadAssetIndex` / `getFolderContents` / `metadataStore` 集計。 | `AssetPanel` |
| アセットモーダル | `Asset`（選択結果）。 | `AssetPanel` をモーダルでラップ。 | `AssetModal` |
| ストーリーライン | （専用TS型なし）Scene/Cut構造（編集軸: `StoryTimeline`）。 | D&D・外部投入・vault 取込（主処理は `Storyline`、ワークスペース全体に `App` フォールバックあり）。 | `Storyline`、`SceneDurationBar`、`App` |
| プレビュー | `PreviewMode`（scene/all）。 | `setPreviewMode`。 | `PreviewModal` |
| プレビュー制御 | `PlaybackState`。 | public: `useSequencePlaybackController` / internal concept: `SequenceClock`。 | `PreviewModal` |
| メディアソース | `MediaSource`。 | `createVideoMediaSource` / `createImageMediaSource`。 | `PreviewModal` |
| カット可能メディア判定 | `CuttableMediaType`（`image`/`video`）。 | `getCuttableMediaType`（新規） / `getTimelineMediaType`（互換エイリアス・移行中）。 | `Sidebar`、`StartupModal`、`dragDrop` |
| ソースパネル状態 | `SourcePanelState` / `SourceViewMode`。 | `initializeSourcePanel` / `getSourcePanelState`（`Project.sourcePanel` に保存）。 | `Sidebar` |
| アプリメニュー（ネイティブ） | （専用TS型なし） | `electron/preload.ts`（IPC橋渡し） | `electron/main.ts`（Menu定義＋set）/ `App.tsx`（`onToggleSidebar` 購読） |
