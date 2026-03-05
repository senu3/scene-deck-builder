# Store/UI/Feature にじみ防止 移行計画 (2026-03-05)

## TL;DR
- store/slice から I/O と再計算を段階的に剥がし、`EffectRunner` へ集約する移行計画。
- 副作用は Command 本体で実行せず、`effects[]` を返して runner 側で順次実行する。
- metadata 削除不整合は `FILES_DELETE -> INDEX_UPDATE -> METADATA_DELETE` の順序固定で抑止する。

## 目的
- store/UI/feature 間でロジック・I/O・再計算の責務が混ざる状態を解消する。
- Undo/Redo と副作用の境界を明確化し、挙動の予測可能性を上げる。

## 適用範囲
- 対象:
  - `src/store/slices/*`
  - `src/features/*`
  - metadata 削除・project load/save・thumbnail 再生成などの副作用経路
- 非対象:
  - イベントソーシング全面導入
  - main 側永続ジョブキュー導入
  - payload の早期正規化

## Must / Must Not
- Must: store/slice から I/O 直呼びを新規追加しない。
- Must: 構造変更（add/remove/move/reorder/group編集）は Command 経由のみとする。
- Must: renderer 側に `EffectRunner` を置き、逐次実行を基本とする。
- Must: Undo/Redo は state のみを対象とし、副作用は巻き戻さない。
- Must Not: 副作用を Command 内で直接実行しない。
- Must Not: 初期段階で汎用永続キューや複雑な正規化を導入しない。

## Done判定
- store/slice から I/O直呼びが新規に増えない。
- 構造変更（add/remove/move/reorder/group編集）が Command 経由のみになっている。
- metadata 削除不整合（先に metadata 消去して削除失敗など）が順序固定で抑止されている。

## フェーズ計画
### 1. Effects の受け皿だけ作る
- `Effect` 型を薄く定義する（`WRITE_VAULT`, `DELETE_FILES`, `REGEN_THUMBNAILS`, `REINDEX_METADATA` など）。
- payload は当面「運べる形」を優先し、先に正規化しない。
- `effectRunner.run(effects)` を作り、実体は既存関数へ委譲する。
- 実行場所は renderer 側を基本とし、後で IPC 移管可能な境界だけ確保する。

成果:
- 副作用集約の置換先ができる。

### 2. Command の戻り値に `effects[]` を追加する
- `command.apply(state, args) -> { nextState, effects }` へ寄せる。
- store は `nextState` を適用し、直後に `effectRunner.run(effects)` を実行する。
- 目的は「Command 内で副作用を実行しない」状態にすること。

成果:
- Undo/Redo と副作用の責務分離が可能になる。

### 3. サムネ再生成を Effect + 非同期追随へ固定する
- Command は `REGEN_THUMBNAILS(profile, ids)` を返すだけにする。
- runner 側で enqueue し、最初はメモリキューで運用する。
- profile はまず `timeline-card` のみを対象とする。

成果:
- 編集体感と I/O 負荷を分離しやすくなる。

### 4. store 内 I/O 直呼びを置換で削減する
- 優先度:
  1. metadata 削除/更新など不整合リスクの高い経路
  2. project load/save
- 置換方針:
  - 旧: `await writeVault(...)`
  - 新: `return { nextState, effects: [WRITE_VAULT(...)] }`

成果:
- store の責務を状態遷移中心へ収束できる。

## metadata 削除ポリシー（Follow-up Update）
- 削除順序は `FILES_DELETE -> INDEX_UPDATE -> METADATA_DELETE` に固定する。
- `INDEX_UPDATE` 失敗時は `METADATA_DELETE` を実行しない。
- 失敗時は warning を返し、state/metadata を維持して不整合を最小化する。
- index 更新は逐次実行（serialized mutation）で競合を抑止する。

## やらないこと
- イベントソーシング全面導入。
- Effects payload の先行正規化。
- 初期段階での main 側ジョブ永続化。