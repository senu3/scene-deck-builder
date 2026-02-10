# Export実装前 命名整理計画

**目的**: Export機能実装前に、混同しやすい用語を先に固定し、実装中の命名ブレを防ぐ。  
**適用範囲**: 用語定義（docs）と最小限の命名変更方針（code/docs）。  
**関連ファイル**: `docs/references/DOMAIN.md`, `docs/references/MAPPING.md`, `docs/guides/preview.md`, `docs/guides/media-handling.md`, `src/utils/mediaType.ts`。  
**更新頻度**: 中。  

## ステータス（2026-02-10）
- Phase 1: 完了
- Phase 2: 未着手（MP4 export 実装側の詳細確定待ち）
- Phase 3: 一部完了（正本 docs への反映は実施済み、最終統一は継続）

> TODO: MP4 export の最終仕様（UI/実行方式）が確定したら、Phase 2/3 を最終化する。

## 背景
- 編集軸（`StoryTimeline`）と再生軸（public: `useSequencePlaybackController`, internal: `SequenceClock`）は整理済み。
- Export実装開始後は第3の時間軸/実行軸が増えるため、先に命名境界を固定しないと混同が再発しやすい。

## 方針
- 変更必要性が高いものだけ先に固定し、低いものは命名ルールで統制する。
- 既存コード互換を壊す改名は避け、段階移行で進める。

## 変更対象（優先）
### Phase 1: docs先行で固定（即時）
1. `MediaSource` の用語境界を明示する。  
`MediaSource`（Web API）とアプリ内抽象を区別し、docsでは初出時に「app-specific abstraction」を明記する。  
必要に応じて概念名 `PreviewMediaSource` を併記する。
2. Export軸の概念名を暫定固定する。  
候補: `RenderSequence`（推奨） / `ExportSequence`。  
実行制御名: `ExportRunner`（推奨） / `RenderRunner`。
3. `source` 用語の使い分けを固定する。  
UI文脈は `SourcePanel`、ファイル由来文脈は `ImportSourcePath`（または `OriginPath`）を使う。

### Phase 2: 実装開始時に確定（Export着手時）
1. Export実装内で `Timeline` 語を新規導入しない。  
時間軸は `RenderSequence` 系で統一する。
2. Preview用語とExport用語の境界を固定する。  
Preview: `SequenceClock` / `PreviewMediaSource`。  
Export: `ExportRunner` / `RenderSequence`。

### Phase 3: 実装後に正本へ反映
1. `docs/references/DOMAIN.md` に命名ルール節を追加する。
2. `docs/references/MAPPING.md` に Export関連行を追加する。
3. `docs/guides/*` の表記ゆれ（Preview/Export/Source）を統一する。

## 変更不要（命名ルールで対応）
1. `Scene` / `Storyline` / `StoryTimeline`  
既存整理で十分。規約で維持。
2. `Preview` / `PreviewModal` / `PreviewMode`  
機能名とUI名の使い分けを規約化して維持。
3. `Asset Index` / `Asset Reference Graph` / `Metadata Store`  
改名より責務説明の固定を優先。

## 実行チェックリスト
- [x] `DOMAIN.md` に「命名ルール（編集/再生/出力）」節を追加
- [x] `MAPPING.md` に Export軸の概念/実装対応を追加
- [x] `preview.md` と `media-handling.md` に `MediaSource` 用語注記を追加
- [x] `source` 用語（UI/ファイル）の使い分けを guides に明記
- [ ] `rg -n "Timeline.*Export|Export.*Timeline"` で禁止パターンがないことを確認

## 完了条件
- Export関連の新規設計/実装で、`StoryTimeline`（編集）/`SequenceClock`（再生）/`RenderSequence`（出力）が混在せず区別されている。
- 正本（`DOMAIN.md`）に命名ルールが追記され、各ガイドがそのルールへ参照している。
