# Gate不変条件 抽出・是正計画（現行実装適合版）

## 目的
- Gate不変条件を、現行コードベースに適用可能な順序で定義し直し、違反是正の実行計画を固定する。
- `.notes/Invariant_plan.md` を叩き台にしつつ、現状との差分（既に達成済み/未整備前提/文言修正が必要な点）を明文化する。

## 現状サマリ（2026-02-17 時点）
- docs 憲章とチェック基盤は存在:
  - `docs/ARCHITECTURE.md`
  - `.github/pull_request_template.md`
- `sceneOrder` / `cut.order` を使うユーティリティとテストは既にある:
  - `src/utils/timelineOrder.ts`
  - `src/utils/storyTiming.ts`
  - `src/utils/__tests__/sceneOrder.test.ts`
  - `src/utils/__tests__/timelineOrder.test.ts`
- TypeScript unused 検出は有効済み（`noUnusedLocals`, `noUnusedParameters`）:
  - `tsconfig.json`
- 一方で CI ワークフロー未整備:
  - `.github/workflows` が未作成
  - よって「CI Gateで fail」を初手にすると実行不能

## Invariant_plan.md からの主要修正
- 採用: Gateを先に明文化し、違反候補を監査してから是正する段階導入。
- 修正: CI 前提のステップは「ローカル監査スクリプト化 -> CI移植」の順に変更。
- 修正: 「Timeline 構造変更は Command 経由」は適用境界を明示（ロード/復元/テスト初期化は除外）。
- 修正: Gate 3/5 は「単一関数へ即時統合」ではなく「入口の canonical 化 + 互換期間」を設ける。
- 追加: Gateごとの状態を `Ready` / `Partial` / `Broken` で運用し、Known broken を明示する。

## Gate案レビュー（採用判定）

### Gate 1: Scene順序正本は `sceneOrder`
- 判定: 採用（Ready）
- 根拠:
  - `src/utils/sceneOrder.ts`
  - `src/utils/timelineOrder.ts`
  - `docs/DECISIONS/ADR-0001-sceneOrder.md`
- 重点監査:
  - `scenes` の配列順を直接 index として使う箇所の洗い出し

### Gate 2: Cut順序は配列順 = `cut.order`
- 判定: 採用（Partial）
- 根拠:
  - 更新系は多くが再採番済み: `src/store/slices/cutTimelineSlice.ts`
- 懸念:
  - `getCutsInTimelineOrder` が fallback を許容しており、壊れた状態でも動作継続できる設計
- 方針:
  - 監査では fallback 依存箇所を検出対象にする

### Gate 3: 時系列定義の単一化
- 判定: 採用（Partial）
- 根拠:
  - `src/utils/storyTiming.ts` が存在
- 懸念:
  - `src/components/PreviewModal.tsx` に累積時間計算が複数散在
  - Export側は `src/utils/exportSequence.ts` で別実装
- 方針:
  - いきなり全面統合せず、まず canonical API を1つ定義し段階移行

### Gate 4: `displayTime` 正規化（有限正数）
- 判定: 採用（Partial）
- 根拠:
  - Export 側 fallback: `src/utils/exportSequence.ts`
- 懸念:
  - Preview 側で別クランプロジックが混在: `src/components/PreviewModal.tsx`
- 方針:
  - 正規化ヘルパを共通化し、Export/Preview で同一関数を利用

### Gate 5: Preview/Export parity（時間/Framing同入口）
- 判定: 採用（Broken 寄り）
- 懸念:
  - Preview item 構築ロジックと Export item 構築ロジックが分離
- 方針:
  - parity対象を段階化
  - Phase 1は時間・順序・displayTime
  - Phase 2で framing/lipsync/audio mix の完全一致へ拡張

### Gate 6: Timeline構造変更は Command経由
- 判定: 条件付き採用（Partial）
- 修正文言:
  - 「ユーザー操作起点の構造変更は Command 経由。ロード/復元/テスト初期化は例外として明示。」
- 懸念:
  - store API が直接公開されているため、迂回経路が作りやすい

### Gate 7: Vault書き込み単一入口
- 判定: 採用（Partial）
- 根拠:
  - Renderer 経由は `window.electronAPI.vaultGateway.*` が中心
- 重点監査:
  - index/metadata/trash 更新の直接経路が renderer 側に残っていないか

### Gate 8: Asset参照は `assetId` 主経路
- 判定: 採用（Broken 寄り）
- 懸念:
  - `cut.asset` 優先/直接参照パターンが複数残存
  - 例: `src/utils/exportSequence.ts`, `src/components/StartupModal.tsx`, `src/utils/projectSave.ts`
- 方針:
  - `resolveCutAsset` を主入口として寄せ、`cut.asset` 直接参照を段階削減

### Gate 9: thumbnail profile 混線禁止
- 判定: 採用（Partial）
- 根拠:
  - profile設計あり: `src/utils/thumbnailCache.ts`
