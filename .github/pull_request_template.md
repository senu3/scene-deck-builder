## Summary
- 

## Why
- 

## Changes
- 

## Scope Axis (Required)
- [ ] 編集（StoryTimeline / Storyline）
- [ ] 再生（Preview / SequenceClock）
- [ ] 出力（Export / ExportPlan）
- [ ] Vault（assets/index/metadata/trash）

## Docs Update (Required)
- [ ] 変更に対応する docs を更新した
- [ ] 更新した docs: 
- [ ] docs 更新が不要な場合、理由を記載した

## Commit Policy
- [ ] コミット件名が `type(scope): subject` に準拠
- [ ] Gate関連コミットは `scope=gateN` を使用し、必要に応じて本文に `Affects:` を記載
- [ ] `scope=gateN` の場合、docs（`docs/ARCHITECTURE.md` または `docs/guides/...`）を更新（例外時は理由記載）
- [ ] UI-Only の場合、コミット本文に `UI-Only: true` を記載
- [ ] Electron 更新は `build(electron)` を使用

## Impact Surface (If Applicable)
- [ ] Scene順序（`sceneOrder`）
- [ ] Cut順序（`cut.order`）
- [ ] `displayTime`
- [ ] Framing
- [ ] 音声ミックス
- [ ] LipSync

## Parity Check: Preview/Export (If Applicable)
- [ ] 影響なし
- [ ] 両方確認済み
- [ ] 例外あり（ADR追加済み）

## Validation
- [ ] 動作確認を実施した
- [ ] 必要なテストを追加・更新した
- [ ] 既存テストを実行し、回帰がないことを確認した

## Risks / Follow-ups
- 

---
Codex note: PR作成前に `git log --oneline <base>..HEAD` でコミット一覧を確認し、規約違反がないことを確認してから提出する。
