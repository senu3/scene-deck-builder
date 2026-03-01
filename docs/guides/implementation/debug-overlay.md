# Dev Debug Overlay 仕様

## 目的 / 適用範囲

### 目的
Preview実行時の正本時間定義・再生状態・入力イベント状態を可視化し、
再生系およびDnD系の調査を安全に行う。

### 対象画面
- Preview（単一Overlayホスト）
- DnDはモジュール登録型で同一ホストに接続

### 非対象
- Export UI
- ProductionビルドUI
- 一般ユーザー向け機能

## 表示項目（確定版）

### 正本定義
- 正本値 = timeline / cut 定義から導出される時間
- 参考値 = runtime再生状態から導出される値
- HUDは常に正本値を優先表示する

### 表示値（必須）
- `sceneId`
- `cutId`
- `sceneIndex`
- `cutIndex`
- `cut.displayTime`（Preview時間定義と一致）
- 再生状態（`playing` / `paused` / `ended`）
- `sequenceState.localProgress`（参考値）

### 時間定義保証
- Preview時間定義と完全一致する値を表示
- Export時間定義と同一であること
- HUD専用時間計算ロジックを持たない

## ON/OFF制御

### 動作環境
- DEVビルドのみ

### デフォルト
- OFF

有効化手段:
- 明示的debug flag（必須）
- その他の手段は任意実装

### 本番ビルド時の扱い
- コード除去、または
- mount不可（dead branch）

注: 「非表示」ではなく、存在制御を行う。

## 非干渉ルール（必須）
- state更新禁止
- command発行禁止
- export影響禁止
- 永続化禁止
- Preview/Export時間定義の非分岐保証
- selector経由参照のみ（直接store import禁止）
- 外部モジュールへ副作用発行禁止

## 実装境界

### 構造
```text
DevOverlayHost
 ├─ PreviewDebugModule
 └─ DragDropDebugModule
```

### モジュール配置
- `debug/overlay/DevOverlayHost.tsx`
- `debug/modules/previewDebug.ts`
- `debug/modules/dragDropDebug.ts`

### `App.tsx` の責務
- DEV時のみOverlayHostをmount
- ビルドフラグに従う

### `dragDrop.ts` との境界
- `dragDrop.ts` はHUDをimportしない
- dragDropは `logDragDebug` APIのみ呼ぶ
- HUDはdebugHost経由で購読する

### イベント購読責務
- 登録/解除はOverlayHost内で完結
- `window`/`document` へ直接購読する場合もOverlay内に閉じる

## パフォーマンス制約
- `requestAnimationFrame` 同期禁止
- 更新頻度 最大10Hz
- 連続イベントは throttle必須
- ログ保持は有限件数（無限保持禁止）
- 本番時オーバーヘッド 0（no-op）

## DnD Debug方針
- `logDragDebug` APIは維持
- APIはHUD未登録時でも安全（no-op）
- dragDrop層はHUD存在を前提にしない
- 将来のDebug機能はすべてDevOverlayHostに登録型で追加
