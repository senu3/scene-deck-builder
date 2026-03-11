# Recovery Flow Minimum Plan (2026-03-11)

## TL;DR
- 現状の復旧フローは `missing asset` 対応に限定されており、schema / metadata / read-only rescue の判断軸がない。
- 最小実装は `save validation` と `load assessment` を共通の `RecoveryAssessment` で揃え、完全復旧不能時は `rescue-readonly` ではなく「破損通知 + Vault / .index.json 案内」に寄せる。
- `missing asset` は即 fatal にせず、ロード時は repairable、保存時は warning 扱いを基本にする。fatal は `unsupported schema` と `project.sdp` / `.metadata.json` の破損で通常ロード不能なケースに絞る。

## 目的
- 復旧フローの最小実装を、現行コードと docs の境界に合わせて定義する。
- 実装前に「どこまで直し、どこから先は次フェーズか」を固定する。

## 適用範囲
- `src/features/project/session.ts`
- `src/features/project/load.ts`
- `src/features/project/apply.ts`
- `src/hooks/useHeaderProjectController.ts`
- `src/utils/metadataStore.ts`
- `src/store/*`
- Recovery UI (`src/components/MissingAssetRecoveryModal.tsx` 周辺)

## Must
- Load / Save で別々の判定基準を持ち込まず、同じ assessment から summary を作る。
- `project.sdp` 破損時は cancel と区別できる通知を出し、Vault / `.index.json` / `assets/` の確認へ誘導する。
- 既存の normalize helper (`ensureSceneIds`, `ensureSceneOrder`, scene/group normalize, metadata normalize) は流用し、判断だけを新設する。
- Vault I/O は既存の feature / provider / gateway 境界を維持する。

## Must Not
- `missing asset` だけを見て通常ロード不能扱いにしない。
- `.metadata.json` の破損を silent fallback で握りつぶしたまま report を出さない。
- `.index.json` を timeline 完全復元の正本として案内しない。
- 旧 schema 全体の大規模 migration をこの最小実装に含めない。

## 現状整理
### 1. Save path
- 保存前に実施しているのは、`Scene ID` 自動付与、`sceneOrder` 正規化、asset ref の dangling warning、asset index の並び替えだけ。
- warning は toast に出るが、構造化された save validation result は返していない。
- `missing asset` / `orphan metadata` / `normalize 実行有無` / `schema` を1枚で判断する入口がない。

### 2. Load path
- `project.sdp` 読み込み時は、scene/cut の shape をかなり緩く normalize した後、`missing asset` だけを `pending` として返している。
- project version は欠落時に `v2/v3` を推定する。unsupported schema / structurally broken project を mode 分岐していない。
- recovery commit が失敗しても、そのまま project を初期化できる。

### 3. Metadata path
- `.metadata.json` は LipSync の一部 normalize のみ行い、それ以外の異常は空 store fallback になりやすい。
- `syncSceneMetadata` は既存 entry を保持するため、load 済み orphan scene metadata を自然には落とさない。
- 現行コードには `orphan metadata` を集計・表示する仕組みがない。

### 4. Export / Edit gating
- Export は `SequencePlan` warning で missing asset を skip できるため、UI 側で止めない限り rescue 状態でも export が通る。
- Edit は command 境界があるが、metadata 更新や一部 UI 操作は store action 直通も残っている。

### 5. `.index.json` の限界
- `.index.json` は `assetId -> filename` と派生 `usageRefs` の正本であり、`displayTime` / clip `in/out` / group / notes の完全復元材料ではない。
- したがって `project.sdp` 破損時は「asset inventory は残っている可能性が高い」と案内できるが、「scene/cut/timing を完全復元できる」とは案内できない。

## 方針変更
### A. Save Validation
- 参考案の4項目は維持するが、fatal 条件は絞る。
- `missing asset 数`
  - save 時は warning。ロード時に repair/recovery の対象にする。
- `orphan metadata 数`
  - warning。自動削除はこの最小実装では save 前 dry-run のみ。
- `schema version`
  - `current project save schema = 3` / `metadata schema = 1` を report に出す。
  - unknown future version や assessment failure は fatal。
- `normalize 実行の有無`
  - `sceneIds assigned` / `sceneOrder normalized` / `scene/group normalized` / `metadata normalized` を summary に集約する。

