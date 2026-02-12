# Cut & History Guidelines

## 目的
- Cut/Group 操作の実装ルールを固定し、Undo/Redo 境界のぶれを防ぐ。
- AssetPanel の Cut オプション廃止方針を運用ガイドとして明文化する。

## 適用範囲
- `src/components/CutCard.tsx`
- `src/components/AssetPanel.tsx`
- `src/App.tsx`（DnD）
- `src/store/commands.ts`
- `src/store/useStore.ts`

## 関連ファイル
- `docs/notes/store-slice-plan.md`
- `docs/notes/archive/cut-refactor-plan-implemented-2026-02-12.md`
- `docs/guides/storyline.md`

## 更新頻度
- 中

## 実装ガイドライン

### 1. Timeline 構造変更は Command 経由
- 対象: cut/scene/group の追加・削除・移動・順序変更・グループ除外/並び更新。
- 直接 `useStore` 更新を行う場合は、Undo/Redo 非対象である理由をコードコメントで明示する。

### 2. Runtime 状態は永続モデルに混ぜない
- loading などの一時状態は `CutRuntimeState` で扱う。
- `Cut` 型には runtime 専用フィールドを戻さない。

### 3. Group 追随は共通ロジックを使う
- group `cutIds` の整合更新は `commands` と `cutGroupOps` からのみ行う。
- DnD 後処理で group を触る際は command を優先する。

### 4. Command 層に UI 依存を持ち込まない
- `commands.ts` で `confirm()` やモーダル表示を呼ばない。
- 確認ダイアログは UI 層（例: `Header`）で行い、確定後に `undo/redo` や `executeCommand` を呼ぶ。

### 5. cross-slice 連携は store event 経由
- 直接他 slice の内部更新ロジックを呼ばない。
- 例: Cut 削除時は `CUT_DELETED` を emit し、`applyStoreEvents` で group/selection の後処理を実施する。

### 6. Asset 参照は `assetId` を主経路にする
- 復元・コピーなどの read 時は `getAsset(assetId)` を優先し、必要時のみ `cut.asset` を fallback とする。
- write 時に `cut.asset` を前提にした更新を増やさない。

### 7. selector 標準パターン
- コンポーネントでは `useStore()` の全体購読を避け、必要な state/action のみを selector で取得する。
- selector は「描画に必要な最小単位」で分割する。`scene` と `uiState` を同一 selector に混在させない。
- action は state selector と分離して取得する（再レンダー連鎖を抑えるため）。
- 配列/オブジェクトを selector で組み立てる場合は、不要な新規参照生成を避ける。
- `asset` 参照は selector 内で `getAsset(cut.assetId)` 優先にし、`cut.asset` は fallback とする。

標準例:
```ts
const selectedCutId = useStore((s) => s.selectedCutId);
const selectedSceneId = useStore((s) => s.selectedSceneId);
const updateCutDisplayTime = useStore((s) => s.updateCutDisplayTime);
```

避ける例:
```ts
const store = useStore(); // 全体購読
```

## 禁止依存（S0）
- `commands.ts` -> ブラウザ UI API 直接呼び出し（`confirm`, `alert`, modal）。
- slice -> 他 slice の private helper 直接 import。
- Asset 系 action -> Cut 配列の直接書き換え（まず Cut action 経由を検討）。

## Undo/Redo 対象（運用）
- 対象: scene/cut/group の構造変更、clip point 更新。
- 非対象: runtime loading 状態、サムネイルキャッシュ、Export 進捗 UI。

## AssetPanel Cut オプション廃止方針
- 方針: AssetPanel は段階的に「Asset 操作専用」に移行する。
- 当面: 既存 Cut オプションは互換維持で残すが、新機能は追加しない。
- 置換先: Cut 操作は `CutCard` / `DetailsPanel` / ショートカット（history command 経由）へ寄せる。
- 完了条件:
  - AssetPanel から Cut コンテキストメニューを撤去しても運用導線が維持される。
  - 上記撤去後も Undo/Redo 対象操作の網羅性が維持される。

## チェックリスト
- 変更が timeline 構造を変えるか?
- Command を追加/再利用できるか?
- Undo/Redo で前状態へ戻るか?
- docs（本ファイル/plan）と実装が一致しているか?
