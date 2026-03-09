# GroupAudio Continuous Playback Plan (2026-03-10)

## TL;DR
- GroupAudio は `cut` 単位イベントではなく、`group` 単位の単一イベントへモデルを修正する。
- 先に `base audio plan` を正し、その後で focused/1-cut preview 用の audio slice を導入する。
- 1-cut preview は映像 plan を 1-cut のまま維持し、audio だけ canonical sequence plan の窓として扱う。

## 背景
- 現行の `buildExportAudioPlan` は `group-attach` を group 所属 cut ごとに分割生成している。
- このモデルだと group 音源の `sourceStartSec` が cut 境界で 0 に戻りやすく、本来仕様の「連続再生」と一致しない。
- focused preview でも 1-cut plan から attach audio を再構築すると、sequenceMode 上の再生位置を失う。

## 本ノートで固定する仕様
### GroupAudio
- GroupAudio は group 単位の 1 event とする。
- event の開始時刻は group の先頭 cut の canonical 開始時刻。
- `sourceStartSec = 0`。
- `destination` は group 開始位置。
- cut 境界では event を分割しない。
- 音源はワンショット再生とし、終了後はそのまま止まる。
- ループしない。
- cut ごとに `sourceStartSec` を 0 に戻さない。
- GroupAudio は group の終端で必ず停止し、group 外へはみ出さない。
- 別 scene へはみ出さない。
- 別 group へはみ出さない。
- つまり有効再生区間は「group 開始時刻 から group 終端時刻まで」の window に clamp される。

### Preview
- focused / 1-cut preview の映像 plan は 1-cut を維持する。
- ただし Attach Audio 系は 1-cut から再構築しない。
- Attach Audio 系は canonical sequence の `base audio plan` を正本とし、focused preview ではその一部を slice して使う。

## 先にやるべきこと
### Phase 1: base audio plan の正本化
1. `buildExportAudioPlan` の GroupAudio 生成モデルを `group -> single event` に変更する。
2. `group-attach` の event には `groupId` を保持する。
3. event の `timelineStartSec` は group 先頭 cut の開始時刻にする。
4. event の `durationSec` は「音源長」と「group span 長」の小さい方にする。
5. `VIDEOHOLD` が canonical timeline を延ばす場合は、group event も同じ canonical timeline 上で後続時刻へ自然に流れるようにする。

### Phase 2: group span / invariant の明文化
1. group が非連続 cut を持つ場合の扱いを固定する。
2. 本仕様を維持するなら、audio は group 開始から group 終端まで連続再生されるが、その window を超えては再生しない。
3. group 間に gap や非group cut が挟まる場合でも、同じ group span の内部であれば再生は継続する。
4. それが不適切なら、group 自体を連続範囲に制約する invariant を別途導入する。

## 推奨する実装順
1. `ExportAudioEvent` に `groupId` を追加する。
2. `buildExportAudioPlan` の GroupAudio 解決を cut 走査から group span 解決へ置き換える。
3. `SequencePlan` の hold 反映処理を `group-attach` の単一 event モデルで再確認する。
4. `base audio plan` から `windowStartSec/windowEndSec` で切り出す preview helper を追加する。
5. focused / 1-cut preview の attach audio を、その slice helper 経由へ寄せる。
6. 旧 `previewOffsetSec` 依存は attach audio から段階的に外す。

## 実装上の推奨構造
### 1. base plan builder
- `buildExportAudioPlan` を canonical sequence 上の唯一の audio 正本にする。
- Preview / Export は同じ `ExportAudioPlan` を共有し、各 UI が必要な範囲だけ view/slice する。

### 2. preview slice helper
- 例: `src/utils/previewAudioPlanSlice.ts`
- 入力:
  - `baseAudioPlan`
  - `windowStartSec`
  - `windowEndSec`
- 出力:
  - local preview 用 `ExportAudioPlan`
- cut/scene/group の source type ごとの特例は増やさず、event を時間窓で切るだけに留める。

### 3. focused preview で使う時刻
- focused cut の `windowStartSec` は「canonical sequence 上での対象 cut 開始時刻」。
- local preview 再生開始は 0 秒だが、audio event の `sourceOffsetSec` は `windowStartSec` ぶん進んだ状態になる。
- ただし group audio の local event も group 終端を超えないように、slice 後の `durationSec` は group span 内で clamp される。

## この順番を勧める理由
- group モデルが誤ったままだと、preview slice を作っても誤った event を切り出すだけになる。
- 先に base plan を正せば、Preview/Export parity を保ったまま focused preview を直せる。
- `VIDEOHOLD` も base plan 側だけ見ればよく、preview 側で hold 特例を増やさずに済む。

## 既存メモとの関係
- `docs/notes/archive/group-audio-core-adapter-phase-plan-implemented-2026-02-26.md` の「GroupAudio は cut 単位 event」方針は、本ノートで supersede する。
- 既存 guide の `group-attach` 記述も後続実装完了時に更新する。

## 最低限必要なテスト
1. GroupAudio が group 開始時刻に 1 event として生成される。
2. 複数 cut をまたいでも `sourceStartSec` が 0 に戻らない。
3. GroupAudio は group 終端で停止し、別 scene / 別 group へはみ出さない。
4. focused / 1-cut preview で、後方 cut を開いたときの group audio 再生位置が sequenceMode と一致する。
5. group 前方 cut に `VIDEOHOLD` がある場合、focused preview の開始位置が hold 延長を含めて一致する。
6. export と preview slice が同じ base plan 由来で一致する。

## リスク
- group が非連続 cut を持つと、意図せず他 cut 上でも GroupAudio が流れ続ける。
- `durationSec` を group span ではなく project 残り尺で計算すると、group 外へ bleed する。
- `scene-attach` / `group-attach` / `cut-attach` の責務差が曖昧なまま helper を増やすと、再び preview と export が乖離する。

## 進め方の結論
- 先に AttachGroupAudio の base model を修正する判断でよい。
- その後に 1-cut preview 用 audio slice を入れるのが、最小の混乱で本来仕様へ戻す順番。