- 懸念:
  - `getThumbnail(path, type)` の profile省略呼び出しが多数（`timeline-card` へ暗黙フォールバック）
- 方針:
  - 省略禁止は段階導入（まず警告監査、次に型/ラッパで強制）

### Gate 10: 重い処理を再生ループに入れない
- 判定: 採用（Partial）
- 根拠:
  - ffmpeg queue は main 側で分離済み
- 懸念:
  - Preview初期化時に重いI/Oが混在する可能性
- 方針:
  - 「ループ内禁止」に加えて「プレビュー開始時の同期時間予算」を監視項目に追加

## 実行計画（現行実装向け）

### Phase 0: Gate定義の固定（docsのみ）
- `docs/ARCHITECTURE.md` に以下を整備
  - `Invariant Checklist (Gate)` を Gate 1-10 の短文で再定義
  - `Known broken invariants` を `Partial/Broken` から抽出
  - Gate 6 の例外境界（ロード/復元/テスト）を明記
- 成果物:
  - docs更新PR（コード変更なし）

### Phase 1: 監査基盤の作成（CI前提なし）
- `docs/notes/archive/gate-audit-2026-02-17.md` を作成
- 監査は `rg` 主導で Gateごとに収集し、各項目を分類
  - `Fix` / `ADR` / `Known broken` / `False positive`
- 監査テンプレ項目
  - 検出コマンド
  - ファイル
  - 違反疑い理由
  - 対応区分
- 成果物:
  - 監査メモ1本 + 未解決一覧

### Phase 2: 高優先是正（parity基盤）
- 優先順位
  1. Gate 3/4/5: 時系列と `displayTime` 正規化の共通入口化
  2. Gate 8: `assetId` join を主経路へ寄せる
  3. Gate 9: thumbnail profile 明示の徹底
- 具体作業
  - 共有 resolver を追加し Preview/Export 両方で利用
  - `cut.asset` 直接参照を `resolveCutAsset` 経由へ置換
  - `getThumbnail` 呼び出しに profile を明記（UI面ごと）

### Phase 3: Gate運用強化（CI移植）
- 前提: `.github/workflows` を追加
- 段階導入
  - Stage A: 監査スクリプトを warning 出力
  - Stage B: Known broken 解消後に fail 化
- 追加対象
  - unused fail（TS + 必要ならESLint）
  - Gate違反パターン検出（正規表現ベースから開始）

## Gate違反是正の優先キュー（初期）
1. Preview/Export の時間計算入口の重複整理
- 対象: `src/components/PreviewModal.tsx`, `src/utils/storyTiming.ts`, `src/utils/exportSequence.ts`

2. `displayTime` 正規化の二重定義解消
- 対象: `src/components/PreviewModal.tsx`, `src/utils/exportSequence.ts`, `src/utils/assetResolve.ts`

3. `cut.asset` 主依存の縮小
- 対象: `src/utils/exportSequence.ts`, `src/utils/projectSave.ts`, `src/components/StartupModal.tsx`

4. thumbnail profile 省略呼び出しの明示化
- 対象: `src/components/Sidebar.tsx`, `src/components/CutCard.tsx`, `src/components/DetailsPanel.tsx`

## 採用しない/後ろ倒しする案
- 「最初からCIで厳格fail」
  - 理由: workflow未整備のため、先に監査と是正キューの確定が必要。
- 「全Gateを同時に機械判定」
  - 理由: Gate 5/10 は静的検出だけで誤判定が多く、段階導入が妥当。

## 完了条件（この計画フェーズ）
- Gate 1-10 それぞれに `Ready/Partial/Broken` が付与されている。
- `Known broken invariants` が `docs/ARCHITECTURE.md` に反映されている。
- Gate監査メモが1本作成され、Fixキューが優先度付きで確定している。
- PR単位が「docs固定」「監査」「高優先是正」「CI移植」に分割されている。

## 備考
- 本計画は `.notes/Invariant_plan.md` の意図（段階導入）を継承しつつ、現状実装と運用基盤に合わせて実行可能性を優先して再構成した。

## 進捗メモ（2026-02-17）
- Phase 2 の 3本柱は以下まで到達:
  - Gate 3/4/5: 時系列・`displayTime` は canonical API へ移行し、Preview sequence の framing/lipsync/subtitle は export sequence spec を消費する段階まで反映。
  - Gate 8: `assetId` join helper を導入し、`cut.assetId || ...` の散在を縮小。
  - Gate 9: thumbnail profile は型/ラッパで省略禁止を強制。
- Phase 2 残タスク:
  - Gate 5: scene/cut attach audio の計画入口を Preview/Export でさらに同一化する。
  - Gate 8: `cut.asset` fallback の最終縮退（廃止条件の明文化と段階実施）。
