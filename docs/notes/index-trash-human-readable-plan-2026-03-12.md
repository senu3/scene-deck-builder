# Index / Trash Human-Readable Plan (2026-03-12)

## TL;DR
- `.index.json` と `.trash/.trash.json` は「完全復元の正本」ではなく、人間が読んで構成を推測できる recovery clue として整える。
- `.index.json` は cut 専用 `usageRefs` から広げ、cut audio / scene audio / group audio / lipSync 参照も読める summary を持てるようにする。
- clip / hold は asset entry 直下ではなく usage 単位で保持し、秒ベースの flat field にする。
- `.trash/.trash.json` は単数/複数の重複 field を整理し、1 entry で「何を消したか」が読める形へ寄せる。

## 目的
- `project.sdp` が壊れても、Vault 内の `.index.json` / `.trash/.trash.json` を見れば asset の利用状況と削除履歴を人間が推測できる状態を定義する。
- JSON をプログラム向け内部 dump ではなく、非開発者でも読みやすい形へ寄せる。

## 適用範囲
- `assets/.index.json`
- `.trash/.trash.json`
- `src/utils/projectSave.ts`
- `src/utils/assetRefs.ts`
- `electron/vaultGateway.ts`

## Must
- `.index.json` は `assetId -> filename` 解決の正本を維持する。
- `.index.json` の usage は flat な summary を優先する。
- 人間向けの位置情報は 1-based の `sceneIndex` / `cutIndex` を優先する。
- clip / hold は usage ごとに `inPointSec` / `outPointSec` / `holdSec` / `displayTimeSec` のような秒ベース field で保持する。
- `.trash/.trash.json` は削除時点の asset summary を保持し、「いつ / なぜ / 何を / どこから / どこへ」を 1 entry で読める形を優先する。

## Must Not
- `.index.json` を scene/cut/timing の完全復元正本として扱わない。
- 同じ意味の単数/複数 field を並立させて可読性を落とさない。
- 内部都合の `sceneOrder` / `cutOrder` を人間向け表示の主軸にしない。
- deep nesting や opaque enum を増やしすぎない。

## 現状の課題
### 1. `.index.json`
- 現在の `usageRefs` は cut 本体の参照だけで、scene audio / group audio / cut audio / lipSync 系参照を読めない。
- `sceneOrder` / `cutOrder` は内部寄りで、非開発者が見て理解しにくい。
- clip `in/out` や hold は出ておらず、同じ asset を複数 cut で使っている場合の差分が読めない。

### 2. `.trash/.trash.json`
- `assetId` / `assetIds`、`indexEntry` / `indexEntries` が併存しており、読み手がどちらを見ればよいか迷う。
- `filename` と `trashRelativePath` が重なっており、「最終的に trash で何名になったか」が分散している。
- `originRefs` の型はあるが、現状は十分に活用されていない。

## 方針
### A. `.index.json`
- `assets[]` の root は現状どおりシンプルに保つ。
- 利用状況は `usage` あるいは `usageRefs` 配列に flat な summary を積む。
- role は最低限、次を扱えるようにする。
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
- cut role のときだけ timing field を出してよい。

### B. `.trash/.trash.json`
- entry は「削除イベント」の単位で表す。
- asset snapshot は `assets[]` に統一し、単数/複数の二重表現は避ける。
- 最小 field は次を想定する。
  - `deletedAt`
  - `reason`
  - `originalPath`
  - `trashedAs`
  - `indexUpdated`
  - `assets[]`
  - `originRefs[]`

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
      "sceneName": "Scene 1",
      "sceneIndex": 1,
      "cutIndex": 3,
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
2. cut usage に `displayTimeSec` / `inPointSec` / `outPointSec` / `holdSec` を追加する
3. `.trash/.trash.json` の entry shape を整理する
4. docs / tests / migration fallback を更新する

## 備考
- `.index.json` / `.trash/.trash.json` は人間向けを優先するが、正本責務は維持する。
- この方針は recovery UI の代替ではなく、「壊れたときに人間が Vault を読める」ことを強化するためのもの。
