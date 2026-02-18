# Backward Compatibility Inventory (2026-02-18)

**目的**: 後方互換の残存ポイントを実コードベースで棚卸しし、撤去条件・移行導線・検知方法を固定する。  
**適用範囲**: `project.sdp` / `.metadata.json` / renderer-main IPC / `cut.asset` fallback。  
**Must**:
- 各互換項目を `期限` または `永久` に分類する。
- `期限` 項目は撤去条件（目標バージョン）と移行導線を持つ。
- 検知は既存 Gate/Test を優先し、不要なログ追加はしない。  
**Must Not**:
- `cut.asset` 直接参照を `assetResolve.ts` 外へ再拡散しない。
- 互換撤去を docs 未更新で進めない。

## 前提
- 現在の保存バージョンは `version: 3`（`src/hooks/useHeaderProjectController.ts:264`, `src/components/StartupModal.tsx:263`）。
- 互換撤去の目標は次期 schema 更新を `v4` とし、残存 shim の最終撤去を `v5` とする。

## Inventory
| ID | 区分 | 現状 | 分類 | 撤去条件 | 移行導線 | 検知/計測 |
|---|---|---|---|---|---|---|
| DF-01 | データ形式 | `Scene.order` は deprecated で型に残存（`src/types/index.ts:175`）。 | 期限 | `project schema v4` で型/保存対象から除去。 | load 時は既に `sceneOrder` 正本で正規化。`scene.order` は読み捨て。 | `rg "order\\?: // Deprecated|scene\\.order"` |
| DF-02 | データ形式 | 保存スナップショット由来の `isLoading/loadingName` を load 時除去（`src/store/slices/projectSlice.ts:14`）。 | 期限 | `v4` で normalize 対象から削除（旧 snapshot 読み込み終了後）。 | `project.sdp` ロード時に one-time normalize（既存実装）後、再保存で消滅。 | `rg "isLoading|loadingName" src/store/slices/projectSlice.ts` |
| DF-03 | データ形式 | `useEmbeddedAudio` 未設定を `true` 補完（`src/store/slices/projectSlice.ts:22`）。 | 期限 | `v5` で未設定データの受け入れを終了。 | `v4` 期間でロード正規化+再保存を推奨。 | `src/store/slices/projectSlice.ts:22` の有無 + 既存 export/preview テスト |
| DF-04 | データ形式 | LipSync v1 互換（`compositedFrameAssetIds` 無し時 fallback）（`src/utils/lipSyncUtils.ts:89`）。 | 期限 | `TODO-BREAKING-001` 実装完了後の `v5` で fallback 削除。 | load 時に LipSync settings を v2 正規化（one-time migrate）し再保存。 | `TODO-BREAKING-001`, `src/components/__tests__/assetPanelLipSyncSets.test.ts` |
| DF-05 | データ形式 | `project.version` が無くても `assets/` 相対パスを検出して復元（`src/components/StartupModal.tsx:160`, `src/hooks/useHeaderProjectController.ts:497`）。 | 期限 | `v5` で version missing 互換を終了。 | `v4` で load 時に version を補完し再保存する migrate を追加。 | `rg "hasLegacyRelativeAssetPaths|version >= 2|version === 2|version === 3" src/components/StartupModal.tsx src/hooks/useHeaderProjectController.ts` |
| UI-01 | UI/IPC | `generate-video-thumbnail` エイリアスを維持（`electron/main.ts:1053`, `src/utils/videoUtils.ts:173`）。 | 期限 | `v4` で alias 削除。 | renderer は `generateThumbnail(..., { profile })` のみに統一。 | `rg "generateVideoThumbnail|generate-video-thumbnail" src electron` |
| UI-02 | UI/IPC | 旧 top-level IPC (`import-asset-to-vault`, `save-asset-index`, `move-to-trash-with-meta`) を残置（`electron/main.ts:1337`, `electron/preload.ts:411`）。 | 期限 | `v4` で top-level 廃止。 | `window.electronAPI.vaultGateway.*` へ一本化（既存主要 callsite は移行済み）。 | `rg "importAssetToVault\\(|saveAssetIndex\\(|moveToTrashWithMeta\\(" src` |
| FB-01 | 旧プロパティfallback | `resolveCutAsset` が `getAsset(cut.assetId) ?? cut.asset`（`src/utils/assetResolve.ts:20`）。 | 期限 | `v5` で fallback 廃止。 | `v4` で load 時 `assetId` 強制補完 + `.index.json` hydration を必須化。 | Gate8 (`scripts/check-gate.mjs:108`), `npm run check:gate` |
| FB-02 | 旧プロパティfallback | `resolveCutAssetId` が `cut.asset.id` へ fallback（`src/utils/assetResolve.ts:31`）。 | 期限 | `v4` で fallback 廃止。 | load normalize で `cut.assetId` 未設定を埋める one-time migrate。 | `rg "resolveCutAssetId\\(|cut\\.assetId"` + save/load テスト |
| FB-03 | 旧プロパティfallback | save 時は `cut.asset` fallback を使わず `assetId` 経路のみ（`src/utils/projectSave.ts:91`, `src/utils/__tests__/projectSave.test.ts:60`）。 | 期限 | `v4` で方針固定（追加撤去なし）。 | 方針維持（write-time 非互換化済み）。 | `projectSave.test.ts` |

## 期限/永久の確定結果
- `永久`: なし
- `期限`: 10件（上表）

## 実行順（推奨）
1. `v4`: IPC旧経路（UI-01/UI-02）と `cut.assetId` 補完 migration（FB-02）を先に実施。
2. `v4`: project version missing 補完（DF-05）を入れて再保存率を上げる。
3. `v5`: `cut.asset` fallback（FB-01）と LipSync v1 fallback（DF-04）を撤去。

## 実施ログ
- 2026-02-18: `v4` の Step 1-2 を実施。
  - UI-01: `generate-video-thumbnail` IPC alias を撤去。`generateThumbnail` 経路に統一。
  - UI-02: top-level IPC (`import-asset-to-vault` / `save-asset-index` / `move-to-trash-with-meta`) を撤去し、`vaultGateway.*` に統一。
  - FB-02: `resolveCutAssetId` の `cut.asset.id` fallback を撤去。
  - DF-05: load 時の `version` 欠損を補完し、`version:3` で one-time 再保存する移行導線を追加。
- 2026-02-18: `v5` の Step 3 を実施。
  - FB-01: `resolveCutAsset` の `cut.asset` fallback を撤去し、`assetId` 経路のみに統一。
  - DF-04: LipSync frame 解決の v1 fallback を撤去。`compositedFrameAssetIds` 欠損は load 正規化で補完し、runtime は v2 前提へ統一。

## 参考
- `docs/ARCHITECTURE.md`
- `docs/guides/implementation/gate-checks.md`
- `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`
- `docs/TODO_MASTER.md`
