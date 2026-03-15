# Autosave / Snapshots

**目的**: 自動保存とスナップショットの現行仕様を明文化する。
**適用範囲**: Renderer の autosave 実装、Electron の flush、設定UIの現状。
**関連ファイル**: `src/hooks/useHeaderProjectController.ts`, `src/utils/autosave.ts`, `electron/main.ts`, `electron/preload.ts`, `src/components/EnvironmentSettingsModal.tsx`, `docs/notes/archive/autosave-toast-notes.md`。
**更新頻度**: 中。

## Must / Must Not
- Must: autosave の保存先は `vaultPath/project.sdp` を正本として維持する。
- Must: close guard は「最後に永続化成功した snapshot」と現在の保存対象 snapshot を比較して判定する。
- Must: close 時 flush は request/complete ハンドシェイクを維持する。
- Must: 失敗 toast の重複抑止（`autosave-failed`）を維持する。
- Must Not: autosave 失敗をサイレントで握りつぶさない。
- Must Not: snapshot 機能を仕様未定のまま断片実装しない。

## Autosave（現行）
- 有効条件は `projectLoaded === true` かつ `vaultPath` が存在し、`VITE_DISABLE_AUTOSAVE=1` ではないこと。
- 変更検知は `subscribeProjectChanges` が `ProjectSaveSnapshot` をシリアライズ比較して行う。
- 保存トリガーは 1000ms デバウンス。保存中の変更は pending として1回にまとめる。
- 保存先は `vaultPath/project.sdp` 固定で、通知なし・recent更新なし・Scene ID 自動付与の確認なしで保存する。
- 失敗時は `autosave-failed` の toast を1回のみ表示し、成功時にリセットされる。
- autosave / manual save 成功時は `lastPersistedSnapshot` を更新し、close guard はその snapshot を基準に未保存判定を行う。

## アプリ終了時の flush（デスクトップ）
- Electron 側は app close 要求時に、まず renderer へ close approval を要求する。
- Renderer は persisted snapshot 基準で close guard を評価し、未保存なら warning confirm を出す。
- close が許可された場合のみ、Electron 側は autosave が有効なときに `autosave-flush-request` を送る。
- Renderer は `useHeaderProjectController` で request を受けて autosave を実行し、`autosave-flush-complete` を返す。
- 5秒でタイムアウトし、未完でも終了する。

## Snapshot（現行）
- `ProjectSaveSnapshot` は「変更検知」用のインメモリ snapshot であり、永続化されない。
- TODO は `docs/TODO_MASTER.md`（`TODO-INVEST-002`）を参照。

## 設定UIの現状（注意）
- TODO は `docs/TODO_MASTER.md`（`TODO-NICE-001`）を参照。
