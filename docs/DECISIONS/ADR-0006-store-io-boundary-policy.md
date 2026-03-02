# ADR-0006: Store 内 I/O 副作用境界を固定する（Draft）

## Status
Accepted (2026-03-02)

## Context
- 現状は `projectSlice` / `metadataSlice` に `window.electronAPI` 直呼びが残っている。
- 境界の主語が「Store 全体」と「slice 内」で揺れており、例外判断がぶれやすい。

## Decision
- `slice reducer / slice action` の責務は「状態遷移」と「ドメイン整合の同期」に限定する。
- 外部 I/O は `feature action / gateway / provider` を境界として実行する。
- ただし、以下の例外カテゴリのみ許可する。

### 許可カテゴリ（Allowlist）
1. Load/Recovery 初期化に必須な read-only I/O（期限付き例外）
- 対象: プロジェクト読込・復旧で即時に必要な最小 read 操作。
- 条件:
  - read-only は index/metadata への write を一切含まない（キャッシュ書き込みも禁止）。
  - 失敗時は slice state を破壊せず、復旧判定は feature action 層へ返す。

2. Save 前同期の serialize（純粋関数）
- store 内で許可されるのは `state -> payload` の確定まで。
- serialize は deterministic / side-effect free を条件とする。

3. Save/Load の I/O 呼び出し
- read/write の I/O 呼び出しは `provider/gateway` でのみ許可する（feature action から provider を呼ぶのは可）。
- slice reducer / slice action から直接実行してはならない。

4. 互換維持の暫定例外（期限付き）
- 対象: 移行中の既存経路。
- 条件: notes で追跡ID・撤去条件を明示し、新規追加は禁止。

### 禁止線（Must Not）
- `window.electronAPI` の直接呼び出しを slice reducer / slice action に新規追加しない。
- renderer UI から `feature action / gateway / provider` を迂回して副作用境界を増やさない。
- I/O 失敗時に silent fallback で別経路へ書き込まない。

## Scope
- 対象:
  - `src/store/slices/projectSlice.ts`
  - `src/store/slices/metadataSlice.ts`
- 非対象:
  - Preview/Export の時間解決ロジック（既存 ADR の管轄）
  - thumbnail provider の profile 運用（Gate9 管轄）

## Consequences
- store の責務が「状態遷移」に収束し、I/O 障害時の切り分けが容易になる。
- provider 統一によりテスト容易性と Gate 監査の精度が上がる。
- 一方、移行期間は adapter 層が増えるため、段階的移管とテスト補強が前提になる。

## Related
- `docs/notes/archive/store-io-boundary-migration-plan-2026-03-02.md`
- `docs/notes/archive/electronapi-direct-call-audit-memo-2026-02-19.md`
- `docs/DECISIONS/ADR-0003-command-boundary.md`
