# Test Integration Startpoint (2026-02-18)

**Status**: Implemented (archived)  
**Implemented by**:
- `935c1d2` `test(integration): consolidate low-risk test cases and shared fixtures`

## 目的
- テスト統合の開始地点を固定し、過剰増加を防ぎつつ診断力を維持する。

## 適用範囲
- `src/**/__tests__/*`
- 特に `utils` / `store` / `features/export` の重複整理。

## 統合方針（固定）
- 統合してよい:
  - 同一セットアップ・同一期待値でケース差分のみのテストを `it.each` へ統合する。
  - 同一fixture/初期化コピペを shared helper に抽出する。
- 統合禁止（残す）:
  - Gate 直接回帰（`sceneOrder` / `cut.order` / `displayTime` / parity）。
  - 失敗時診断が必要な重要分岐（strict/非strict、ON/OFF、undo/redo、disabled除外など）。
  - Command 境界・時系列整合を担保する統合テスト。

## 初期対象（低リスク）
- Parameterized 候補:
  - `src/utils/__tests__/previewAudioTracks.test.ts`
  - `src/utils/__tests__/lipSyncExport.test.ts`
  - `src/features/export/__tests__/plan.test.ts`（解像度正規化系）
- Shared helper 候補:
  - `src/utils/__tests__/exportSequence.test.ts`
  - `src/utils/__tests__/exportAudioPlan.test.ts`
  - `src/utils/__tests__/gate5AudioParity.test.ts`
  - `src/store/__tests__/useEmbeddedAudioStore.test.ts`
  - `src/store/__tests__/audioBindingDisplayName.test.ts`
  - `src/store/__tests__/cutRuntimeState.test.ts`

## 保持対象（統合禁止）
- `src/utils/__tests__/sceneOrder.test.ts`
- `src/utils/__tests__/timelineOrder.test.ts`
- `src/utils/__tests__/storyTiming.test.ts`
- `src/utils/__tests__/exportSequence.test.ts`（Gate観点の回帰ケース）
- `src/utils/__tests__/gate5AudioParity.test.ts`
- `src/utils/__tests__/framingParity.test.ts`
- `src/store/__tests__/timelineIntegrityCommands.test.ts`

## Done 条件
- 統合後も、失敗したときに「どの Gate / どの分岐が壊れたか」をテスト名で判別できること。
- 1PRごとに変更範囲を小さくし、回帰時に切り戻しやすい差分にすること。

## 実行順（Startpoint）
1. `previewAudioTracks` と `lipSyncExport` を `it.each` 化。
2. `exportAudioPlan` / `exportSequence` / `gate5AudioParity` の fixture helper を共通化。
3. `store` テストの `initializeProject` / asset 定義を helper 化。
4. Gate 直結テスト群は名称とアサーションを維持したまま据え置く。

## 実施ログ
- 2026-02-21:
  - `previewAudioTracks` / `lipSyncExport` / `features/export/plan` の低リスクケースを `it.each` 化。
  - `utils` テスト向けに shared helper（asset map / scene attach metadata）を追加し、`exportAudioPlan` / `exportSequence` / `gate5AudioParity` の重複 fixture を縮退。
  - `store` テスト向けに shared helper（single scene 初期化 / 共通 asset）を追加し、`useEmbeddedAudioStore` / `audioBindingDisplayName` / `cutRuntimeState` の初期化重複を縮退。
  - `timelineIntegrityCommands` など Gate 直結テストの名称・アサーションは据え置き。
- 検証:
  - `npm test -- src/utils/__tests__/previewAudioTracks.test.ts src/utils/__tests__/lipSyncExport.test.ts src/features/export/__tests__/plan.test.ts src/utils/__tests__/exportSequence.test.ts src/utils/__tests__/exportAudioPlan.test.ts src/utils/__tests__/gate5AudioParity.test.ts src/store/__tests__/useEmbeddedAudioStore.test.ts src/store/__tests__/audioBindingDisplayName.test.ts src/store/__tests__/cutRuntimeState.test.ts`
  - `npm run check:gate:strict`
