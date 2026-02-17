# Gate Audit 2026-02-17

## Scope
- 目的: Gate 1-10 の違反候補を現行コードで機械抽出し、是正区分を付ける。
- 実施日: 2026-02-17
- 区分: `Fix` / `ADR` / `Known broken` / `False positive`

## Gate 1: Scene順序正本は `sceneOrder`
- 検出コマンド:
```bash
rg -n "\bsceneOrder\b|getScenesInOrder|getScenesAndCutsInTimelineOrder" src/App.tsx src/components/Storyline.tsx src/components/PreviewModal.tsx src/utils/sceneOrder.ts src/utils/timelineOrder.ts
```
- 該当:
  - `src/utils/sceneOrder.ts:23`
  - `src/utils/timelineOrder.ts:8`
  - `src/App.tsx:119`
  - `src/components/Storyline.tsx:54`
- 判定:
  - `False positive`（現時点では `sceneOrder` 正本運用が優勢）
- 対応方針:
  - `scenes` 配列順を直接 index に使う新規コードをPRレビューで禁止

## Gate 2: Cut順序は配列順 = `cut.order`
- 検出コマンド:
```bash
rg -n "getCutsInTimelineOrder|order: idx|order:\s*i|safeOrder" src/utils/timelineOrder.ts src/store/slices/cutTimelineSlice.ts src/store/commands.ts
```
- 該当:
  - `src/utils/timelineOrder.ts:4`
  - `src/utils/timelineOrder.ts:20`
  - `src/store/slices/cutTimelineSlice.ts:191`
- 判定:
  - `Known broken`（`safeOrder` fallback で不整合を許容）
- 対応方針:
  - 監査で fallback 依存箇所を列挙し、段階的に fail-fast へ移行

## Gate 3: 時系列定義の単一化
- 検出コマンド:
```bash
rg -n "accumulatedTime|computeStoryTimings\(|computeStoryTimingsForCuts\(" src/components/PreviewModal.tsx src/utils/storyTiming.ts
```
- 該当:
  - `src/components/PreviewModal.tsx:842`
  - `src/components/PreviewModal.tsx:1996`
  - `src/components/PreviewModal.tsx:1136`
  - `src/utils/storyTiming.ts:32`
- 判定:
  - `Known broken`（Preview内の累積計算が複数に分散）
- 対応方針:
  - canonical timing resolver を作り Preview/Export 双方から利用

## Gate 4: `displayTime` 正規化
- 検出コマンド:
```bash
rg -n "displayTime|Math\.max\(0\.1|Invalid displayTime" src/components/PreviewModal.tsx src/utils/exportSequence.ts src/utils/assetResolve.ts
```
- 該当:
  - `src/components/PreviewModal.tsx:951`
  - `src/components/PreviewModal.tsx:952`
  - `src/utils/exportSequence.ts:50`
  - `src/utils/exportSequence.ts:106`
- 判定:
  - `Known broken`（Preview/Export で別正規化）
- 対応方針:
  - 共通 `displayTime` 正規化ヘルパへ集約

## Gate 5: Preview/Export parity
- 検出コマンド:
```bash
rg -n "buildSequenceItemsForExport|resolveFramingParams|computeStoryTimings|displayTime" src/utils/exportSequence.ts src/components/PreviewModal.tsx
```
- 該当:
  - `src/utils/exportSequence.ts:233`
  - `src/components/PreviewModal.tsx:1136`
  - `src/components/PreviewModal.tsx:362`
- 判定:
  - `Known broken`（item構築の入口が分離）
- 対応方針:
  - Phase 1は時間・順序・displayTime、Phase 2で framing/audio/lipsync を統合

## Gate 6: Timeline構造変更はCommand経由
- 検出コマンド:
```bash
rg -n "useStore\.setState\(|set\(\(state\) => \(\{\s*scenes:" src/store/commands.ts src/store/slices
```
- 該当:
  - `src/store/commands.ts:81`
  - `src/store/commands.ts:347`
  - `src/store/slices/cutTimelineSlice.ts:16`
- 判定:
  - `ADR`（適用境界の明文化が必要）
- 対応方針:
  - 「ユーザー操作起点はCommand必須、ロード/復元/テスト初期化は例外」を憲章に固定

## Gate 7: Vault書き込み単一入口
- 検出コマンド:
```bash
rg -n "vaultGateway\.|saveAssetIndex\(|importAndRegisterAsset\(|moveToTrashWithMeta\(" src/components src/utils src/store electron/preload.ts
```
- 該当:
  - `src/components/AssetPanel.tsx:444`
  - `src/components/DetailsPanel.tsx:584`
  - `src/store/slices/metadataSlice.ts:321`
  - `src/utils/assetPath.ts:162`
- 判定:
  - `False positive`（現時点では `vaultGateway` 集約）
- 対応方針:
  - renderer 側直接 fs 書き込みが追加されないことを監視

