# Store I/O Boundary Migration Plan (2026-03-02)

## TL;DR
- このノートは ADR-0006 の実装移行計画を管理する作業用ドキュメント。
- `TODO-DEBT-010` の進行、M2/M3/M4 の実施順、検証手順をここで追跡する。
- 完了後は `docs/notes/archive/` へ移動する前提で運用する。

## Scope
- 対象:
  - `src/store/slices/projectSlice.ts`
  - `src/store/slices/metadataSlice.ts`
- 主ゲート:
  - Gate7（I/O境界）

## TODO-DEBT-010 進行メモ
- ID: `TODO-DEBT-010`
- 現在ステータス: `in-progress`
- 現在地:
  - Preview VideoClip の Save/Clear 更新経路は共通ユースケース化済み。
  - 次段階は slice 内 I/O の provider/gateway 移管。

## Implementation Policy
1. `projectSlice` の移管
- 対象: `refreshAllSourceFolders` / `initializeSourcePanel`
- 方針:
  - `window.electronAPI` 直呼びを provider/gateway へ移管。
  - slice は「入力整形」「state反映」「失敗時の警告記録」のみを担う。

2. `metadataSlice` の移管
- 対象: `loadMetadata` 内の `loadAssetIndex` / `resolveVaultPath` 呼び出し。
- 方針:
  - metadata provider を拡張し、hydration 用 read 操作を provider へ集約。
  - slice は「不足ID抽出」「適用」「warn」へ限定する。

3. 保存系の境界
- `saveMetadataStore` 呼び出しは provider/gateway 境界で実行する。
- slice 側に残すのは serialize（`state -> payload` 確定）まで。

## Migration Plan
- M1: 境界定義の確定（ADR-0006 を Accepted 化）。
- M2: `projectSlice` I/O 移管（provider/gateway 化）。
- M3: `metadataSlice` I/O 移管（provider 化）。
- M4: Gate監査拡張（slice 内 `window.electronAPI` 新規流入を fail 化）。

## Gate / Verification
- 必須:
  - `npm run check:gate:strict`
  - 対象 slice のユニット/結合テスト
  - load/recovery/save の回帰確認
- 監査観点:
  - slice reducer / slice action 内の direct I/O が増えていないこと
  - provider/gateway 境界以外で read/write が実行されないこと

## Exit / Archive 条件
- `TODO-DEBT-010` の DoneWhen が満たされること。
- M2/M3/M4 の完了記録が本ノートに残っていること。
- 完了後に `docs/notes/archive/` へ移動すること。

## Related
- `docs/DECISIONS/ADR-0006-store-io-boundary-policy.md`
- `docs/TODO_MASTER.md` (`TODO-DEBT-010`)
- `docs/notes/electronapi-direct-call-audit-memo-2026-02-19.md`
