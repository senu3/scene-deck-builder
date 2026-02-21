# LipSync Guide

## TL;DR
対象：LipSync設定・再生・前処理
正本：lip sync metadata と assetId参照
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
- Must: 再生時は `getLipSyncFrameAssetIds` 相当の正規API経由でフレーム列を解決する。
- Must: generated IDs は「生成物のみ」を保持する。
- Must: マスク合成などの重処理は登録時前処理に寄せる。
- Must: metadata には `assetId` 参照を保存する。
- Must Not: base64 を metadata 永続化しない。
- Must Not: `compositedFrameAssetIds` を編集入力へ流用しない。
- Must Not: 再生ループで合成処理を行わない。

## データ境界
- 正本は `AssetMetadata.lipSync` と対応 asset 群。
- 編集入力は base/variant 系 asset を使い、再生入力と混同しない。
- 生成物バンドルの所有関係は owner を軸に管理する。

## 再生・編集の責務分離
- 再生:
  - RMS からフレーム選択を行う。
  - 欠損時は安全な既定フレームへフォールバックする。
- 編集:
  - 再編集時も編集用入力を正本とし、再生用合成結果を直接編集しない。

## Cleanup方針
- Relink / 削除時は参照整合を崩さずに cleanup する。
- 参照中 asset の扱いは Vault/Asset ガイドの削除ポリシーに従う。

## 運用メモ
- 破壊的移行は `docs/TODO_MASTER.md` の Breaking Track で管理する。
- 実装手順・移行経緯・詳細検討は `docs/notes/` へ分離する。

## 関連ガイド
- Preview再生: `docs/guides/preview.md`
- Vault境界: `docs/guides/vault-assets.md`
