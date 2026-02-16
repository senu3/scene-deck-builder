# Cut Refactor Plan (Archived)

このノートは実装履歴としてアーカイブ済みです。現行運用は以下を参照してください。
- `docs/notes/archive/store-slice-plan-implemented-2026-02-12.md`
- `docs/guides/implementation/cut-history.md`

**目的**: Cut 周りの責務過多・重複実装・整合性リスクを段階的に解消し、Export 実装を安全に進められる状態を作る。  
**適用範囲**: `CutCard` / `AssetPanel` / `useStore` の Cut 操作 / Group 同期 / 履歴（Command）境界。  
**関連ファイル**: `src/components/CutCard.tsx`, `src/components/AssetPanel.tsx`, `src/store/useStore.ts`, `src/store/commands.ts`, `src/utils/assetPath.ts`, `docs/guides/export.md`。

## 結論（優先順位）
1. **Framing 設定 + Export を先行**してよい。  
2. ただし、Export 先行時に最低限必要な Cut 整備（薄い前処理）だけ先に入れる。  
3. 大規模な Cut リファクタ本体は Export の最初の動線が安定した後に着手する。

理由:
- 現在の最重要価値は「書き出し結果の一貫性（preview/export整合）」で、Framing/Export が直接それを決める。  
- Cut 全面リファクタを先行すると期間が長くなり、Export の意思決定が遅れる。  
- ただし現状の Cut 実装は重複が多く、Export 実装中に改修負債が増えやすいので「最小ガード」は先に必要。

## 先に入れる最小ガード（Export 前）
1. Cut の副作用処理を薄く共通化する。
   - `finalize clip` / `crop image` / `import -> add cut` / `group追随` を共通関数へ集約。
   - UI コンポーネントから Electron/Vault 直呼びを減らす。
2. フィードバック方式を統一する。
   - Cut 操作の成功/失敗は `useToast` + `useDialog` に統一。
   - `alert/confirm` の直接利用を廃止方針へ。
3. Save/Load の資産パス整合テストを固定する。
   - `path` と `vaultRelativePath` の優先順位不具合を再発防止。

## フルリファクタの到達像
1. `CutCard` は表示とイベント発火に限定（副作用なし）。
2. Cut 操作は `features/cut/actions` に集約し、UIから共通呼び出し。
3. Group 同期ロジックは `utils/cutGroupOps` に一本化。
4. 履歴対象操作（Undo/Redo対象）を Command 経由へ統一。
5. `Cut` の永続データと runtime 状態（loading など）を分離。
6. `useStore` を slice 化（cut/group/history境界を明確化）。

## 段階計画

## 実装進捗（2026-02-11）
- Phase 0-1: `finalize clip` の重複副作用を `src/features/cut/actions.ts` へ共通化。
- Phase 0-2: `CutCard` / `AssetPanel` の finalize 系フィードバックを `useToast` + `useDialog` に統一開始。
- Phase 0-3: save/load 資産パス整合の回帰テストを追加済み（`assetPath`）。
- Phase 0-4: `crop image` の副作用も action 層へ移管（`cropImageAndAddCut`）。
- Phase 0-5: `AssetPanel` の delete 系フィードバックを `useToast` + `useDialog` に移行。
- Phase 0-6: crop/finalize 生成物が `assets/` 内再取り込みで hash 名へ再命名される問題を修正。`importFileToVault` は `assets/` 内ファイルを再インポートせず、既存ファイル名のまま index 登録する方針に変更。
- Phase 2-1 (2026-02-12): `CutCard` / `AssetPanel` に重複していた選択 Cut の delete / move 副作用を `features/cut/actions` の共通関数 (`removeCutsFromScenes`, `moveCutsToSceneEnd`) に移管。
- Phase 2-2 (2026-02-12): Group 追随ロジックの共通化を開始。`src/utils/cutGroupOps.ts` を追加し、`removeCut` / `moveCutToScene` / `moveCutsToScene` の group 整合更新に適用。複数 cut 移動時の group 参照残りを修正。
- Phase 2-3 (2026-02-12): `finalize clip` 実行前提チェックと実行導線を `finalizeClipFromContext` として action 層へ追加し、`CutCard` / `AssetPanel` の重複を削減。
- Phase 2-4: 検討中のため実装保留（次フェーズ候補/TODOへ移行）。
- Phase 3-1 (2026-02-12): `CutRuntimeState` 導入に着手。loading 状態を `useStore.cutRuntimeById` へ分離し、`CutCard` は runtime 状態を優先参照。
- Phase 3-2 (2026-02-12): `CutCard` / `AssetPanel` の delete / move を `RemoveCutCommand` / `MoveCutsToSceneCommand` 経由へ移行し、直接 store 更新を削減。
- Phase 3-3 (2026-02-12): `App` の「タイムライン外ドロップ削除」を `RemoveCutCommand` 経由へ移行し、直接 `removeCut` 呼び出しを削減。
- Phase 3-4 (2026-02-12): `Cut` 永続モデルから loading フィールドを型レベルで除外。旧データの loading 情報は normalize で破棄し、runtime 状態へ一本化。
- Phase 3-5 (2026-02-12): DnD 後の group 追随更新を `RemoveCutFromGroupCommand` / `UpdateGroupCutOrderCommand` 経由へ移行し、`CutCard` の group 除外も Command 化。

