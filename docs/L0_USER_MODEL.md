# L0: User Model

## TL;DR 目的
- ユーザーが何を操作し、どの概念がどの画面責務に対応するかを最短で把握できる入口にする。

## 1. ユーザーが操作する概念

| UI概念 | 内部エンティティ | 正本 |
|--------|------------------|------|
| Scene  | scene entity      | sceneOrder |
| Cut    | cut entity        | cut.order |
| Group  | group entity      | group.cutIds |
| Asset  | asset entity       | assetId |

## 2. 画面単位の責務

### Project View
- Scene の並び替え
- Cut の配置・順序調整
- Group の作成・編集

### Sequence Preview
- 最終映像の流れ確認
- 再生制御（再生・停止・シーク）

### Export
- 書き出し設定の確認
- 出力実行と結果確認

## 3. UI操作 -> ドメイン変更対応

| 操作 | 変更対象 | 備考 |
|------|----------|------|
| Scene 並び替え | sceneOrder | 表示順と編集順を同期 |
| Cut 追加 | cut entity | 追加先 Scene の順序に従う |
| Cut 並び替え | cut.order | 並び替え後に再採番 |
| Group 作成 | group.cutIds | Cut 所属を定義 |
| Asset 再リンク | assetId | 参照切れ時の復旧経路 |

## 4. このドキュメントの役割

- ユーザー視点の概念と操作責務のみを扱う。
- 実装詳細、監査運用、設計原則は扱わない。
