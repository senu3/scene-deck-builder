# Index / Trash Human-Readable + Recovery Clue Plan (2026-03-12)

## TL;DR
- `.index.json` を人間可読 + recovery clue として再編する。
- `.trash/.trash.json` は audit log を維持しつつ、human investigation と recovery clue の補助入力として読みやすくする。
- `recovery-import schema` は `.index.json` と別物として定義する。
- 壊れたときは `.index.json + .metadata.json + .trash/.trash.json` から clue を集め、validated な import 入力を作ってから project patch を組み立てる。
- 通常 open フロー内で repair 範囲は広げず、project 破損時は recovery 導線へ送る。

## 目的
- `project.sdp` が壊れても、Vault 内の clue から asset 利用状況と構成の手掛かりを人間と recovery builder の両方が読める状態を定義する。
- `.index.json` を内部 dump ではなく、asset 解決の正本を維持した human-readable clue に寄せる。
- `index = import schema` ではなく、`clue collection -> validated import build` の境界を先に固定する。

## 適用範囲
- `assets/.index.json`
- `assets/.metadata.json`
- `.trash/.trash.json`
- `src/utils/projectSave.ts`
- `src/utils/assetRefs.ts`
- `electron/vaultGateway.ts`
- 将来の recovery import builder

## Must
- `.index.json` は `assetId -> filename` 解決の正本を維持する。
- `.index.json` の usage は human-readable な flat summary を優先する。
- usage summary は人間向けの `sceneIndex` / `cutIndex` だけでなく、機械向けの `sceneId` / `cutId` / `groupId?` を保持できる形にする。
- timeline 上で意味のある usage には、`inPointSec` / `outPointSec` / `holdSec` / `displayTimeSec` のような秒ベース field を持てるようにする。
- `.trash/.trash.json` は削除イベント単位で「いつ / なぜ / 何を / どこから / どこへ」を 1 entry で読める形を優先する。
- recovery import は `.index.json` / `.metadata.json` / `.trash/.trash.json` を clue として読み、別 schema の validated input を組み立てる。
- project 破損時の `recover` は通常 open 中の高度 repair ではなく、recovery 導線への handoff を意味する。

## Must Not
- `.index.json` を scene/cut/timing の完全復元正本として扱わない。
- `.index.json` と recovery-import schema を同一視しない。
- `.trash/.trash.json` を自動復元の主材料にしすぎない。
- 同じ意味の単数/複数 field を並立させて可読性を落とさない。
- 内部都合の `sceneOrder` / `cutOrder` を人間向け表示の主軸にしない。
- deep nesting や opaque enum を増やしすぎない。

## 位置づけ
### `.index.json`
- asset mapping の正本
- human-readable な usage summary
- recovery import に渡す主要 clue

### `.metadata.json`
- asset / scene に紐づく補助メタ情報
- index だけで足りない補助 clue

### `.trash/.trash.json`
- 削除・退避の audit/history
- rename / move / 退避経路の補助 clue
- human investigation と recovery import の補助入力

### `recovery-import schema`
- `.index.json` そのものではない
- schema validation 前提の machine-safe な import 入力
- 永続ファイルにするかメモリ生成にするかは未決

## 現状の課題
### 1. `.index.json`
- 現在の `usageRefs` は cut 本体の参照中心で、scene audio / group audio / cut audio / lipSync 系参照が弱い。
- `sceneName` / `sceneIndex` / `cutIndex` は人間には分かりやすいが、復元器にとっては ID 手掛かりが不足している。
- clip `in/out` や hold が足りず、同一 asset の usage 差分が読みづらい。
- order 系の clue が薄いと、scene/cut 再構成で詰まりやすい。

### 2. `.trash/.trash.json`
- `assetId` / `assetIds`、`indexEntry` / `indexEntries` のような二重表現が可読性を落としている。
- `filename` と `trashRelativePath` が重なり、「最終的にどこへ移ったか」が分散している。
- recovery 入力として使う場合の責務境界が曖昧で、主経路に寄せすぎる危険がある。

## 方針
### A. `.index.json` は human-readable clue として再編する
- `assets[]` の root は shallow に保つ。
- `usageRefs` は asset ref graph ベースで再構成し、最低限次の role を扱えるようにする。
  - `cut`
  - `cut-audio`
  - `scene-audio`
  - `group-audio`
  - `lipsync-base`
  - `lipsync-variant`
  - `lipsync-mask`
  - `lipsync-composited`
  - `lipsync-rms-audio`
  - `lipsync-source-video`
