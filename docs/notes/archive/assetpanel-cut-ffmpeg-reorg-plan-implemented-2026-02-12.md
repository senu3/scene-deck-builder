# AssetPanel Cut廃止 + ffmpeg整理 計画（2026-02-12）

## 目的
- AssetPanel の右クリック導線を `Asset options` に統一し、派生アセット生成（Reverse/音声抽出）を一貫した操作にする。
- ffmpeg 系操作（finalize mp4 など）の実装境界を整理し、新機能（音声抽出含む）を追加しやすい構造にする。

## 適用範囲
- `src/components/AssetPanel.tsx`
- `src/components/context-menus/AssetContextMenu.tsx`
- `src/components/context-menus/CutContextMenu.tsx`（Cut option 側の音声抽出追加対象）
- `src/features/cut/actions.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/vite-env.d.ts`
- テスト: `src/features/cut/__tests__/actions.test.ts` および ffmpeg IPC 周辺の追加テスト

## 関連ファイル
- `docs/guides/cut-history.md`
- `docs/guides/media-handling.md`
- `docs/guides/export.md`
- `docs/notes/archive/cut-refactor-plan-implemented-2026-02-12.md`

## 更新頻度
- 中

## 要件整理（今回）
1. AssetPanel の右クリックメニューから `Cut options` を廃止し、`Asset options` に統一する。
2. `Asset options` から Reverse を実行可能にする。
3. AssetPanel から Reverse した場合は「新規 Cut を作らず」、派生アセットのみ追加する。
4. `Cut options` と `Asset options` の双方に音声抽出機能を追加する。
5. `Cut options` 側の音声抽出は clip 範囲（IN/OUT）を尊重し、カードは作成しない。
6. ffmpeg 系実装を拡張しやすいように現仕様を点検し、必要な整理を行う。

## 現状確認（実装）
- `AssetPanel` は「cut が見つかるアセット」を右クリックすると `CutContextMenu`、未使用時のみ `AssetContextMenu` を表示している。
- `AssetContextMenu` は現状 Delete のみ。
- Reverse/Finalize Clip は `finalizeClipFromContext` -> `finalizeClipAndAddCut` 経由で「派生 mp4 + Cut追加」前提。
- ffmpeg 呼び出しは `electron/main.ts` に散在し、`finalize-clip` 内にローカル実装された spawn 処理と、共通 `runFfmpeg` が並存している。

## 設計方針
### A. 右クリック導線の統一
- `AssetPanel` のコンテキスト判定を「cut有無」ではなく「常に Asset options を開く」に変更する。
- `Asset options` は対象アセット種別・clip状況に応じて表示項目を出し分ける。
  - video + clip範囲あり: `Finalize Clip (Asset only)` / `Reverse Clip (Asset only)` / `Extract Audio`
  - video + clipなし: `Reverse (Asset only)` / `Extract Audio`
  - audio/image など: 実行可能な項目のみ表示
- 既存の cut 操作（Copy/Paste/Move/Delete/Group）は AssetPanel からは撤去し、CutCard/Details 側に集約する。

### B. 生成結果のモデル分離（Add Cut か Add Asset only か）
- 派生生成の action を「生成物登録モード」で分岐可能にする。
  - `registerMode: 'asset-only' | 'add-cut'`
- AssetPanel からの Reverse/Finalize/Extract は `asset-only` を使用。
- CutCard からの Finalize/Reverse は従来どおり `add-cut` を維持（既存運用互換）。

### C. 音声抽出（新規）
- 新規 IPC 例: `extract-audio`
  - 入力: `sourcePath`, `outputPath`, `inPoint?`, `outPoint?`, `format`（暫定: `wav`）
  - clip指定がある場合は `-ss/-t` で範囲抽出
  - clipなしは全体抽出
- `Cut options` からの実行: `CutCard` 側メニューを対象に clip範囲優先、`add-cut` しない（asset-only 登録のみ）
- `Asset options` からの実行: asset全体 or clip範囲（対象情報がある場合）を抽出し、asset-only 登録
- 既定フォーマットは `wav`。

### D. ffmpeg 操作整理（拡張準備）
- `electron/main.ts` の ffmpeg 実行を共通 runner に寄せる。
  - 実行キュー選択（light/heavy）
  - stderr制御
  - 終了コード/エラー整形
  - 出力ファイル存在・サイズ確認
