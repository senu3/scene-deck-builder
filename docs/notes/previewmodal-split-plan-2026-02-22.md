# PreviewModal Split Plan (2026-02-22)

## TL;DR
- `PreviewModal.tsx` は mode 分岐ではなく責務分離で整理する。
- 主眼は「可読性回復」と「state/persistence 密結合の解消」。
- 過剰分割は避け、最小ユニットで段階的に移行する。

## 背景
- `src/components/PreviewModal.tsx` が約3,000行規模となり、再生制御・media source・buffering・audio・UI・export補助・clip UI が同居している。
- 既存不具合調査で、state と persistence（`onRangeChange`, `onClipSave`, `onClipClear`）の境界が追いにくいことが顕在化した。
- Preview Guide / Gate / ADR の観点で、責務境界を明確化する必要がある。

## 参照した正本
- `docs/guides/preview.md`
- `docs/guides/implementation/gate-checks.md`
- `docs/DECISIONS/ADR-0002-preview-export-parity.md`
- `docs/DECISIONS/ADR-0003-command-boundary.md`
- `docs/DECISIONS/ADR-0004-canonical-timing-api.md`
- `docs/guides/implementation/ui-components.md`

## Must
- Sequence再生は `useSequencePlaybackController` を単一制御面として維持する。
- `sequenceCuts` 指定時はその範囲のみで sequence を構築する。
- Preview/Export parity を壊さない（時間解決・sequence item生成の入口を分岐させない）。
- thumbnail profile は `sequence-preview` を維持する。
- Gate 10 の hotpath 制約（rAF で重処理しない）を維持する。

## Must Not
- mode（single/sequence）で新しい実装重複を増やさない。
- `PreviewModal` 内に新しい persistence 分岐を増やさない。
- displayTime/timing のローカル再計算を再導入しない。

## 分割方針（過剰分割しない）
1. `PreviewModal.tsx` を Composition Root 化
- props受け取り、hook呼び出し、Viewへの値受け渡しだけを残す。

2. Preview Session の封じ込め
- 新規: `src/components/preview-modal/usePreviewSession.ts`
- 再生制御接続、media source切替、buffer/url cache、sequence audio をここに集約。

3. Preview item構築を builder 化
- 新規: `src/components/preview-modal/previewItemsBuilder.ts`
- cut選別・timing計算・item構築を統一し、`sequenceCuts` 制約を入口で保証する。
- thumbnail解決（I/O）も同モジュールで管理し、`PreviewModal` から分離する。

4. clip/range state と persistence の切り分け
- 新規: `src/components/preview-modal/useClipRangeState.ts`
- state 遷移（in/out/clear/constrain/focus）をローカル管理。
- persistence 呼び出し（`onRangeChange`, `onClipSave`, `onClipClear`）は adapter 経由に限定する。

5. View（dumb component）分離
- 新規: `src/components/preview-modal/PreviewModalView.tsx`
- JSX/className/表示条件のみを担当。
- store/electron/domain更新は直接触らない。

6. 最小補助モジュール
- 新規: `src/components/preview-modal/types.ts`
- 必要時のみ `constants.ts` を追加。

7. 操作コマンド層の導入（Single/SequenceのUX整合）
- 新規: `src/components/preview-modal/usePreviewInteractionCommands.ts`（名称は実装時に最終確定）
- ユーザー操作入口（play/pause, seek/skip, in/out, loop, mute, marker操作）を mode 非依存の command API として統一する。
- command 内部で mode 分岐を吸収し、View/Shortcut 側は同一インターフェースのみ参照する。
- `speed` は command 層の対象外（Single 専用の暫定扱い）。

8. 統合優先ルール（過分割抑制）
- 新規 hook を増やす前に、近接責務の hook を「役割クラス」で統合する。
- 優先統合単位:
  - View 系: overlay + viewport + fullscreen（`usePreviewViewShell` 相当）
  - Input 系: keyboard + progress interaction（`usePreviewInputs` 相当）
  - Sequence session 系: mediaSource + buffering + sequenceAudio（`usePreviewSequenceSession` 相当）
- 「操作入口の正本」は `usePreviewInteractionCommands` のみとし、View/Shortcut は command API だけを見る。

9. 過分割ライン判定（統合トリガ）
- 以下のいずれかに当たる hook は統合候補とする:
  - 依存引数が 6 個以上
  - 別 hook の戻り値を 2 つ以上合成している
  - state を持たず effect 1 個のみの薄い wrapper

