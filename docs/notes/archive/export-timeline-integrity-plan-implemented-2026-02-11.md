# Export Timeline Integrity Plan [Archive]

**目的**: Scene/Cut の時系列整合性を export で破綻させないための不変条件と是正計画を固定する。  
**適用範囲**: `useStore`, `commands`, `App.handleExport`, `projectSave`, 関連テスト。  
**関連ファイル**: `src/store/useStore.ts`, `src/store/commands.ts`, `src/App.tsx`, `src/utils/projectSave.ts`, `src/utils/timelineOrder.ts`, `src/utils/exportSequence.ts`, `src/store/__tests__/*`, `src/utils/__tests__/*`。  
**更新頻度**: 中。  
**現行運用**: `docs/guides/export-guide.md`

## 実装ステータス（2026-02-10）
- A〜D は実装済み。
- 本ドキュメントは「計画 + 実装結果」の記録として維持する。
- 補足（2026-02-11）: 以後の LipSync/VideoClip export 実装でも、本不変条件（順序源単一化・displayTimeガード）は必須要件として継続適用する。

## 背景
- 現状は「配列順」と `order` フィールドの二重管理が混在している。
- 複数cut移動時の順序が「選択順」に依存し、タイムライン順が崩れる可能性がある。
- export は時系列順の厳密性が必須のため、順序決定の単一ルール化が必要。

## 時系列不変条件（Invariant）
1. `Scene` の時系列順は常に `scenes` 配列順と一致し、`scene.order` はそのミラーである。  
2. 各 `Scene.cuts` の時系列順は常に `cuts` 配列順と一致し、`cut.order` はそのミラーである。  
3. export 入力は常に上記時系列順を参照して生成される（順序源が複数あってはならない）。  
4. Undo/Redo 後も 1-3 が維持される。  
5. `displayTime` は export 前に必ず有限正数へ正規化される（`> 0`）。

## 是正方針（決定）

### A. マルチ移動の順序を「選択順」ではなく「時系列順」に固定
- 対象:
  - `src/App.tsx` の `selectedIds` 受け渡し
  - `src/store/useStore.ts` の `moveCutsToScene`
- 対応:
  - `MoveCutsToSceneCommand` 実行前に `selectedIds` を時系列順に正規化して渡す。
  - 正規化ルール:
    - まず `scene.order` 昇順
    - 同一 scene 内は `cut.order` 昇順
  - `useStore.getSelectedCutIds()` は現状のまま（選択順用途を壊さない）。

### B. export の順序源を単一化
- 対象: `src/App.tsx` `handleExport`
- 対応:
  - `scenes.flatMap(...)` の前に時系列正規化した `scenesForExport` を作る。
  - `scene`/`cut` ともに `order` 昇順で明示ソート。
  - 以後 export 系はこの正規化列のみ参照。

### C. Scene 削除 Undo の時系列復元
- 対象: `src/store/commands.ts` `RemoveSceneCommand.undo`
- 対応:
  - 現在の「末尾追加」実装を廃止。
  - `removedSceneIndex` を使い元位置へ復元する。
  - 復元時に全 `scene.order` を再採番。

### D. `displayTime` の export 前ガード
- 対象: `src/App.tsx` `handleExport`
- 対応:
  - 各 item で `displayTime` を検証し、`Number.isFinite(x) && x > 0` 以外は除外または補正。
  - 補正方針（推奨）:
    - `video` なら `asset.duration` が正なら採用
    - それ以外は `1.0` を採用
  - 補正発生時は警告ログを残す。

## 実装ステップ（推奨順）
1. `timeline ordering helper` 追加（Scene/Cut を時系列正規化する純粋関数）。
2. `App.handleExport` を helper 経由に切り替え。
3. `MoveCutsToSceneCommand` 呼び出し前の `selectedIds` 正規化導入。
4. `RemoveSceneCommand.undo` を元インデックス復元へ変更。
5. `displayTime` ガードを export 入力生成へ追加。
6. テスト追加。

## 実装結果（2026-02-10）

### A. マルチ移動順序の固定（実装済み）
- `src/App.tsx`:
  - Multi-select drag で `selectedIds` を `getCutIdsInTimelineOrder` で正規化してから `MoveCutsToSceneCommand` に渡すよう変更。
  - グループ連動 (`removeCutsFromGroups` / `insertCutsIntoGroup`) も同一の正規化順序を使用。
- `src/store/useStore.ts`:
  - `moveCutsToScene` 内でも `getScenesAndCutsInTimelineOrder` を用いて収集順を時系列化。
  - 呼び出し側の入力順に依存しないよう二重化ガード。

### B. export の順序源単一化（実装済み）
- `src/utils/timelineOrder.ts`:
  - Scene/Cut の時系列正規化ヘルパーを追加。
- `src/utils/exportSequence.ts`:
  - export 入力生成ロジックを集約し、必ず時系列正規化済み列を返す。
- `src/App.tsx`:
  - `handleExport` は `buildSequenceItemsForExport(scenes)` のみを参照。

### C. Scene 削除 Undo の時系列復元（実装済み）
- `src/store/commands.ts`:
  - `RemoveSceneCommand.undo` を「末尾追加 + 再構築」から「元インデックス復元」に変更。
  - 復元後に `scene.order` を再採番。
  - `syncSceneMetadata` で metadata を同期。

### D. `displayTime` export 前ガード（実装済み）
- `src/utils/exportSequence.ts`:
  - `Number.isFinite(displayTime) && displayTime > 0` を満たさない場合に補正。
  - 補正ルール:
    - `video` かつ `asset.duration > 0` の場合は `asset.duration`
    - それ以外は `1.0`
  - 補正時は `console.warn` を出力。

## 実装済みテスト
- `src/utils/__tests__/timelineOrder.test.ts`
  - Scene/Cut の時系列正規化
  - 選択順非依存の cutId 正規化
- `src/utils/__tests__/exportSequence.test.ts`
  - export 順序が `order` 規約に従うこと
  - `displayTime` 不正値の補正 + 警告
  - 統合ケースで `order + clip(in/out) + lipsync payload + framing` を同時検証
- `src/store/__tests__/timelineIntegrityCommands.test.ts`
  - `RemoveSceneCommand.undo` の元インデックス復元
  - `moveCutsToScene` が入力ID順でなく時系列順を維持

## テスト計画（全是正対象）

### 1) マルチ移動順序
- ケース:
  - 同一scene内で非連続cutを複数選択して移動
  - 複数scene跨ぎ選択で1sceneへ移動
- 期待:
  - 移動後の順序が時系列順で安定し、選択順に依存しない。

### 2) export順序
- ケース:
  - `scene.order` と配列順が意図的にズレたfixture
  - `cut.order` と配列順がズレたfixture
- 期待:
  - export入力列が `order` 規約に従う。

### 3) Scene Undo復元
- ケース:
  - 中間scene削除 → undo
- 期待:
  - scene が元インデックスに戻り、`scene.order` が再採番される。

### 4) displayTimeガード
- ケース:
  - `NaN`, `0`, 負数, `Infinity`
- 期待:
  - export入力に不正値が残らない。
  - 補正が発生した場合、警告ログが出る。

## 非目標（この計画外）
- ExportPlan v2 の全体導入
- 音声分離ファイル生成ロジック本体（`audio_master`/`audio_lipsync`）
- AttachAudio 個別音量UI（ON/OFFのみ先行可能）

## TODO / 未確定
- `order` を唯一真実源にするか、配列順を真実源にして `order` を派生にするかの最終方針。  
  - 本計画では互換性重視で「両者一致を常に維持」方針を採用。
