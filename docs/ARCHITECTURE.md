# Architecture Charter

## 目的
ローカルの Vault（資産庫）を正本にして、Scene/Cut で時系列を組み立て、Preview と Export の結果が一致する「素材 -> 構成 -> 書き出し」の道具にする。

## 最適化する価値
- 素材の取り込み・参照切れ耐性: `project.sdp + assets/.index.json + .metadata.json` で復元できること。
- 編集の粒度: Scene（構成単位）と Cut（再生単位）で組み立てること。
- 再生と書き出しの一致: Preview と Export が同じ時系列定義・同じ解決ロジックを共有すること。
- 重い処理の登録時寄せ: 再生を軽く保ち、解析・事前生成は登録時/変換時に寄せること。

## スコープ
- Vault 資産管理（index/metadata/trash）と参照整合の維持。
- Storyline（編集軸）で Scene/Cut を操作し、Undo/Redo 境界を Command 経由で固定。
- Preview（Single/Sequence）と Export（MP4 等）で同じ時系列を出力。
- 画像/動画サムネイルの用途別プロファイル運用。

## 非スコープ
- NLE 化につながる高度編集（キーフレーム、カラーグレーディング、合成タイムライン等）。
- クラウド前提の共同編集・同期。
- 目的を持たないメタ情報の増殖。

## 軸の命名
- 編集軸: `StoryTimeline`（UI呼称: `Storyline`）。
- 再生軸: `SequenceClock`。
- 出力軸: `ExportPlan`。
- Vault軸: `Vault Assets`（index/metadata/trash を含む）。

## Must
- `sceneOrder` を Scene 順序の唯一の正本として扱う。
- `cut.order` と実配列順を一致させる。
- Preview/Export は共通の時系列解決ロジックを使う。
- Timeline 構造変更は Command 経由で行う。
- Vault 書き込みは単一 gateway 入口に統一する。
- サムネイルは用途別 profile を混線させない。
- TODO は `docs/TODO_MASTER.md` に集約する。

## Must Not
- `scenes` 配列の見た目順を Scene 順序の正本として扱わない。
- Command 境界外で timeline 構造を直接書き換えない。
- Preview と Export で別の時間定義を持ち込まない。
- 重い合成/解析処理を再生ループへ持ち込まない。
- Vault 直下の index/metadata/trash を複数経路で更新しない。
- 用途外 profile のサムネイルを流用しない。
- TODO を各ガイドへ散在させない。

## 意思決定ルール
- 変更提案は必ず「編集/再生/出力/Vault」のどの軸かを明記する。
- 仕様判断は `references/DOMAIN.md` と `references/MAPPING.md` を先に確認する。
- 破壊的変更は `docs/DECISIONS/` に ADR を追加してから進める。
- docs 更新が不要と判断した場合は PR で理由を明記する。

## Invariant Checklist (Gate)
- Gate 1 (`sceneOrder` 正本): Scene 順序の正本は `sceneOrder` のみで、`scenes` 配列順を順序根拠にしない。
- Gate 2 (`cut.order` 整合): 各 Scene の cut は配列順と `cut.order` が一致し、編集操作後も連番を維持する。GroupCUT では `group.cutIds` も同順序に整合させる。
- Gate 3 (時系列定義): 開始秒・合計尺は `sceneOrder` と `displayTime` 累積に基づく canonical な計算入口へ集約する。
- Gate 4 (`displayTime` 正規化): `displayTime` は Preview/Export の両方で有限正数へ正規化し、NaN/Infinity/0以下を通さない。
- Gate 5 (Preview/Export parity): Preview と Export で時間解決・Framing 解決の入口を分岐させない。
- Gate 6 (Command 境界): ユーザー操作起点の timeline 構造変更は Command 経由で実施する。group の構造変更も Command 経由のみで行う。
- Gate 7 (Vault 書き込み入口): Vault の index/metadata/trash 更新は renderer の単一 gateway 入口にする。
- Gate 8 (`assetId` 主経路): Asset 解決は `assetId` を唯一の経路として扱う。
- Gate 9 (thumbnail profile): サムネイルは用途別 profile（`asset-grid`/`details-panel`/`sequence-preview`/`timeline-card`）を混線させない。
- Gate 10 (重い処理の分離): 解析・変換・合成など重い処理は登録時/変換時へ寄せ、再生ループへ入れない。

## GroupCUT Invariants
- 参照モデル（A方式）: group は `cutIds` を正本として保持し、`cut.groupId` は逆参照インデックスとして同期する。
- 重なり禁止: 1つの cut は高々1つの group にのみ所属できる（no overlap / no nesting）。
- 空グループ禁止: `remove` / `normalize` の共通ルールとして empty group は削除する。
- 範囲は導出: `groupStartAbs/groupEndAbs/groupDurationAbs` は永続化せず、cut の canonical timing から導出する。
- 注: timeline の正本（`sceneOrder`, `cut.order`, canonical timing）を group が置き換えてはならない。group の `cutIds` は「所属の正本」であり、「順序/時間の正本」ではない。

## 運用詳細の参照先
- Gate 監査の検出ルール・baseline 運用・CI/ローカル実行ルールは `docs/guides/implementation/gate-checks.md` を正本とする。
- `assetId` 解決失敗時の用途別ポリシーは `docs/DECISIONS/ADR-0005-asset-resolve-failure-policy.md` を正本とする。
- Command 境界の例外カテゴリは `docs/DECISIONS/ADR-0003-command-boundary.md` を正本とする。

## 成功指標
- Preview/Export parity: 同一入力で視覚・時間・音が一致する。
- Recovery: `project.sdp + assets/.index.json + .metadata.json` で復元できる。
- 増殖抑制: 新機能が所属軸を明記し、docs 追加が最小で済む。

## Docs Governance
- 設計思想は ARCHITECTURE
- 仕様正本は guides/
- 実装規約は guides/implementation/
- 判断履歴は DECISIONS/
- TODO は TODO_MASTER のみ