10. 残タスクA: PreviewModal 内ローカル helper の整理（Audio）
- 対象: `getPrimaryAudioBindingForCut` / `getAttachedAudioForCut` / `getAudioOffsetForCut` / `shouldMuteEmbeddedAudio`
- 方針:
  - hook 化ではなく純関数モジュール `audioBinding.ts` に集約する。
  - 入口は `resolveCutAudioBinding(cut, scene, assets, settings, ...) -> { primary, attached?, offset, muteEmbedded, ... }` を正本とする。
  - 周辺の細分 helper は module private に閉じ、不要な export を増やさない。
- 例外（hook を許容する条件）:
  - 計算が重く `useMemo` 最適化が必要な場合
  - 計算結果を UI state と一体管理する必要がある場合
  - その場合でも `useAudioBinding()` の薄いラッパ 1 個に限定し、内部実装は `audioBinding.ts` を呼ぶ。

11. 残タスクB: Composition Root 最終整理（過分割抑制版）
- `PreviewModal.tsx` に残してよい責務:
  - イベント配線のみ（例: `onClick={() => commands.playPause()}`）
  - View props の整形（命名整列・default 補完）
  - 複数 hook 戻り値の assembly（ロジックを入れない）
- `PreviewModal.tsx` から外へ出す責務:
  - 条件分岐が多い handler（状態に応じて挙動が変わるもの）
  - 複数 state を調停する effect
  - domain 判定（mute/offset 等）
- 外出し時のルール:
  - 新規の薄い hook を増やさず、既存の束へ吸収する（`usePreviewSequenceSession` / `usePreviewViewShell` / `usePreviewInputs`）。

## 実装ステップ
1. 型・定数抽出（挙動無変更）
2. `PreviewModalView` 抽出（見た目無変更）
3. `previewItemsBuilder` 抽出（item構築一本化）
4. `usePreviewSession` 抽出（再生/音声/buffer移管）
5. `useClipRangeState` 導入（state/persistence 分離）
6. `usePreviewInteractionCommands` 導入（操作入口の統一）
7. command API を View/Shortcut に接続（操作入口の正本化）
8. 過分割抑制の統合フェーズ
9. `PreviewModal.tsx` を最終整理（Composition Root 固定）
10. Audio helper を `audioBinding.ts` に集約（正本固定）
11. Composition Root の責務線引き確定（残してよい責務のみを残置）

## 検証観点
- 自動:
  - `npm run test`
  - `npm run check:gate`
- 手動:
  - Free解像度 + 縦長メディアで overlay が画面外に逃げない。
  - `sequenceCuts` 指定時に指定範囲のみ再生される。
  - VIDEOCLIP の set/clear と MiniToast 表示が維持される。
  - IN/OUT 操作時の再生位置・表示・保存の整合が崩れない。
  - command API 経由で Single/Sequence の操作感（play/pause, in/out, loop, mute, marker）が一致する。

## Done Criteria
- `PreviewModal.tsx` が Composition Root として読めるサイズ/責務に縮小している。
- state と persistence の責務境界がファイル単位で追跡可能。
- Gate/Preview parity の既存制約を破らない。
- 既存のVIDEOCLIP/MiniToast/Single+Sequence動作が回帰していない。

## Progress Log
- 2026-02-22 Step 1 着手:
  - `types.ts` / `constants.ts` / `helpers.ts` を新設し、`PreviewModal.tsx` から型・定数・小ヘルパーを分離。
  - 目的は挙動無変更での責務整理開始。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 2 前段:
  - 重複していた解像度セレクタUIを `PreviewResolutionPicker.tsx` に抽出。
  - Full View分離前に、表示責務を段階的に外出しする足場を追加。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 3 実施:
  - `buildPreviewItems` を `previewItemsBuilder.ts` に抽出し、`PreviewModal.tsx` の巨大な items構築 `useEffect` を置換。
  - `sequenceCuts` 優先や canonical timing 利用など、既存ロジックは同一ルールで維持。
  - 影響範囲が再生内容に及ぶため、ここで一旦動作確認フェーズを挟む。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 2 実施（Sequence側）:
  - Sequence Mode の empty/通常描画を `PreviewModalSequenceView.tsx` へ抽出。
  - `PreviewModal.tsx` は Sequence描画の props 組み立てに寄せ、JSX本体の責務を縮小。
  - `npm run build` でビルド成功を確認。
  - 再生・操作系UIのイベント伝搬に関わるため、この地点で手動確認フェーズを挟む。
