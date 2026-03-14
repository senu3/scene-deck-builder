# UI Components

**目的**: `src/ui` の責務境界と公開パターンを固定する。
feature 実装時に独自デザインへ逸れて UI の統一感が崩れることを防ぐため、必要な部品は先行実装を許可する。ただし未採用部品を漂流させない運用を同時に定義する。
**適用範囲**: `src/ui/*`。
**関連ファイル**: `src/ui/primitives/`, `src/ui/patterns/`, `src/ui/feedback/`。
**更新頻度**: 中。

## Must / Must Not
- Must: 本ドキュメントは `src/ui` のプリミティブ/パターン/フィードバック層のみを扱う。
- Must: stable は `src/ui/index.ts` と各層の `index.ts`、candidate は各層の `candidate.ts` から辿れる形に保つ。
- Must: provider 必須の feedback API は mount 条件も含めて同期を保つ。
- Must: 新規 UI / 既存 UI 修正時は、まず `src/ui` に既存部品があるか確認する。
- Must: 既存部品と合わない場合は feature 側で似た見た目を増やす前に、`src/ui` 側の修正・拡張を先に検討する。
- Must: 同じ UI 構造が2回以上 feature 側に現れたら、3回目のローカル再実装の前に `src/ui` へ抽出する。
- Must: 各部品を `stable` または `candidate` のいずれかで扱う。
- Must Not: ドメインUI仕様（Storyline/SceneDurationBar など）をここへ混在させない。
- Must Not: 色仕様をこのファイルで定義しない（色は color-system を参照）。
- Must Not: `src/ui` に store / domain command / Electron API 依存を持ち込まない。

ドメインUIは `docs/guides/storyline.md`, `docs/guides/implementation/scene-duration-bar-ui.md`, `docs/guides/implementation/header-ui.md` を参照。

## Layer Boundaries
- `primitives`
  - 入力、表示、button、modal、menu などの低レベル表現を置く。
  - domain 用語、store 依存、feature 固有状態を持たない。
  - 例外として `SettingsRow` や `StatDisplay` のような domain 非依存の structural primitive はここに置いてよい。
- `patterns`
  - `primitives` を組み合わせた再利用パターンを置く。
  - ラベル、補助説明、disabled reason など feature 横断の UX 構造を吸収する。
- `feedback`
  - toast / dialog / banner の通知導線を置く。
  - 表示ライフサイクルと provider/hook 契約をここで統一する。

## Public Contracts
- `src/ui/index.ts` は renderer から使う公開入口とする。
- root の barrel export は `stable` のみを公開する。
- 各層の `index.ts` は `stable` のみを公開する。
- `candidate` は各層の `candidate.ts` から明示 import する前提とし、root barrel からは再 export しない。
- provider が必要な API は `main.tsx` 相当の composition root で mount されていることを前提にする。
- `useMiniToast` のような overlay 内ローカル通知だけは provider 非依存を許可する。
- dialog / toast / banner の variant や引数を変える場合は、この docs と公開型を同時更新する。

## Maturity States
- `stable`
  - 既存画面で実利用されており、新規 UI 実装で優先採用する部品。
  - root barrel export の標準対象。
- `candidate`
  - 将来の UI ばらつきを防ぐために先行実装された部品。
  - 未使用であること自体は許容するが、想定利用箇所または採用計画を持つこと。
  - 実利用が増えたら `stable` へ昇格し、設計が合わなければ削除を検討する。

未使用コンポーネントは即削除ではない。採用意図が明確で、UI の統一感維持に資するものは `candidate` として維持してよい。削除前提の候補は state に載せず、監査メモや個別 PR で管理する。

## Usage Rules
- modal / menu / tooltip は UI 構造だけを担当し、domain side effect の発火条件は consumer 側で決める。
- form primitives は validation policy を持たず、入力表現とアクセシビリティだけに留める。
- `Button` は modal footer で実際に使う action 表現を正本とし、feature 側で modal action 専用の class を重複定義しない。
- `UtilityButton` は panel 内の補助操作、一覧操作、overlay 内の軽量 action の正本とする。
- `IconButton` は close / more / menu trigger など icon-only action の正本とし、feature ごとの個別 close button CSS を増やす前に優先採用する。
- `Tooltip` は通常説明専用、`DisabledReason` は disabled 理由専用として使い分ける。
- `Tooltip` / `DisabledReason` / `InlineSlider` / `ContextMenu` のような floating UI は、fullscreen modal や isolated layer で使う場合に `portalContainer` を受け取れる形を維持する。
- `Field` / `InputGroup` / `PathField` のような candidate は、同型 UI の再実装が出たときに優先採用または再設計する。
- `patterns` は feature 横断で繰り返す UI 構造に限定し、単一画面専用の見た目調整を置かない。
- feedback API は message 表示、重複抑止、永続/自動 dismiss の制御を統一し、各 feature が独自 toast 実装を持たない。
- `danger` 系 dialog は不可逆操作用に限定し、通常確認に流用しない。

## Current Audit

### Stable
- `Button`, `UtilityButton`, `IconButton`
- modal primitives (`Overlay`, `Container`, `Header`, `Body`, `Footer`, `Actions`, `useModalKeyboard`)
- `Input`, `InputGroup`, `Select`, `Checkbox`, `RadioGroup`, `Toggle`, `Tabs`, `Slider`, `PathField`
- `SettingsRow`, `StatDisplay`
- `Toast` / `Dialog` / `Banner` / `MiniToast`
- menu primitives (`Menu`, `MenuHeader`, `MenuItem`, `MenuSeparator`, `ContextMenu`, `MenuSubmenu`)

### Candidate
- `Tooltip`
- `Field`
- `DisabledReason`
- `InlineSlider`
- `ReadOnlyValue`
- `SettingsSection`

## Out of Scope
- Storyline、Preview、Header、SceneDurationBar などのドメイン UI 仕様。
- 配色・トークンの意味定義。
- Electron API や store command を直接叩く domain-aware component。

## Change Rules
- `src/ui` に新しい公開部品を追加する場合は、どの層に属するかを先に決めてから配置する。
- 新しい部品を追加する場合は、追加時点で `stable` または `candidate` のどちらとして扱うかを明記する。
- `candidate` を追加する場合は、想定利用箇所または置換対象を docs か PR に残す。
- `candidate` を `stable` へ昇格する場合は、対象 export を各層の `candidate.ts` から `index.ts` へ移す。
- `src/ui` 内で domain 特化ロジックが必要になった場合は、その機能側 component へ戻す。
- provider 構成を変更した場合は、依存する hook が mount 条件を満たすことを確認する。