- usage には人間向けと機械向けの両方を持てるようにする。
  - 人間向け: `sceneName`, `sceneIndex`, `cutIndex`
  - 機械向け: `sceneId`, `cutId`, `groupId`, `order`
- timing は usage 単位で保持し、asset entry 直下には置かない。

### B. `.trash/.trash.json` は補助 clue に留める
- entry は削除イベント単位で表す。
- asset snapshot は `assets[]` に統一する。
- rename / rehash / move の履歴参照には使うが、自動復元の主材料にはしすぎない。

### C. recovery-import schema は別段で定義する
- `.index.json` をそのまま import 入力として扱わない。
- 壊れた project では、まず clue を集めて loose な bundle を作る。
- その bundle から validated な `recovery-import schema` を組み立て、そこから project patch を生成する。

## Recovery Handoff
### 1. clue collection
- `.index.json`
- `.metadata.json`
- `.trash/.trash.json`

### 2. intermediate bundle
- 例: `RecoveryClueBundle`
- 含めたい情報の例
  - project path
  - vault path
  - index / metadata / trash の read result
  - asset inventory summary
  - usage summary
  - scene / cut clue summary
  - damage reasons

### 3. validated import build
- `RecoveryClueBundle` から `recovery-import schema` を生成する。
- unresolved refs や warnings を schema 上で明示する。
- project patch 化は validated import の後段で行う。

## 責務分割表
| 項目 | `.index.json` 再編案 | `recovery-import schema`|
| --- | --- | --- |
| 主目的 | 人間が Vault を読んで構成を推測できること | 機械が project patch を安全に組み立てること |
| 位置づけ | asset 解決正本 + recovery clue | 一時生成物または import 入力 |
| 正本責務 | `assetId -> filename` 解決 | なし |
| 読み手 | 人、調査ツール、簡易 recovery UI | importer / recovery builder / validator |
| 単独で完全復元できるか | できない前提 | できるところまで寄せる |
| 構造方針 | flat / readable / shallow | machine-safe / ID-based / schema-first |
| scene/cut 完全情報 | 持たない | 持つ |
| order | clue として保持できる | order / insertion を明示する |
| timing | usage summary の範囲で持つ | 復元に必要な timing を明示する |
| validation | 軽い | 強い。schema validation 必須 |
| 生成元 | 保存時に直接書く | project 不整合時に clue から生成する |
| deep nesting | 避ける | 必要最小限は許容 |

## JSON イメージ
### `.index.json`
```json
{
  "id": "asset-1",
  "filename": "clip_abc123.mp4",
  "originalName": "intro.mp4",
  "type": "video",
  "usageRefs": [
    {
      "role": "cut",
      "sceneId": "scene-1",
      "cutId": "cut-3",
      "sceneName": "Scene 1",
      "sceneIndex": 1,
      "cutIndex": 3,
      "order": 2,
      "inPointSec": 1.2,
      "outPointSec": 4.8,
      "holdSec": 0.9,
      "displayTimeSec": 4.5
    }
  ]
}
```

### `.trash/.trash.json`
```json
{
  "deletedAt": "2026-03-12T01:23:45.000Z",
  "reason": "asset-panel-delete",
  "originalPath": "assets/shared.wav",
  "trashedAs": ".trash/shared.wav",
  "indexUpdated": true,
  "assets": [
    {
      "id": "asset-1",
      "originalName": "shared.wav",
      "type": "audio"
    }
  ],
  "originRefs": []
}
```

## 実装順
1. `.index.json` の usage source を cut-only から asset ref graph ベースへ広げる
2. usage summary に `sceneId` / `cutId` / `groupId?` と秒ベース timing を追加する
3. `.trash/.trash.json` の entry shape を整理する
4. clue collection から `RecoveryClueBundle` を作る要件を固定する
5. docs / tests / migration fallback を更新する

## 非スコープ
- 通常 open フロー内での高度 repair
- `.index.json` 単独での完全復元
- `recovery-import.json` の永続配置の確定
- `.trash/.trash.json` を主経路にした自動復元

## 備考
- `.index.json` / `.trash/.trash.json` は人間向けを優先するが、正本責務は維持する。
- この方針は「壊れたときに人間が Vault を読める」ことと、「recovery import へ安全に handoff する」ことを両立させるためのもの。