### B. Recovery Report
- `MissingAssetRecoveryModal` とは別概念で `RecoveryReport` を定義する。
- ただし UI は新しい巨大モーダルに寄せず、shared summary block を作って既存 recovery modal にも流用する。
- 表示項目は最小で以下に固定する。
  - 読めた scene 数
  - missing asset 数
  - スキップした metadata 数
  - rescue した cut 数
  - load outcome (`full` / `repairable` / `corrupted`)

### C. Corruption Notice + Vault Guidance
- 完全復旧不能時は project を無理に開かず、破損通知を返す。
- 最小実装では以下を保証する。
  - cancel と parse/破損失敗を UI で区別できる
  - `.index.json` / `assets/` / `.metadata.json` の確認導線を出す
  - 「新規 project を作って assets を再利用できる」ことを案内する
  - `.index.json` だけで scene/cut/timing を完全復元できるとは案内しない

## 実装方針
### 1. 共通 assessment を追加する
- 新規 feature helper を追加し、load/save 両方の summary をここで作る。
- 返り値のイメージ:
  - `mode: "full" | "repairable" | "corrupted"`
  - `report: { readableSceneCount, missingAssetCount, skippedMetadataCount, rescuedCutCount, orphanMetadataCount, projectSchemaVersion, metadataSchemaVersion, normalizationFlags }`
  - `issues: { severity, code, message }[]`
- `load assessment` は raw project, resolved scenes, asset index ids, metadata sanitize 結果を入力にする。
- `save validation` は in-memory state と current index / metadata を入力にする。

### 2. load は 2 段階に分ける
1. `project.sdp` の scene/cut shape を sanitize
2. asset / metadata を解決して assessment を作る

- `repairable`
  - missing asset repair UI を出す
- `corrupted`
  - 破損通知と Vault / `.index.json` 案内を出してロードを止める
- `full`
  - 通常 load

### 3. metadata load は report 付き normalize にする
- `loadMetadataStore` 相当を `loadMetadataStoreWithReport` に拡張する。
- 少なくとも次を数える。
  - invalid root fallback 件数
  - orphan scene metadata 件数
  - orphan asset metadata 件数（asset index に存在しない assetId）
  - normalize で修正した lipSync entry 件数
- save validation でも同じ sanitize を dry-run し、件数だけ再利用する。

### 4. 破損通知は load result で返す
- load IPC / session helper は cancel と corruption を分けて返す。
- `buildProjectLoadOutcome` は `unsupported schema` / JSON parse failure / required shape failure を `corrupted` として返す。
- startup/header は shared corruption dialog を表示する。

### 5. recovery commit 後にも outcome を再判定する
- missing asset recovery の decision 後、通常ロードできる状態に戻ったかを再判定する。
- relink partial/failed が残っても、それ自体では corrupted 扱いにしない。
- ここは「未解決 asset を含む repairable project」は開ける前提を維持する。

### 6. `v2` 互換撤去は先に切り出してよい
- 狭義の `project version 2 / version missing` 受け入れ撤去は、load helper・migration save・関連テスト/notes の更新にほぼ限定される。
- 見積りは `0.5-1日` を目安とする。
- ただし広義の旧 schema 整理（`useEmbeddedAudio` 補完、snapshot seed、LipSync v1 normalize まで含む）は `2-4日` を見込む。
- したがって順序は「先に project schema 許容範囲を `v3 only` に絞る」→「残る互換を別タスクで整理」が妥当。

## 実装順
1. `RecoveryAssessment` 型と pure helper を追加する
2. load path に report/mode を追加する
3. corruption notice UI を追加する
4. save validation を same assessment へ接続する
5. `v2/version missing` 互換の撤去を別コミットで入れる

## この最小実装でやらないこと
- 壊れた project を自動で全面 repair する writer
- 旧 schema 全般の migration 再設計
- orphan metadata の自動削除 save
- `.index.json` ベースの scene/cut/timing 再構成 UI

## 主要な touch point
- load outcome 拡張: `src/features/project/session.ts`
- recovery commit 後判定: `src/features/project/apply.ts`
- save validation 入口: `src/hooks/useHeaderProjectController.ts`
- metadata sanitize/report: `src/utils/metadataStore.ts`
- corruption dialog / startup導線: `src/components/StartupModal.tsx`, `src/hooks/useHeaderProjectController.ts`
- report UI: `src/components/MissingAssetRecoveryModal.tsx` 周辺

## 備考
- ADR-0005 の「旧 schema normalize しない」と、現行の `v2/v3` 推定互換はまだずれている。
- 合意方針では `v2/version missing` 互換を早めに撤去する。
- 旧 schema ポリシーの完全整理は、project schema と metadata/schema fallback を分けて段階整理する。
