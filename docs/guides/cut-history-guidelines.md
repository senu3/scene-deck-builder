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
