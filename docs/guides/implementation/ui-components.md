# UI Components

**目的**: `src/ui` の責務境界と公開パターンを固定する。
**適用範囲**: `src/ui/*`。
**関連ファイル**: `src/ui/primitives/`, `src/ui/patterns/`, `src/ui/feedback/`。
**更新頻度**: 中。

## Must / Must Not
- Must: 本ドキュメントは `src/ui` のプリミティブ/パターン/フィードバック層のみを扱う。
- Must: 公開面は `src/ui/index.ts` または各層の index から辿れる形に保つ。
- Must: provider 必須の feedback API は mount 条件も含めて同期を保つ。
- Must Not: ドメインUI仕様（Storyline/SceneDurationBar など）をここへ混在させない。
- Must Not: 色仕様をこのファイルで定義しない（色は color-system を参照）。
- Must Not: `src/ui` に store / domain command / Electron API 依存を持ち込まない。

ドメインUIは `docs/guides/storyline.md`, `docs/guides/implementation/scene-duration-bar-ui.md`, `docs/guides/implementation/header-ui.md` を参照。

## Layer Boundaries
- `primitives`
  - 入力、表示、modal、menu などの低レベル表現を置く。
  - domain 用語、store 依存、feature 固有状態を持たない。
- `patterns`
  - `primitives` を組み合わせた再利用パターンを置く。
  - ラベル、補助説明、disabled reason など feature 横断の UX 構造を吸収する。
- `feedback`
  - toast / dialog / banner の通知導線を置く。
  - 表示ライフサイクルと provider/hook 契約をここで統一する。

## Public Contracts
- `src/ui/index.ts` は renderer から使う公開入口とする。
- provider が必要な API は `main.tsx` 相当の composition root で mount されていることを前提にする。
- `useMiniToast` のような overlay 内ローカル通知だけは provider 非依存を許可する。
- dialog / toast / banner の variant や引数を変える場合は、この docs と公開型を同時更新する。

## Usage Rules
- modal / menu / tooltip は UI 構造だけを担当し、domain side effect の発火条件は consumer 側で決める。
- form primitives は validation policy を持たず、入力表現とアクセシビリティだけに留める。
- `patterns` は feature 横断で繰り返す UI 構造に限定し、単一画面専用の見た目調整を置かない。
- feedback API は message 表示、重複抑止、永続/自動 dismiss の制御を統一し、各 feature が独自 toast 実装を持たない。
- `danger` 系 dialog は不可逆操作用に限定し、通常確認に流用しない。

## Out of Scope
- Storyline、Preview、Header、SceneDurationBar などのドメイン UI 仕様。
- 配色・トークンの意味定義。
- Electron API や store command を直接叩く domain-aware component。

## Change Rules
- `src/ui` に新しい公開部品を追加する場合は、どの層に属するかを先に決めてから配置する。
- `src/ui` 内で domain 特化ロジックが必要になった場合は、その機能側 component へ戻す。
- provider 構成を変更した場合は、依存する hook が mount 条件を満たすことを確認する。
