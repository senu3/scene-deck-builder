# Autosave / Snapshots

**目的**: 自動保存とスナップショットの現行仕様を明文化する。
**適用範囲**: Renderer の autosave 実装、Electron の flush、設定UIの現状。
**関連ファイル**: `src/hooks/useHeaderProjectController.ts`, `src/utils/autosave.ts`, `electron/main.ts`, `electron/preload.ts`, `src/components/EnvironmentSettingsModal.tsx`, `docs/notes/archive/autosave-toast-notes.md`。
**更新頻度**: 中。

## Autosave（現行）
- 有効条件は `projectLoaded === true` かつ `vaultPath` が存在し、`VITE_DISABLE_AUTOSAVE=1` ではないこと。
- 変更検知は `subscribeProjectChanges` が `ProjectSaveSnapshot` をシリアライズ比較して行う。
- 保存トリガーは 1000ms デバウンス。保存中の変更は pending として1回にまとめる。
- 保存先は `vaultPath/project.sdp` 固定で、通知なし・recent更新なし・Scene ID 自動付与の確認なしで保存する。
- 失敗時は `autosave-failed` の toast を1回のみ表示し、成功時にリセットされる。

## アプリ終了時の flush（デスクトップ）
- Electron 側は autosave が有効なときだけ、ウィンドウ close をフックして `autosave-flush-request` を送る。
- Renderer は `useHeaderProjectController` で request を受けて autosave を実行し、`autosave-flush-complete` を返す。
- 5秒でタイムアウトし、未完でも終了する。

## Snapshot（現行 / TODO）
- `ProjectSaveSnapshot` は「変更検知」用のインメモリ snapshot であり、永続化されない。
- 設定UIの `Snapshot` 系トグルと最大数は存在するが、保存先や履歴管理には未接続。
- スナップショットのファイル構造・保持数・復元UXは未実装（TODO）。

## 設定UIの現状（注意）
- Autosave の ON/OFF と interval は UI で切り替え可能だが、保存先や interval は現在実装に反映されない（TODO）。
