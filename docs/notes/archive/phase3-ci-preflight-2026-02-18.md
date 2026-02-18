# Phase3 CI 事前調査と最小方針（2026-02-18）

## 目的
- Phase3 を CI 導入に限定し、Gate 運用を GitHub Actions に移植する。
- 過剰導入を避け、最小構成で fail-fast を実現する。

## 現状調査（この時点の事実）
- `.github/workflows/` は未作成（CI なし）。
- ローカル実行可能な検証コマンド:
  - `npm run check:gate`
  - `npm run check:gate:strict`
  - `npm test`
  - `npm run build`
  - `npm run build:electron`
- `check:gate:strict` は現在 warning 0（baseline は空）。
- PR テンプレートには「変更軸」「更新 docs」「Parity」「Impact Surface」が既に導入済み。

## Phase3 の最小方針（採用）
1. CI は 1 workflow から開始する（分割しない）。
2. 必須チェックは次の 3 系統のみ:
   - Gate: `npm run check:gate:strict`
   - Test: `npm test`
   - Build: `npm run build` + `npm run build:electron`
3. 対象イベントは `pull_request` と `push`（デフォルトブランチ）に限定する。
4. Node バージョンは単一固定（例: 20.x）。OS matrix は導入しない。
5. Gate baseline 更新は既存ルールを維持:
   - 専用コミットで分離
   - PR に更新理由を明記

## Phase3 でやらないこと（後から追加）
- ESLint 新規導入/厳格化
- E2E テスト導入
- Coverage しきい値管理
- OS/Node の matrix 拡張
- キャッシュ最適化の微調整

## 受け入れ条件（Phase3）
- PR で上記 3 系統が自動実行される。
- いずれか失敗時はマージ不可（required status check 化）。
- ローカル運用との差分がない（同じ npm scripts を実行）。

## 実装順（最小）
1. `.github/workflows/ci.yml` を追加（最小構成）。
2. branch protection で required checks を設定。
3. docs の運用リンク更新（`gate-checks.md` / `ARCHITECTURE.md` の CI 文言整合のみ）。

## 補足
- Gate 6 / Gate 10 の運用は `check:gate:strict` に内包済みのため、Phase3 で追加スクリプトは増やさない。
- CI 導入後に必要が出た時点で、ジョブを段階的に追加する。
