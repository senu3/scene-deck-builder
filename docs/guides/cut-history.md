# Cut & History Guidelines

## TL;DR
対象：Cut/Group編集と履歴境界
正本：sceneOrder / cut.order / group.cutIds
原則：
- 構造変更はCommand経由
- Groupは時間/順序の正本を持たない
- 副作用連携はstore event経由
詳細：監査運用は gate-checks を参照

## 目的
- Cut/Group 操作のルールを固定し、履歴境界のぶれを防ぐ。
- UI操作とドメイン更新の責務を分離し、回帰を減らす。

## 適用範囲
- Timeline 上の Scene/Cut/Group 構造変更
- Undo/Redo 対象の編集操作
- Asset 参照と Cut 参照の整合

## Must / Must Not
- Must: scene/cut/group の構造変更は Command 経由で扱う。
- Must: 1 Command = 1 履歴単位を維持する。
- Must: Command 内部の副作用は同一履歴境界に含める。
- Must: `sceneOrder` を Scene 順序の正本として維持する。
- Must: `cut.order` と配列順を整合させる。
- Must: Group 所属の正本は `group.cutIds` とする。
- Must: cross-slice 後処理は store event 経由で接続する。
- Must: 構造変更後は正規化を必ず通す。
- Must Not: Command 層から UI API（confirm/alert/modal）を直接呼ばない。
- Must Not: asset action から timeline 配列を直接書き換えない。
- Must Not: Group が timeline の順序・時間正本を置き換えない。
- Must Not: event でドメイン状態を書き換えない。

## 編集境界
- Command 必須:
  - 追加・削除・移動・並び替え・グループ編集などの構造変更
- Command 非対象:
  - 一時的な runtime 状態（loading等）
  - キャッシュ・進捗表示などの非永続UI状態

## Group ルール
- no overlap / no nesting を維持する（1 cut は高々1 group）。
- empty group を残さない。
- group時間範囲は永続化せず、timeline から導出する。

## イベント連携
- Cut削除/移動などの副作用は store event で連携する。
- 直接他sliceの内部実装へ依存しない。
- event は派生状態の更新のみを行う。

## Asset参照ルール
- Cut の read-path 参照は `assetId` を主経路にする。
- write-path で `cut.asset` 前提の更新を増やさない。

## 関連ガイド
- Storyline責務: `docs/guides/storyline.md`
- Command境界の監査運用: `docs/guides/implementation/gate-checks.md`
- 経緯・実装メモ: `docs/notes/`
