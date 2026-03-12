# LipSync Guide

## TL;DR
対象：LipSync設定・再生・前処理
正本：`AssetMetadata.lipSync` と `getLipSyncFrameAssetIds`
原則：
- 再生解決は正規API経由
- base64をmetadata永続化しない
- 重処理は登録時に寄せる
詳細：処理詳細は implementation / notes を参照

**目的**: LipSync のデータ境界と再生原則を固定する。  
**適用範囲**: LipSync 設定保存、前処理、Preview/Details 再生。  
**関連ファイル**: `docs/guides/preview.md`, `docs/guides/media-handling.md`, `docs/guides/vault-assets.md`。  
**更新頻度**: 中。

## Must / Must Not
- Must: 再生時は `getLipSyncFrameAssetIds` を正規入口としてフレーム列を解決する。
- Must: generated IDs は「生成物のみ」を保持する。
- Must: マスク合成などの重処理は登録時前処理に寄せる。
- Must: metadata には `assetId` 参照を保存する。
- Must: 再生/Export 用フレーム列は `compositedFrameAssetIds` を正本とする。
- Must Not: base64 を metadata 永続化しない。
- Must Not: `compositedFrameAssetIds` を編集入力へ流用しない。
- Must Not: 再生ループで合成処理を行わない。

## データ境界
- 正本は `AssetMetadata.lipSync` と対応 asset 群。
- 編集入力は `baseImageAssetId` / `variantAssetIds` / `maskAssetId?` / `sourceVideoAssetId?` を使い、再生入力と混同しない。
- 再生入力は `compositedFrameAssetIds` を使い、`getLipSyncFrameAssetIds` はこの列だけを返す。
- 生成物バンドルの所有関係は owner を軸に管理する。
- `ownedGeneratedAssetIds` / `orphanedGeneratedAssetIds` は mask や composited frame などの生成物だけを持ち、base/variant/RMS source は含めない。
- load/recovery 時は旧 entry を normalize し、`compositedFrameAssetIds` が無いデータでも `version: 2` へ補完してから扱う。

## 時間軸の原則
- LipSync の時間軸は canonical cut timing に従う。
- 音声長や RMS 結果を時間正本として扱わない。
- LipSync は時間を生成しない（時間の消費者である）。

## Export整合
- Export 時も canonical cut timing を基準とする。
- LipSync 用生成物は Export の時間定義を変更しない。
- 音声の有無や長さで cut duration を再計算しない。

## 失敗時ポリシー
- required frame / RMS source 参照が削除された場合は LipSync 設定自体を外す。
- Preview で RMS が無い場合は静止画像へ degrade し、warning を出す。
- Export / SequencePlan は `strictLipSync` 設定に従い、現在の主要 consumer では `false` を使って warning + fallback を許可する。
- 欠落フレームを暗黙生成しない。

## 再生・編集の責務分離
- 再生:
  - `compositedFrameAssetIds` と RMS からフレーム選択を行う。
  - 音声オフセットは cut 側 audio binding から解決する。
  - 欠損時は設定に応じて warning + still image fallback、または strict failure を使い分ける。
- 編集:
  - 再編集時も編集用入力を正本とし、再生用合成結果を直接編集しない。
  - 再登録時は旧 generated bundle を orphan へ移し、新 bundle と混同しない。

## Cleanup方針
- Relink / 削除時は参照整合を崩さずに cleanup する。
- 同一 asset を参照する LipSync cut が残っている間は generated bundle を削除しない。
- 参照中 asset の扱いは Vault/Asset ガイドの削除ポリシーに従う。

## 運用メモ
- 破壊的移行は `docs/TODO_MASTER.md` の Breaking Track で管理する。
- 実装手順・移行経緯・詳細検討は `docs/notes/` へ分離する。

## 関連ガイド
- Preview再生: `docs/guides/preview.md`
- Vault境界: `docs/guides/vault-assets.md`