- 2026-02-22 Step 2 実施（Single側）:
  - Single Mode の描画を `PreviewModalSingleView.tsx` へ抽出。
  - `PreviewModal.tsx` の Single 分岐は props 組み立て中心に変更し、View責務を分離。
  - `npm run build` でビルド成功を確認。
  - Single再生/clip/UI操作に関わるため、この地点で手動確認フェーズを挟む。
- 2026-02-22 Step 4 着手（state/persistence 分離）:
  - `useClipRangeState.ts` を新設し、Singleの in/out state・focused marker・`onRangeChange` 通知を `PreviewModal.tsx` から分離。
  - 既存handlerロジックは維持し、まず state と通知経路のみをhook化。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（marker操作のhook化）:
  - `setMarkerTimeAndSeek` / marker focus/drag/end / progress-bar外クリック解除 / frame単位移動を `useClipRangeState.ts` へ移管。
  - `PreviewModal.tsx` は marker操作の呼び出し側に縮小し、state+操作の責務を集約。
  - `npm run build` でビルド成功を確認。
  - マーカー操作系イベント挙動に関わるため、この地点で手動確認フェーズを挟む。
- 2026-02-22 Step 4 進捗（overlay制御のhook化）:
  - `usePreviewOverlayVisibility.ts` を追加し、overlay の表示/非表示タイマー制御を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` から timeout ref / cleanup effect / show/hide callback を除去。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（viewport責務のhook化）:
  - `usePreviewViewport.ts` を追加し、display領域サイズ計測と解像度viewport計算を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` から `useLayoutEffect` + `displaySize` + `getViewportStyle` 実装を除去。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（sequence派生計算のhook化）:
  - `usePreviewSequenceDerived.ts` を追加し、`previewSequenceItemByCutId` と `previewAudioPlan` の派生計算を `PreviewModal.tsx` から分離。
  - Preview/Export parity に関わる canonical 入力（`normalizedDisplayTime`）は既存ルールを維持。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（fullscreen制御のhook化）:
  - `usePreviewFullscreen.ts` を追加し、fullscreen トグルと状態管理を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` から `requestFullscreen/exitFullscreen` 直接実装を除去。
- 2026-02-22 Step 4 進捗（sequence progress操作のhook化）:
  - `useSequenceProgressInteractions.ts` を追加し、Sequenceの progress drag/hover/mouseup 管理を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` から progress 操作の状態とイベント実装を除去し、hook呼び出しに置換。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（keyboard shortcutのhook化）:
  - `usePreviewKeyboardShortcuts.ts` を追加し、Previewのキーボード操作登録を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` の keydown effect を hook 呼び出しへ置換し、ショートカット割当は既存動作を維持。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（sequence media source切替のhook化）:
  - `usePreviewSequenceMediaSource.ts` を追加し、Sequenceの media source 切替 effect（video/image/lipsync）を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` から該当 effect 実装を除去し、hook戻り値の `sequenceMediaElement` を View へ受け渡す構成に変更。
  - `npm run build` でビルド成功を確認。
  - 再生挙動（source切替・進行・表示）に関わるため、この地点で手動確認フェーズを挟む。
