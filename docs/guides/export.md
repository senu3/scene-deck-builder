# Export Guide

## TL;DR
対象：Export 計画解決と出力実行境界
正本：`SequencePlan`
原則：
- Export は `SequencePlan` を消費する
- Preview/Export parity を壊さない
- Export は domain 構造を変更しない
- 実装詳細は `implementation/` / `notes/` へ分離する

**目的**: 「見たまま書き出す」を Export 側で壊さないために、Export 固有の責務境界を固定する。  
**適用範囲**: export action / export adapter / IPC・main process 実行境界 / sidecar 出力。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/vault-assets.md`, `docs/guides/media-handling.md`, `docs/guides/implementation/export-audio-mix.md`, `docs/DECISIONS/ADR-0002-preview-export-parity.md`, `docs/DECISIONS/ADR-0004-canonical-timing-api.md`, `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md`, `docs/DECISIONS/ADR-0006-store-io-boundary-policy.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: Export 入力の正本は `SequencePlan` とする。
- Must: `SequencePlan` は Preview と共通の時系列解決入口から生成する。
- Must: Export は Plan を消費して出力形式へ変換する側とし、時間定義を持たない。
- Must: Export は domain state / timeline 構造を変更しない。
- Must: Preview と Export は同一の parity 条件を維持する。
- Must: warnings / diagnostics は structured に扱い、返り値へ集約する。
- Must: 重い処理は export 実行境界へ寄せ、Plan 生成や再生経路へ混ぜない。
- Must Not: raw cut / `PreviewItem` から export 用 timing を再構成しない。
- Must Not: Export 側で canonical timing / clip / hold / mute を独自再解釈しない。
- Must Not: Preview だけ / Export だけに parity 影響変更を入れない。
- Must Not: Vault index / metadata / trash を Export 経路から直接更新しない。

## 境界ルール
- Export が担当:
  - `SequencePlan` の消費
  - 出力形式向け変換
  - IPC / main process 実行境界への受け渡し
  - export result の warning / error 集約
- Export が担当しない:
  - `SequencePlan` の正規化ルール決定
  - Preview 再生制御
  - Timeline 構造変更
  - Vault 書き込みポリシー

## SequencePlan 契約
- Export は `buildSequencePlan(project, opts)` で生成された `SequencePlan` を正本入力として受け取る。
- `buildSequencePlan` は pure に生成され、diagnostics は `warnings` に含まれる。
- Export は Plan を信頼し、再計算ではなく変換を行う。
- range export が将来必要な場合も、raw cut 再構成ではなく Plan timeline の部分抽出で表現する。

## Failure / Warning Policy
- 通常は policy に従って item skip + warning を許可する。
- strict 条件では fail-fast を許可する。
- warning / error の詳細ポリシーは `ADR-0005` を正本とする。
- console 直書きへの依存は持ち込まない。debug が必要な場合も opt-in に限定する。

## 運用メモ
- 実装詳細・ffmpeg 組み立て・音声 mix 詳細は `implementation/` を参照する。
- 一時的な調査ログや移行経緯は `docs/notes/` へ分離する。
- 未解決課題は `docs/TODO_MASTER.md` で管理する。

## 関連ガイド
- Preview 正本: `docs/guides/preview.md`
- Vault / Assets: `docs/guides/vault-assets.md`
- Media I/O: `docs/guides/media-handling.md`
- Export Audio Mix: `docs/guides/implementation/export-audio-mix.md`
