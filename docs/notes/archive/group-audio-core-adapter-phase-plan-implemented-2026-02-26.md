# GroupAudio 導入計画（共通コア + スコープ別アダプタ, 2026-02-25）

## 目的
- AttachAudio / SceneAudio / GroupAudio を共通コアで扱い、スコープ差分は薄いアダプタへ分離する。
- 現行の SceneAudio 排他挙動（video cut の attach 解除 + `useEmbeddedAudio=false` 強制）を撤廃し、Mix 前提へ移行する。
- Preview/Export parity を維持したまま GroupAudio を追加する。

## 先に確定した方針
- GroupAudio の保存先: `metadataStore.sceneMetadata[sceneId]` 配下（推奨案採用）。
- GroupAudio の再生意味: group 所属 cut 上だけ鳴らす。
- `sourceType` 拡張: 実施する（`group-attach` を追加）。

## 現状差分（実装起点）
- `SetSceneAttachAudioCommand` は SceneAudio 設定時に video cut の `audioBindings` を空にし、`useEmbeddedAudio=false` を強制している。
- `buildExportAudioPlan` は `video` / `cut-attach` / `scene-attach` のみを生成する。
- Asset 参照グラフは `scene-audio` までしか持たず、GroupAudio 参照が未管理。

## Phase 1: SceneAudio の Mix 化（排他挙動撤廃）
### 目的
- 既存仕様を GroupAudio 導入前に Mix 前提へ合わせる。

### 変更
1. `SetSceneAttachAudioCommand` を「scene binding 更新のみ」に縮退。
2. Details の確認ダイアログ文言から「cut attach を解除」「動画音声をOFF」を削除。
3. 既存テスト（timelineIntegrityCommands）の期待値を Mix 仕様へ更新。

### Done Criteria
- SceneAudio 設定で cut 側 `audioBindings` と `useEmbeddedAudio` が不変。
- Undo/Redo で scene binding のみ往復する。
- Export/Preview の音声イベントに回帰がない（既存の `useEmbeddedAudio` 仕様は維持）。

## Phase 2: 共通 AudioBinding コア導入（型/変換の土台）
### 目的
- Cut/Scene/Group を同型で扱える内部モデルを先行導入する。

### 変更
1. 共通コア型（例: `AudioBindingCore`）を追加:
- `assetId`
- `enabled`
- `gain?`
- `offsetSec?`
2. スコープ別アダプタを追加:
- `CutAudioBinding` <-> `AudioBindingCore`
- `SceneAudioBinding` <-> `AudioBindingCore`
- （Phase 3 で追加する）GroupAudioBinding <-> `AudioBindingCore`
3. 既存永続フォーマットは即時破壊せず、アダプタで吸収する。

### Done Criteria
- `exportAudioPlan` 側が「スコープ個別型」に依存せず、共通型経由でイベント化できる準備が完了。
- 既存 project/metadata のロード互換を維持。

## Phase 3: GroupAudio 永続化と Command 境界追加
### 目的
- GroupAudio のデータ正本を導入し、更新入口を固定する。

### 変更
1. 保存先を追加（scene metadata 配下）:
- 例: `sceneMetadata[sceneId].groupAudioBindings[groupId]`（単数 or 複数はここで確定）
2. `GroupAudioBinding` 型・metadata 更新ユーティリティ・store contract を追加。
3. Command 追加:
- Set/Detach GroupAudio
- Enable 切替
- （必要なら）gain/offset 更新
4. Group 削除時・cut 移動時の整合処理:
- 存在しない groupId の GroupAudio を正規化で除去。

### Done Criteria
- GroupAudio 更新が単一 API/Command 経由で実行される。
- group 削除後に dangling な GroupAudio が残らない。
- metadata 保存/再読込で GroupAudio が復元される。

## Phase 4: 単一入口 `buildExportAudioPlan` へ GroupAudio 統合
### 目的
- Cut/Scene/Group すべてを同じイベント列に収束させる。

