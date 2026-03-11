# Electron 40 事前スモーク / 障害追跡

この文書は 2026-03-12 に `docs/guides/implementation/` から archive へ移動した。
Electron 40 事前確認の時限メモとして保持し、現行 L2 guideline の正本とはしない。

**目的**: Electron 40系アップグレード前に、起動〜ロード〜プレビュー〜エクスポートの最低限スモークと、クラッシュ原因追跡の採取点を固定する。  
**適用範囲**: `electron/main.ts`, `electron/preload.ts`, `src/main.tsx` のログ/例外収集と手動確認手順。  
**関連ファイル**: `electron/main.ts`, `electron/preload.ts`, `src/main.tsx`, `src/hooks/useHeaderProjectController.ts`, `src/components/PreviewModal.tsx`, `src/components/ExportModal.tsx`。  
**更新頻度**: Electron メジャー更新時、およびクラッシュ調査導線の変更時。

## Must / Must Not
- Must: 重要経路（`load-project`, `load-project-from-path`, `export-sequence`）の開始/成功/失敗を main プロセス永続ログに残す。
- Must: main プロセスの `uncaughtException` / `unhandledRejection` を永続ログに残す。
- Must: renderer の `window.error` / `window.unhandledrejection` を main に送って永続ログ化する。
- Must Not: クラッシュ時の情報を DevTools コンソールのみに依存しない。
- Must Not: ffmpeg stderr 全量を無制限に永続化しない（既存リングバッファ方針を維持する）。

## 1. スモーク手順（最小）
1. `npm run dev` で起動する。
2. 起動直後にトップ画面が表示されることを確認する。
3. 既存 `project.sdp` を `Load Project` から開く。
4. タイムラインで任意の Cut を選び、プレビュー再生を 5 秒以上実行する。
5. プレビュー停止後、`Export` から MP4 を書き出す。
6. 書き出し完了後、出力 MP4 の存在と再生可否を確認する。

## 2. ログ採取ポイント（クラッシュ追跡の最小セット）
- main 永続ログ: `app.getPath('userData')/logs/runtime.log`
- renderer 例外: `window.error`, `window.unhandledrejection` -> `renderer-error-report` IPC 経由で `runtime.log` へ集約
- main 例外: `process-uncaught-exception`, `process-unhandled-rejection`
- プロセスクラッシュ: `render-process-gone`, `child-process-gone`, `webcontents-unresponsive`
- 主要フロー:
  - プロジェクトロード: `load-project-*`, `load-project-from-path-*`
  - エクスポート: `export-sequence-start/success/failed`, `export-sequence-concat-failed`, `export-sequence-audio-mix-failed`

## 3. 障害切り分けの見方（最小）
1. `runtime.log` の末尾から `ERROR` を確認する。
2. `renderer-error-report` が先行している場合は UI 操作起因を優先調査する。
3. `export-sequence-start` があるのに `export-sequence-success` が無い場合は ffmpeg 系失敗（concat / audio mix / ffmpeg missing）を優先調査する。
4. `load-project-*` 失敗時は対象 `.sdp` の破損またはパス不整合を優先確認する。

## 4. 追加メモ（運用）
- `runtime.log` は JSON Lines 形式（1行1イベント）。
- ログ肥大化時は手動ローテーションで十分（開発中のため自動ローテーションは未導入）。
