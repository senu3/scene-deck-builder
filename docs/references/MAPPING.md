# Mapping (Concept → Types/Store/UI)

**目的**: 概念と実装の対応表を示す正本。
**適用範囲**: TypeScript型・ストア・主要UI。
**関連ファイル**: `src/types/index.ts`, `src/store/useStore.ts`, `src/components/*`。
**更新頻度**: 中。

## Must / Must Not
- Must: 概念 -> 型/ストア/UI の対応は1対1の主経路を維持する。
- Must: 新機能追加時は該当行を更新し、参照先 docs を同期する。
- Must Not: 廃止済み経路を現行マッピングとして残さない。
- Must Not: 同一概念に矛盾する複数の owner を定義しない。

> 注意: 用語定義は `docs/references/DOMAIN.md` を参照。

| 概念 | データモデル（TS型） | ストア/ユーティリティ | 主要UI/コンポーネント |
| --- | --- | --- | --- |
| プロジェクト | `Project`（vaultPath, scenes, sceneOrder, targetTotalDurationSec, sourcePanel）。 | `initializeProject` / `loadProject` / `window.electronAPI.saveProject`。 | `StartupModal`、`Header` |
| シーン | `Scene`（cuts/notes/groups。順序は `sceneOrder` で管理）。 | `addScene/removeScene/renameScene/reorderScenes`。 | `Storyline` |
| シーンノート | `SceneNote`。 | `addSceneNote/updateSceneNote/removeSceneNote`。 | `DetailsPanel` |
| カット | `Cut`（assetId/displayTime/in/out/useEmbeddedAudio/audioBindings）。 | `addCutToScene/updateCutDisplayTime/moveCutToScene/moveCutsToScene`。 | `CutCard`、`DetailsPanel`、`PreviewModal` |
| カットグループ | `CutGroup`（cutIds/isCollapsed）。 | `createGroup/deleteGroup/toggleGroupCollapsed/renameGroup`。 | `CutGroupCard`、`Storyline` |
| アセット | `Asset`（path/type/vaultRelativePath 等）。 | `assetPath` 同期/解決/インポート（VaultGateway 経由）。 | `Sidebar`、`CutCard`、`PreviewModal` |
| Asset Index | `AssetIndex` / `AssetIndexEntry`。 | `loadAssetIndex` / `vaultGateway.saveAssetIndex`。 | `AssetDrawer`、`AssetPanel` |
| Metadata Store | `MetadataStore` / `AssetMetadata` / `SceneMetadata`。 | `loadMetadataStore` / `saveMetadataStore`。 | `DetailsPanel`、`PreviewModal` |
| Scene Audio | `SceneMetadata.attachAudio`（`SceneAudioBinding`）。 | `setSceneAudioBinding` / `SetSceneAttachAudioCommand`（更新時に `.metadata.json` へ保存）。 | `DetailsPanel`（Scene選択時） |
| アセット参照グラフ | `AssetRef` / `AssetRefKind`。 | `collectAssetRefs` / `findDanglingAssetRefs` / `getBlockingRefsForAssetIds`。 | `AssetPanel`、`Header`(save validation) |
| アセット削除ポリシー | （store action） | `assetActions.runAssetDelete` -> `deleteAssetWithPolicy`（参照チェック + trash + index/metadata整合）。 | `AssetPanel` |
| LipSync バンドル所有 | `LipSyncSettings.ownerAssetId` / `ownedGeneratedAssetIds` / `orphanedGeneratedAssetIds`。 | `setLipSyncForAsset`（再登録時の orphan 移行）/ `cleanupLipSyncAssetsForDeletedCut`（Relink/明示cleanup）。 | `LipSyncModal`、`PreviewModal`、`DetailsPanel` |
| アセットパネル | `Asset` / `AssetIndexEntry`。 | `loadAssetIndex` / `getFolderContents` / `metadataStore` 集計（LipSync生成アセット除外、ownerバッジ付与）+ `assetActions` 経由の Asset 操作（Finalize/Reverse/Extract/Delete）。 | `AssetPanel`, `features/asset/actions.ts` |
| アセットモーダル | `Asset`（選択結果）。 | `AssetPanel` をモーダルでラップ。 | `AssetModal` |
| ストーリーライン | （専用TS型なし）Scene/Cut構造（編集軸: `StoryTimeline`）。 | D&D・外部投入・vault 取込（主処理は `Storyline`、ワークスペース全体に `App` フォールバックあり）。 | `Storyline`、`SceneDurationBar`、`App` |
| プレビュー | `PreviewMode`（scene/all）。 | `setPreviewMode`。 | `PreviewModal` |
| プレビュー制御 | `PlaybackState`。 | public: `useSequencePlaybackController` / internal concept: `SequenceClock`。 | `PreviewModal` |
| プレビューメディアソース | `MediaSource`（Preview専用 abstraction）。 | `createVideoMediaSource` / `createImageMediaSource`。 | `PreviewModal` |
| エクスポート実行計画 | `ExportPlan` / `Mp4ExportPlan`。 | `resolveExportPlan`。 | `ExportModal`、`App` |
| エクスポート出力シーケンス | `ExportSequenceItem`。 | `buildSequenceItemsForCuts` / `buildSequenceItemsForExport`。 | `PreviewModal`、`App` |
| エクスポート音声計画 | `ExportAudioPlan` / `ExportAudioEvent`。 | `buildExportAudioPlan`（`useEmbeddedAudio` を含む）。 | `App`、`PreviewModal` |
| エクスポート実行境界 | `ExportSequenceOptions` / `ExportSequenceResult`（IPC payload, `audioPlan` 含む）。 | `window.electronAPI.exportSequence`。 | `App`、`PreviewModal` |
| カット可能メディア判定 | `CuttableMediaType`（`image`/`video`）。 | `getCuttableMediaType`（新規） / `getTimelineMediaType`（互換エイリアス・移行中）。 | `Sidebar`、`StartupModal`、`dragDrop` |
| ソースパネル状態 | `SourcePanelState` / `SourceViewMode`。 | `initializeSourcePanel` / `getSourcePanelState`（`Project.sourcePanel` に保存）。 | `Sidebar` |
| ソース由来パス規約 | `ImportSourcePath` / `OriginPath`（docs規約）。 | `SourcePanel`（UI）とは別概念として記述。 | guides で適用 |
| アプリメニュー（ネイティブ） | （専用TS型なし） | `electron/preload.ts`（IPC橋渡し） | `electron/main.ts`（Menu定義＋set）/ `App.tsx`（`onToggleSidebar` 購読） |