### 変更
1. `ExportAudioEvent.sourceType` に `group-attach` を追加（renderer/preload/main すべて同期）。
2. GroupAudio を「group 所属 cut 上だけ鳴る」イベントへ展開:
- group の各 cut について cut timing を取得し、`timelineStartSec` / `durationSec` を cut 単位で生成。
- 連続区間化は初期実装では行わず、まず正確性優先で cut 単位イベントを採用。
3. `renderMixedAudioTrack` は `sourceType` 非依存のため、ログ/型のみ更新。

### Done Criteria
- Preview sequence / Export の両方で `group-attach` が同一時刻に鳴る。
- `useEmbeddedAudio=false` は引き続き video 音声のみに作用する。
- scene/cut/group の同時ミックスが成立する。

## Phase 5: 参照グラフ・削除ポリシー・テスト強化
### 目的
- 運用時の参照整合と回帰検知を完成させる。

### 変更
1. `AssetRefKind` に `group-audio` を追加し、参照収集へ GroupAudio を反映。
2. asset 削除時の metadata クリーンアップで GroupAudio 参照も除去。
3. テスト追加/更新:
- `exportAudioPlan`（group-attach 生成、enabled/gain/offset）
- parity 系（Preview/Export 同一入力での一致）
- metadata hydration/load/save（GroupAudio 復元）
- Command undo/redo（GroupAudio）

### Done Criteria
- GroupAudio 参照中 asset は削除ブロックされる（または policy 通りに処理される）。
- 主要ユースケースで回帰テストが通る。

## docs 更新計画（実装完了時）
1. `docs/references/DOMAIN.md`
- Scene metadata の保持項目に GroupAudio を追加。
2. `docs/references/MAPPING.md`
- GroupAudio 行を追加（型/ストア/UI の主経路）。
3. `docs/guides/implementation/export-audio-mix.md`
- `group-attach` のイベント生成ルールを追記。
4. 必要なら ADR 追加
- 音声スコープ統合の破壊的判断（SceneAudio 排他撤廃 + GroupAudio 導入）を記録。

## リスクと回避策
1. リスク: Group が非連続 cut を含む場合に「group 範囲全体再生」だと意図しない無音区間/過再生が起きる。
- 回避: cut 単位イベント展開を正本にする（本計画採用）。
2. リスク: 既存 UI が primary binding 前提の箇所を持つ。
- 回避: 初期フェーズは UI の挙動を変えず、export/preview の計画入口統一を優先する。
3. リスク: 型追加漏れ（renderer/preload/main 間）。
- 回避: `ExportAudioEvent` 定義の3箇所を同時更新し、型エラーで検出する。

## 実装結果サマリ（2026-02-26）
### 完了
1. Phase 1 完了（SceneAudio Mix 化）
- `SetSceneAttachAudioCommand` から排他処理を撤廃し、scene binding 更新のみに変更。
- Details の SceneAudio 設定時確認ダイアログを削除。

2. Phase 2 完了（共通コア + アダプタ）
- `AudioBindingCore` を追加。
- Cut/Scene のアダプタを追加し、export 側の変換経路を共通化。

3. Phase 3 完了（GroupAudio 永続化 + Command 境界）
- `SceneMetadata.groupAudioBindings` を追加。
- `SetGroupAttachAudioCommand` と store API を追加。
- group 削除/統合時の dangling binding クリーンアップを追加。

4. Phase 4 完了（Export plan 統合）
- `ExportAudioEvent.sourceType` に `group-attach` を追加。
- GroupAudio を group 所属 cut 単位のイベントとして展開。

5. Phase 5 完了（参照グラフ/削除ポリシー/テスト）
- `AssetRefKind` に `group-audio` を追加し、参照収集と削除保護を対応。
- metadata/load-save・command undo/redo・export/parity 系テストを追加/更新。

### 追加実装（計画外だが実施済み）
1. Group 選択時の DetailsPanel に `Group Audio` ボタン/表示を追加（SceneAudio と同デザイン）。
2. AssetModal（audio）経由で GroupAudio の設定・置換・解除を接続。

### 保留
1. GroupAudio の `enabled/gain/offset` を操作する UI（AttachAudio 既存UIとの整合検討待ち）。