- 2026-02-22 Follow-up fix:
  - Sequence Mode の進行表示で、React の `style` 更新と rAF の直接DOM更新が競合していたため整理。
  - シーケンス再生バーの fill/handle は rAF/effect の単一路で更新し、表示時刻は再生中のみ live time を優先。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Follow-up fix 2:
  - Sequence Mode の動画再生で `displayTime` が再生境界に反映されていなかったため、video source の `outPoint` を canonical duration で制限。
  - `isClip` 指定時は既存の clip out を優先し、非clip動画のみ `clipIn + durationBound` を適用。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Follow-up fix 3:
  - 低い表示高で header が progress/marker クリックを奪うケースを修正。
  - `.preview-header` を `pointer-events: none`、`.preview-close-btn` のみ `pointer-events: auto` にして、ヘッダー透過領域のクリック干渉を解消。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（sequence audio管理のhook化）:
  - `usePreviewSequenceAudio.ts` を追加し、Sequence Mode の event-mix audio manager 管理と再生同期 effect を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` は `previewAudioPlan` を hook に渡す composition に変更し、single/sequence 音声責務の境界を明確化。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（sequence buffering管理のhook化）:
  - `usePreviewSequenceBuffering.ts` を追加し、Sequence Mode の URL cache / preload / buffering 判定 effect を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` は `checkBufferStatus` の利用のみを残し、buffering責務を hook 側へ集約。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（single attached audio管理のhook化）:
  - `usePreviewSingleAttachedAudio.ts` を追加し、Single Mode の attach/scene audio 読み込み・再生同期・音量適用を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` では呼び出しのみ残し、single audio の state/effect 実装を除去して composition を明確化。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（export actionsのhook化）:
  - `usePreviewExportActions.ts` を追加し、full/range export の処理と `isExporting` 管理を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` では export action の呼び出しだけを残し、export処理の責務を composition 外へ移管。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（shared view stateのhook化）:
  - `usePreviewSharedViewState.ts` を追加し、shared派生値（framing/resolution/progress）と埋め込みvideoのvolume/mute同期、progress反映effectを `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` は view props 組み立てを中心にし、shared UI state/effect の責務を hook 側へ集約。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（single media asset読み込みのhook化）:
  - `usePreviewSingleMediaAsset.ts` を追加し、Single Mode の video URL / image thumbnail 読み込みと loading 状態、Single時URL cleanup を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` では `isLoading` と `singleModeImageData` を hook から受け取り、Singleメディア読込責務を移管。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Step 4 進捗（playback controlsのhook化）:
  - `usePreviewPlaybackControls.ts` を追加し、go next/prev, play pause, loop, speed, pauseBeforeExport と sequence rate/buffering 連携 effect を `PreviewModal.tsx` から分離。
  - `PreviewModal.tsx` では keyboard shortcut と view への配線のみを保持し、再生制御ロジックの責務を hook 側へ移管。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Plan update（操作コマンド層の追加）:
  - Single/Sequence の内部実装差を維持しつつ、ユーザー操作入口の一貫性を高めるため `usePreviewInteractionCommands` 導入タスクを計画へ追加。
  - 次フェーズで play/pause, seek/skip, in/out, loop, mute, marker 操作の command API 統一を実施予定。
- 2026-02-22 Plan update（speedの扱い見直し）:
  - Sequence Mode は slideshow 特性上 speed 変更要件が不確実なため、command 層の対象から `speed` を除外。
  - `speed` は当面 Single 専用操作として保持し、Sequence への適用/削除判断は split 完了後の整理フェーズで扱う。
- 2026-02-22 Step 5 進捗（interaction command層の導入）:
  - `usePreviewInteractionCommands.ts` を追加し、play/pause, skip, step, in/out, loop, mute, marker操作を mode 非依存の command API として集約。
  - `PreviewModal.tsx` の keyboard shortcut と Single/Sequence View の操作配線を command API 経由に置換し、操作入口を統一。
  - `speed` は計画どおり command 層に含めず、既存の単独経路（UI/shortcut -> playbackSpeed更新）を維持。
  - `npm run build` でビルド成功を確認。
- 2026-02-22 Plan update（過分割抑制へ方針修正）:
  - Step 4 以降の「薄い hook 増殖」を抑えるため、今後は新規分割より役割統合を優先する方針へ変更。
  - 統合単位（View/Input/Sequence session）と過分割ライン判定（依存数・hook合成数・薄いeffect hook）を追加。
  - 操作入口の正本を `usePreviewInteractionCommands` に固定し、`usePreviewPlaybackControls` などの重複責務は統合対象として扱う。
- 2026-02-22 Plan update（残タスク具体化 3/4）:
  - 残タスク3: Audio 判定 helper 群は `audioBinding.ts` 純関数へ統合し、Audio 正本ロジックを 1 箇所化。
  - 残タスク4: Composition Root 最終整理では「残してよい責務」を明示し、薄い hook 増殖ではなく既存束への吸収を原則化。
- 2026-02-22 Step 8 実施（統合フェーズ先行）:
  - View 系の束: `usePreviewViewShell.ts` を追加し、overlay/viewport/fullscreen の配線を 1 入口へ統合。
  - Input 系の束: `usePreviewInputs.ts` を追加し、keyboard shortcut と sequence progress interaction の呼び出しを 1 入口へ統合。
  - Sequence session 系の束: `usePreviewSequenceSession.ts` を追加し、media source / buffering / sequence audio の配線を 1 入口へ統合。
  - `PreviewModal.tsx` は各束の呼び出し + View props 組み立て寄りに整理（挙動は既存 hook 実装を再利用）。
  - `npm run build` でビルド成功を確認。
