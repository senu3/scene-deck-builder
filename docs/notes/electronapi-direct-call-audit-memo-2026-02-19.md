# electronAPI 直呼び 監査メモ + 修正順（2026-02-19）

## 目的
- Gate9 整備中に見えた `window.electronAPI` 直呼びの分布を残す。
- 「今回直すもの」と「後回しにするもの」を明確化する。

## 監査スコープ
- renderer / utils / store の `window.electronAPI` 直呼び（簡易棚卸し）。
- サムネイル周辺を優先確認。

## 今回対応したもの（完了）
1. サムネ入口統一（Facade化）
- `features/thumbnails/api.ts` を新設し、UI側の `thumbnailCache` 直接操作を縮退。
- Gate: Gate9
- 関連コミット:
  - `afa8a5b` (step1-5)
  - `65beb0f` (step6-7)
  - `ace3a07` (step8 + docs amend)
  - `0d0c6ee` (step10 gate-check追加)

2. `videoUtils` の electronAPI依存除去
- `videoUtils` は renderer処理ユーティリティに限定。
- IPC呼び分け/fallbackは `features/thumbnails/provider.ts` に移動。
- Gate: Gate9
- 関連コミット:
  - `e3c9012`

3. `StartupModal` / `useHeaderProjectController` の同型ロジック集約
- project-load/recovery の重複を `src/features/projectLoad/shared.ts` に集約。
- 集約対象:
  - `resolveScenesAssets`
  - `normalizeLoadedProjectVersion`
  - `resolveLoadedVaultPath`
  - recovery decision 適用
  - cut clip サムネ再生成
- Gate: Gate7（責務の単一化）
- 関連コミット:
  - `a01a3e5`

## 今回は後回し（TODO扱い）
1. utils層の `electronAPI` 直呼び整理
- 対象例:
  - `src/utils/assetPath.ts`
  - `src/utils/metadataStore.ts`
  - `src/utils/audioUtils.ts`
  - `src/utils/lipSyncUtils.ts`
- 理由:
  - 既存機能の境界が広く、段階的な provider/gateway 化が必要。

2. metadata / video metadata 呼び出しの整理
- 対象例:
  - `src/components/AssetPanel.tsx`（`getVideoMetadata`）
  - metadata系呼び出し全般（横断で再設計予定）
- 理由:
  - 単発修正より、関連呼び出しをまとめて整理した方が差分が小さくなる。

3. store内 I/O 直実行の見直し
- 対象例:
  - `src/store/slices/projectSlice.ts`
  - `src/store/slices/metadataSlice.ts`
- 現方針:
  - 現在は許容（仕様として保持）。
  - 見直し時は「store action が I/O副作用境界を持つ」前提を明示して設計する。

## 優先修正順（更新）
1. `clipThumbnail` の early return見直し（provider fallbackを殺さない） ✅ 完了
2. `StartupModal` / `useHeaderProjectController` の同型ロジックを最小差分で集約 ✅ 完了
3. utils層の provider/gateway 抽出（段階実施） ⏸ `TODO-DEBT-006` へ移管
4. metadata / video metadata 直呼びの横断整理 ⏸ `TODO-DEBT-007` へ移管

## 現在ステータス
- 本メモの追加実装対応は一時停止。
- 未対応項目は `docs/TODO_MASTER.md` で継続管理する。

## Gate 関連
- Gate9:
  - サムネ入口統一、低レベルAPIのFacade外import検知を導入済み。
  - `npm run check:gate:strict` は warning 0。
- Gate10:
  - 現時点の監査対象は再生ホットパス中心。
  - 今回のメモは「副作用境界（I/O配置）」の補助監査として扱う。

## Update（2026-02-19）
- 項目1を実施:
  - `src/features/cut/clipThumbnail.ts` の early return を削除し、provider fallback が有効な経路に修正。
  - テスト環境で fallback 経路が安定するよう `src/test/setup.renderer.ts` に `generateThumbnail` / `readFileAsBase64` モックを追加。
- 検証:
  - `npm test -- src/features/cut/__tests__/actions.test.ts src/store/__tests__/timelineIntegrityCommands.test.ts`
  - `npm run build`
  - `npm run check:gate:strict`

## Update（2026-02-20）
- 項目2を `今回対応したもの` へ反映（Gate7）。
- 未対応の項目3/4は `TODO_MASTER` へ移管し、本メモの実装対応は一時停止に更新。

## Update（2026-02-20 / Gate7 簡易Dupチェック）
- 対象: I/O境界（`electronAPI` / hydration / recovery / metadata / thumbnails）の簡易棚卸し。
- TODO移管済み・許容範囲は除外して確認。
- 追加で見えた点:
  - `DetailsPanel` の clipサムネ再生成が `generateVideoClipThumbnail` 直呼びだったため、`getCutClipThumbnail`（cut-derived API）に寄せて単一入口化。
  - `StartupModal` の `loadProject` / `loadProjectFromPath` 周辺の組み立てフローに同型部分が残る（共有関数に寄せる余地あり、現時点は簡易チェック記録のみ）。
