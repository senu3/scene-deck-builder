# Vault / Asset Management Plan (2026-03-11)

## TL;DR
- Vault / Asset 管理の基盤整備として、renderer 側の in-vault index 直接更新をやめ、`vaultGateway.registerVaultAsset` を追加した。
- asset metadata は `src/features/metadata/provider.ts` の canonical 入口で正規化し、register 系は `src/features/asset/write.ts` 経由へ寄せた。
- recovery relink は read-only の draft 構築と write の register を分離し、read path で暗黙 write を起こさない形に整理した。
- ただし `usageRefs` の完全な派生化と `cut.asset` snapshot の最終縮退は未完了なので、残フェーズは TODO で追跡する。

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

## 残作業
- `usageRefs` を save/rebuild 基準の派生情報として明示し、register 時の責務からさらに切り離す。
- `cut.asset` snapshot の依存を save/load/recovery で再棚卸しし、最終的な撤去条件を Gate 8 観点で固定する。
- delete/trash 経路の index 更新責務をさらに整理し、`moveToTrashInternal` 側の暗黙 index 更新を見直す。

## 検証
- provider / asset write service / assetPath / cut actions の unit test を更新し、register 経路の変更をカバーした。
- `npm run build` を通し、型チェックと bundle build が成立することを確認した。