## 方針メモ（2026-02-12）
- `AssetPanel` から Cut オプションは将来的に廃止し、アセットオプション拡充へ移行する。
- ただし `features/cut/actions` の UI 非依存ロジック（delete/move など）は維持する。`CutCard` 単独運用や将来のショートカット/一括操作でも再利用するため。

### Phase 0: Guard Rails（先行・小規模）
1. Cut副作用ヘルパー追加（既存呼び出しの薄い置換）。
2. feedback API 統一（toast/dialog）。
3. 保存復元系の回帰テスト追加。

**受け入れ条件**
- 既存機能の挙動差が出ない。  
- crop/finalize 後の cut 追加が安定。  
- crop/finalize 生成ファイルが意図した命名のまま維持される。  
- save/load 後に loading が残らない。

### Phase 1: Export + Framing 実装
1. Preview/Export で同一 framing パラメータ適用。
2. Free 時既定値（現在: `1280x720`）を単一参照へ。
3. LipSync / VideoClip と framing の整合検証。

**受け入れ条件**
- preview と export の見た目差分が仕様内。  
- 時系列整合性（scene/cut order）を維持。

### Phase 2: Cut 操作共通化
1. `CutCard` / `AssetPanel` の重複ロジック撤去。
2. `features/cut/actions` へ移管。
3. Group 追随処理の共通化。
4. `AssetPanel` の Cut オプション廃止計画を段階適用（Cut 操作 UI を縮退し、アセット操作へ集約）※検討中のため次フェーズ候補。

**受け入れ条件**
- finalize/crop の実装が1箇所。
- UI 層での副作用重複が消える。

### Phase 3: データモデル整理
1. `CutRuntimeState` 導入（loading等を永続モデルから分離）。
2. `useStore` slice 分割。
3. Command 境界の明確化・直接更新の削減。

**受け入れ条件**
- Cut 型の分岐数が減る。  
- Undo/Redo の対象範囲が明文化される。

## Undo/Redo 対象（現状）
- 対象: scene/cut の追加・削除・移動・並び替え、clip point 更新、group 作成/解除/名称変更、group 内 cut 順序更新、group からの cut 除外。
- 非対象: 進行中 import の runtime 状態（`CutRuntimeState`）、サムネイルキャッシュ、Export 進捗 UI。
- 方針: Timeline 構造を変える操作は Command 経由を原則とし、直接 store 更新は段階的に削減する。

## リスクと対策
1. **Export先行で負債が増える**  
対策: Phase 0 を先に必須化し、重複経路を増やさない。
2. **リファクタで動作回帰**  
対策: Phase ごとにテスト固定（cut追加・group同期・save/load）。
3. **仕様ブレ（Framing/Resolution）**  
対策: 既定値と適用順（crop -> framing -> export）を docs で固定。
4. **生成アセットの命名が保存時に崩れる**  
対策: 「`assets/` 内生成物は再インポートしない」を共通規約化し、`assetPath` テストで固定。

## 直近アクション（推奨）
1. Phase 0 のタスクを issue 化（1日以内で終わる粒度）。
2. そのまま Framing/Export 実装へ着手。
3. Export 初版が通った時点で Phase 2 に入る。

## 追加監査と修正（2026-02-12）

### チェック結果（見落とし候補）
1. Move は複数シーン選択が混在したまま実行できる余地があった。
2. Delete は選択件数分の `RemoveCutCommand` を逐次実行し、Undo が N ステップになっていた。
3. 複数選択時にも `Remove from Group` が表示されるが、実装は単一 cut 除外のみだった。
4. `CutCard` のサムネイル読み込み `useEffect` に非同期キャンセルガードがなかった。

### 対応内容
- `RemoveCutsCommand` を追加し、複数削除を 1 コマンドに集約（Undo も 1 ステップ化）。
- `CutCard` / `AssetPanel` の Move は「コンテキスト元シーンの選択 cut のみ」を対象に制限し、混在時は toast で通知。
- `CutContextMenu` の `Remove from Group` は複数選択時も表示し、同一グループ内の選択 cut を一括除外する挙動へ変更。
- `CutCard` のサムネイル読み込み effect にキャンセルフラグを追加し、古い非同期結果の上書きを抑止。
