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
- 編集軸: `StoryTimeline`（UI: `Storyline`）。
- 再生軸: `SequenceClock` / `useSequencePlaybackController`。
- 出力軸: `ExportPlan` / `ExportSequenceItem` / `resolveExportPlan`。
- Vault軸: `vault/assets` + `.index.json` + `.metadata.json` + `.trash/.trash.json`。

## Must
- `sceneOrder` を Scene 順序の唯一の正本として扱う。
- `cut.order` と実配列順を一致させる。
- Preview/Export は共通の時系列解決ロジックを使う。
- Timeline 構造変更は Command 経由で行う。
- Vault 書き込みは `window.electronAPI.vaultGateway.*` を単一入口にする。
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
- Gate 2 (`cut.order` 整合): 各 Scene の cut は配列順と `cut.order` が一致し、編集操作後も連番を維持する。
- Gate 3 (時系列定義): 開始秒・合計尺は `sceneOrder` と `displayTime` 累積に基づく canonical な計算入口へ集約する。
- Gate 4 (`displayTime` 正規化): `displayTime` は Preview/Export の両方で有限正数へ正規化し、NaN/Infinity/0以下を通さない。
- Gate 5 (Preview/Export parity): Preview と Export で時間解決・Framing 解決の入口を分岐させない。
- Gate 6 (Command 境界): ユーザー操作起点の timeline 構造変更は Command 経由で実施する。
- Gate 7 (Vault 書き込み入口): Vault の index/metadata/trash 更新は `window.electronAPI.vaultGateway.*` を renderer の単一入口にする。
- Gate 8 (`assetId` 主経路): Asset 解決は `assetId` を主経路にし、`cut.asset` は read-time fallback として扱う。
- Gate 9 (thumbnail profile): サムネイルは用途別 profile（`asset-grid`/`details-panel`/`sequence-preview`/`timeline-card`）を混線させない。
- Gate 10 (重い処理の分離): 解析・変換・合成など重い処理は登録時/変換時へ寄せ、再生ループへ入れない。

## Known Broken Invariants
- Gate 2 (`cut.order` 整合): `src/utils/timelineOrder.ts` が fallback ソートを許容しており、壊れたデータが実行時に温存される余地がある（`Partial`）。
- Gate 3 (時系列定義): `src/components/PreviewModal.tsx` 内に累積時間計算が複数あり、`src/utils/storyTiming.ts` への集約が未完了（`Partial`）。
- Gate 4 (`displayTime` 正規化): Preview/Export で正規化ロジックが分散している（`src/components/PreviewModal.tsx`, `src/utils/exportSequence.ts`）（`Partial`）。
- Gate 5 (Preview/Export parity): Preview item 構築と Export item 構築の入口が別実装で、完全 parity になっていない（`Broken`）。
- Gate 6 (Command 境界): 例外境界を固定する。ロード/復元/テスト初期化は Command 対象外とし、ユーザー操作起点のみ必須にする（`Partial`）。
- Gate 8 (`assetId` 主経路): `cut.asset` 直接参照が複数箇所に残っている（`src/utils/exportSequence.ts`, `src/components/StartupModal.tsx`, `src/utils/projectSave.ts`）（`Broken`）。
- Gate 9 (thumbnail profile): `getThumbnail` の profile 省略呼び出しが残っており、暗黙 `timeline-card` 依存がある（`src/components/Sidebar.tsx`, `src/components/CutCard.tsx`, `src/components/DetailsPanel.tsx`）（`Partial`）。

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