- 各IPC (`finalize-clip`, `extract-video-frame`, `crop-image-to-aspect`, `export-sequence`, `precompose-lipsync-frames`, 新規`extract-audio`) は runner を利用する薄いハンドラへ寄せる。
- `features/*/actions` 側は「ffmpeg処理呼び出し」と「登録（asset/cut）」を分離し、UIごとに再利用可能にする。

## 実装フェーズ案
1. **Phase 1: UI統一**
- AssetPanel で `CutContextMenu` 呼び出しを停止し、`AssetContextMenu` を拡張。
- Asset options に Reverse/Finalize/Extract Audio 項目を追加（種別に応じて表示）。
- AssetPanel での既存 delete 挙動は維持。
ステータス: 完了（2026-02-12）
補足: Reverse/Finalize/Extract Audio の実処理は Phase 2/3 で実装。Phase 1 時点では UI 導線のみ提供。

2. **Phase 2: action分離**
- `finalizeClipAndAddCut` をベースに「派生アセット登録のみ」関数を追加。
- 既存 `finalizeClipFromContext` は互換維持しつつ内部を共通化。
- Reverse の AssetPanel 導線を asset-only に切替。
ステータス: 完了（2026-02-12）
補足: AssetPanel の `Finalize Clip (Asset Only)` も同じ `asset-only` 経路へ接続済み。`Extract Audio` は Phase 3。

3. **Phase 3: 音声抽出**
- main/preload/type に `extract-audio` IPC を追加。
- renderer 側に `extractAudioAndRegisterAsset`（仮）を実装。
- `CutContextMenu` / `AssetContextMenu` 双方に接続（いずれも card作成なし）。
ステータス: 完了（2026-02-12）
補足: Cut options は `CutCard` 側に実装。clip 時は IN/OUT 範囲、非clipは全体抽出。

4. **Phase 4: ffmpeg再編**
- ffmpeg runner 共通化、重複spawn削減。
- エラーメッセージ規約・返却型を統一。
- 既存機能の回帰確認（finalize/export/thumbnail/lip-sync precompose）。
ステータス: 完了（2026-02-12）
補足: `finalize-clip` / `extract-audio` / `extract-video-frame` / `export-sequence` concat を共通 runner 経路へ統一。

## 受け入れ条件
- AssetPanel 右クリックで `Cut options` が出ない。
- AssetPanel から Reverse 実行時、Timeline に Cut が増えず `.index.json` にアセット登録される。
- 音声抽出が `Cut options` / `Asset options` から実行でき、Cut追加は発生しない。
- clip付き対象は IN/OUT に一致した音声長になる。
- ffmpeg系 IPC の実装が共通 runner 利用に揃い、新規操作追加時の差分が局所化される。

## テスト方針
- Unit:
  - action 層で `asset-only` と `add-cut` の分岐を検証。
  - 音声抽出パラメータ（clip有無で `-ss/-t`）の組み立てを検証。
- Integration:
  - AssetPanel 右クリック -> Reverse/Extract Audio 実行 -> Asset増加、Cut不変。
  - CutContextMenu から Extract Audio 実行 -> Asset増加、Cut不変。
- Regression:
  - 既存 Finalize Clip (Add Cut) の挙動とグループ同期が維持される。
  - export-sequence / precompose-lipsync-frames の失敗時エラーメッセージ品質が維持される。

## リスクと対策
- リスク: AssetPanel から cut操作を除去した際に既存運用ショートカットが不足する。
  - 対策: CutCard/Details の導線強化を同時に確認し、ガイド更新を同期。
- リスク: ffmpeg runner 共通化で既存IPCのエラー文言/戻り値が変わる。
  - 対策: 返却型の互換レイヤーを残し、UI表示文言は段階移行。
- リスク: 音声抽出フォーマット確定前に実装すると将来互換が崩れる。
  - 対策: format引数を持たせ、まず `wav` を既定化。

## 決定事項（2026-02-12）
1. `Cut options` への音声抽出追加は `CutCard` 側メニューを対象とする（AssetPanel の Cut options は廃止方針）。
2. 音声抽出の既定フォーマットは `wav`。
3. 音声抽出結果アセットの命名規則は finalize/reverse と同一規約に統一する。

## 将来案件メモ
- 音声アセット向け `Asset options` に、`mp3 -> wav` / `wav -> mp3` 変換メニュー追加を検討する。
