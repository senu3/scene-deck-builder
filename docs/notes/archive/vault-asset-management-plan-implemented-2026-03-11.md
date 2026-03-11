# Vault / Asset Management Plan Implemented (2026-03-11)

## TL;DR
- Vault / Asset 管理の基盤整備として、renderer 側の in-vault index 直接更新をやめ、`vaultGateway.registerVaultAsset` を追加した。
- asset metadata は `src/features/metadata/provider.ts` の canonical 入口で正規化し、register 系は `src/features/asset/write.ts` 経由へ寄せた。
- recovery relink は read-only の draft 構築と write の register を分離し、read path で暗黙 write を起こさない形に整理した。
- `usageRefs` は save-time derived index helper に集約し、`cut.asset` snapshot 参照は `resolveCutAssetSeed` に局所化した。
- delete/trash は gateway 側が file move + index 更新結果を返す write path に統一し、renderer 側の delete 用 index 二重更新を削除した。

## 目的
- Vault / Asset 管理の write 入口と metadata 入口を整理し、`Asset.duration` などの不整合を経路差で増やさない。
- recovery の read path を副作用なしに固定し、relink 実行時だけ write を起こすようにする。

## 適用範囲
- `electron/vaultGateway.ts`
- `src/features/asset/write.ts`
- `src/features/metadata/provider.ts`
- `src/utils/assetPath.ts`
- `src/utils/cutImport.ts`
- `src/features/project/load.ts`
- `src/components/AssetPanel.tsx`

## Must
- vault 内既存ファイルの register は renderer で `.index.json` を直接組み立てず、gateway 経由で行う。
- duration / fileSize / width / height は canonical metadata provider を通して正規化する。
- recovery の missing 判定は read-only を維持し、relink 決定後の register だけを write step として扱う。

## Must Not
- `src/utils/assetPath.ts` に index 書き込み責務を戻さない。
- UI から `vaultGateway` を直接叩いて import/register 経路を増やさない。
- invalid duration (`NaN`, `Infinity`, `<= 0`) を `Asset.duration` にそのまま流さない。

## 今回の実装
1. Gateway 追加
- `vaultGateway.registerVaultAsset` を追加し、vault/assets 配下に既に存在するファイルの index 登録を main 側に移した。

2. Canonical metadata provider
- `readCanonicalAssetMetadataForPath` を追加し、image/video の metadata と duration/fileSize の正規化を一箇所で扱うようにした。

3. Shared write service
- `registerAssetFile` を追加し、外部 import と vault 内 register の分岐、metadata 取得、Asset 組み立てを集約した。
- `importFileToVault` は互換 wrapper とし、低レベル register 実装は service 側へ退避した。

4. Read / write 境界の整理
- `buildAssetForCut` は canonical metadata provider を使うように変更した。
- recovery relink は draft 構築と register 実行を分離した。
- `AssetPanel` の bulk import は bridge 直呼びではなく shared write service を使うように変更した。

## Follow-up Update
1. `usageRefs` の派生化
- `buildDerivedAssetIndexForSave` を導入し、asset index の並び替えと `usageRefs` 再構築を save-time derived output として明示した。
- save controller はこの helper だけを呼ぶ形にし、`usageRefs` を runtime 正本として扱わないことをコード上でも固定した。

2. recovery read / commit 境界
- `planRecoverySceneChanges` と `commitRecoverySceneChanges` を追加し、recovery 適用を read-only planning と write commit に分離した。
- `project/apply` は planning 後に commit を呼ぶ構造へ変更し、feature レベルで境界を明示した。

3. `cut.asset` snapshot 依存の局所化
- load/recovery 用の snapshot seed は `src/utils/assetResolve.ts` の `resolveCutAssetSeed` に集約した。
- `hasLegacyRelativeAssetPaths`、recovery planning、load 後 migration save、clip thumbnail 再生成はこの helper を使う。
- これにより `cut.asset` の直接参照は引き続き `assetResolve.ts` 内だけに閉じる。

4. delete / trash write path の明示化
- `moveToTrashWithMeta` は trash move の結果に加えて index sync 成否を返すように変更した。
- delete policy は gateway 結果だけを見て metadata delete を続行するか判定し、renderer 側の `INDEX_UPDATE` effect は delete 経路から外した。

## 状態
- 本計画の scoped work は完了したため archive へ移動した。

## 検証
- provider / asset write service / assetPath / cut actions の unit test を更新し、register 経路の変更をカバーした。
- delete/trash provider と metadata delete policy の unit test を更新し、gateway 返却値ベースで partial failure を確認した。
- `npm test` と `npm run build` を通し、型チェックと bundle build が成立することを確認した。
