# TODO Master

このファイルが docs の TODO 単一入口。
ID は当面維持（`TODO-DEBT-*` など）し、優先度と着手条件は `Track/Status/StartWhen/BlockedBy/DoneWhen` で管理する。
このファイルは active item のみを扱う（完了済み履歴は保持しない）。

## 運用ルール
- `Track`: `Gate-Work` / `UI-Spec-Pending` / `Bug` / `Investigation` / `Nice-to-have` / `Breaking`
- `Status`: `backlog` / `ready` / `in-progress` / `blocked`
- `StartWhen`: 着手条件（開始トリガ）
- `BlockedBy`: 前提タスクや判断待ち
- `DoneWhen`: 完了判定条件
- TODO 登録は「同一作業で即時に閉じない項目」に限定する
- 1〜2コミットで閉じる見込みの調整・調査は TODO 化せず、作業メモ/PRチェックで管理する
- `DoneWhen` が測定不能な項目は登録しない
- `Investigation` は作成後 7 日以内に「着手継続 / 分割 / 破棄」を見直す
- 完了時は TODO_MASTER から削除する（`done` へ遷移させない）

## Gate-Work Track
- `TODO-DEBT-004` Buffer/Memory ガイドを最新実装検索結果で再棚卸しする
  - Track: `Gate-Work`
  - Status: `backlog`
  - StartWhen: Gate 10 運用の見直し時
  - BlockedBy: `TODO-INVEST-007`
  - DoneWhen: 実装とガイドの乖離を解消し、監査対象外の重処理ポリシーを反映
  - 関連: `docs/guides/implementation/buffer-memory.md`

## UI-Spec-Pending Track
- `TODO-DEBT-002` Preview ガイドの UI 文言を現行実装に合わせて更新する
  - Track: `UI-Spec-Pending`
  - Status: `blocked`
  - StartWhen: Preview UI 文言・表示仕様が凍結したとき
  - BlockedBy: UI 文言の確定
  - DoneWhen: `docs/guides/preview.md` の UI 文言差分が解消
  - 関連: `docs/guides/preview.md`
- `TODO-DEBT-003` SceneDurationBar ガイドの表現を UI 設計確定後に更新する
  - Track: `UI-Spec-Pending`
  - Status: `blocked`
  - StartWhen: Header / SceneDurationBar の最終 UI 仕様が確定したとき
  - BlockedBy: UI 設計確定
  - DoneWhen: `docs/guides/implementation/scene-duration-bar-ui.md` と `docs/guides/implementation/header-ui.md` の文言と実装が一致
  - 関連: `docs/guides/implementation/scene-duration-bar-ui.md`, `docs/guides/implementation/header-ui.md`, `docs/guides/storyline.md`

## Bug Track
- （active item なし）

## Breaking Track
- `TODO-BREAKING-001` LipSync generated IDs の正規化を保存/読み込みに導入する（過去データ migration を含む）
  - Track: `Breaking`
  - Status: `backlog`
  - StartWhen: LipSync ID migration の作業枠を切るとき
  - BlockedBy: なし
  - DoneWhen: migration + 後方互換 + docs 更新が完了
  - 関連: `docs/guides/lip-sync.md`

## Nice-to-have Track
- `TODO-NICE-001` Autosave 設定 UI の interval/保存先連動を実装へ接続する
  - Track: `Nice-to-have`
  - Status: `backlog`
  - StartWhen: Autosave UI 改修の着手時
  - BlockedBy: なし
  - DoneWhen: UI設定が実動作へ反映される
  - 関連: `docs/guides/implementation/autosave-snapshots.md`
- `TODO-NICE-002` Export の AttachAudio ON/OFF UI を `audioBindings[].enabled` で最小導入する
  - Track: `Nice-to-have`
  - Status: `backlog`
  - StartWhen: Export UI 改修の着手時
  - BlockedBy: なし
  - DoneWhen: AttachAudio ON/OFF が export 経路に反映される
  - 関連: `docs/guides/export.md`
- `TODO-NICE-003` `.index.json` / `.trash/.trash.json` を人間向け recovery clue として読みやすくし、recovery import の手掛かりとして使える形にする
  - Track: `Nice-to-have`
  - Status: `ready`
  - StartWhen: Vault index/trash の改善に着手するとき
  - BlockedBy: なし
  - DoneWhen: `.index.json` の usage summary が cut/audio/lipSync の主要参照を表せて、clip/hold 時間を秒ベースで読めるようになり、`.trash/.trash.json` の entry shape が単純化され、project 破損時の recovery import で clue として利用できる
  - 関連: `docs/guides/vault-assets.md`, `docs/notes/index-trash-human-readable-plan-2026-03-12.md`

## Investigation Track
- `TODO-INVEST-009` LipSync 見直し計画（課題再棚卸し + v2設計 + 段階移行）を確定する
  - Track: `Investigation`
  - Status: `ready`
  - StartWhen: LipSync v2 の設計整理に着手するとき
  - BlockedBy: なし
  - DoneWhen: LipSync 課題一覧（再現条件/優先度/フェーズ）が確定し、v2移行方針が docs で固定される
  - 関連: `docs/notes/lipsync-reassessment-plan-2026-03-06.md`
- `TODO-INVEST-001` Sequence preview で同一ソース連続 clip 切替時の一瞬の buffering を低減する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Preview 再生最適化の検討時
  - BlockedBy: なし
  - DoneWhen: 再現条件と改善案を確定し、必要なら実装チケット化
  - 関連: `docs/guides/preview.md`
  - 補足: `docs/notes/archive/preview-sequence-same-source-clip-buffering-todo-2026-02-14.md`
- `TODO-INVEST-002` Snapshot 永続化（保存形式/保持数/復元 UX）を設計する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Snapshot 機能設計の着手時
  - BlockedBy: なし
  - DoneWhen: 保存形式/保持数/復元UXの仕様が確定
  - 関連: `docs/guides/implementation/autosave-snapshots.md`
- `TODO-INVEST-004` `media-handling.md` の肥大化を監視し、`protocol` / `ffmpeg-queue` / `audio-pcm` 分割の実施条件を確定する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: media-handling 追記が続くとき
  - BlockedBy: なし
  - DoneWhen: 分割条件が定義され、必要に応じて docs 分割
  - 関連: `docs/guides/media-handling.md`
- `TODO-INVEST-007` Gate 10 の「再生ループ外の重処理」監視方針（計測点・しきい値）を定義する
  - Track: `Investigation`
  - Status: `backlog`
  - StartWhen: Gate 10 運用見直し時
  - BlockedBy: なし
  - DoneWhen: 監視方針（計測点/しきい値/運用）が docs で確定
  - 関連: `docs/guides/implementation/gate-checks.md`