## Gate 8: Asset参照は `assetId` 主経路
- 検出コマンド:
```bash
rg -n "cut\.asset\b|getAsset\(cut\.assetId\)|resolveCutAsset\(" src/utils/exportSequence.ts src/components/StartupModal.tsx src/utils/projectSave.ts src/components/PreviewModal.tsx src/components/DetailsPanel.tsx
```
- 該当:
  - `src/utils/exportSequence.ts:54`
  - `src/utils/exportSequence.ts:95`
  - `src/components/StartupModal.tsx:61`
  - `src/utils/projectSave.ts:97`
- 判定:
  - `Known broken`（`cut.asset` 直接参照が複数残存）
- 対応方針:
  - `resolveCutAsset` 経由へ寄せ、write経路で `cut.asset` を前提にしない

## Gate 9: thumbnail profile 混線禁止
- 検出コマンド:
```bash
rg -n "getThumbnail\(" src/components/Sidebar.tsx src/components/CutCard.tsx src/components/DetailsPanel.tsx src/components/PreviewModal.tsx
```
- 該当:
  - `src/components/Sidebar.tsx:156`
  - `src/components/CutCard.tsx:188`
  - `src/components/DetailsPanel.tsx:203`
  - `src/components/PreviewModal.tsx:1026`
- 判定:
  - `Known broken`（profile 省略呼び出しが残る）
- 対応方針:
  - 呼び出し面ごとに profile を明示し、暗黙 `timeline-card` 依存を削減

## Gate 10: 重い処理を再生ループへ入れない
- 検出コマンド:
```bash
rg -n "requestAnimationFrame\(|setInterval\(|analyzeAudioRms\(|read-audio-pcm|ffmpeg|spawn\(" src/components/PreviewModal.tsx src/utils/previewMedia.tsx src/utils/audioUtils.ts electron/main.ts
```
- 該当:
  - `src/components/PreviewModal.tsx:2303`
  - `src/utils/previewMedia.tsx:78`
  - `src/utils/audioUtils.ts:402`
  - `electron/main.ts:890`
- 判定:
  - `Fix`（再生ループ内で重い処理を呼んでいないか追加監査が必要）
- 対応方針:
  - Preview再生中に `analyzeAudioRms` / 大きいI/O が走る経路を重点点検

## 内訳
- `Fix`: 1
- `ADR`: 1
- `Known broken`: 6
- `False positive`: 2

## 次アクション
1. Gate 3/4/5 を最優先で共通 resolver 化
2. Gate 8 の `cut.asset` 直接参照を削減
3. Gate 9 の thumbnail profile 明示を徹底
4. Gate 6 の例外境界を ADR か憲章注記で固定

---

## Update 2026-02-17 (Implementation Pass)

### 状態更新
- Gate 3: `Partial` 継続
  - `PreviewModal` で `normalizedDisplayTime` を導入し、sequence/range の時間軸は共通化。
  - ただし再生側の局所時間窓計算は残存。
- Gate 4: `Partial` 継続
  - `resolveNormalizedCutDisplayTime` を追加し Preview/Export で利用開始。
  - 未統一路線がないかは継続監査対象。
- Gate 5: `Known broken -> Partial`
  - range export が `buildSequenceItemsForCuts` 経由になり full/range の item 生成は統一。
  - 再生側 item 構築レイヤとの完全 parity は未完。
- Gate 6: `ADR -> Partial`
  - 境界定義を ADR-0003 で固定。
  - 残課題は違反検出の自動化。
- Gate 2: `Known broken -> Resolved (for current load/runtime paths)`
  - `safeOrder` fallback を撤去。
  - load 正規化で `cut.order` を配列順へ再設定。
- Gate 8: `Known broken -> Partial`
  - `cut.asset` 直接参照は `src/utils/assetResolve.ts` に局所化。
  - `assetId` 主経路 + read-time fallback の形に収束。
- Gate 9: `Known broken -> Resolved (for current surfaces)`
  - `getThumbnail` 呼び出しの profile 未指定を、主要UI面で明示化済み。

### 参照コミット
- `568ac7d` `refactor: unify preview/export displayTime normalization`
- `986a02a` `refactor: prefer assetId path in save/load and export helpers`
- `6008d2a` `refactor: specify thumbnail profiles for cut-facing flows`
- `2544ab5` `refactor: route range export through shared sequence builder`
- `1a7ffd0` `refactor: use shared cut asset resolver in store actions`
- `3540b67` `refactor: centralize cut asset fallback in asset resolver`
- `24ee0a4` `chore: add warning-only gate check script`
- `206d446` `docs: add ADR for command boundary and refresh gate status`

### Gateチェック自動化（Stage A: warning-only）
- `npm run check:gate` を追加（`scripts/check-gate.mjs`）。
- 現在は warning-only で運用し、`--strict` 指定時のみ non-zero exit。
- 最新実行結果は warning 0。
