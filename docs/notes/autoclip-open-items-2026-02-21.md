# AutoClip Open Items (2026-02-21)

## 背景
- AutoClip（Simple）は実装済みだが、精度とUI導線に未確定事項が残っている。

## Open Items
1. 精度課題
- 誤分割/過分割の再現条件を固定して評価セットを作る。
- mode別（default/aggressive）の体感差と実測差を分離して確認する。

2. UI配置未確定
- 現在は Cut context menu 入口。
- PreviewModal への移設可否を、操作頻度と誤操作リスクで評価する。

3. RMSスナップ有効性
- 実装上は RMS 解析成功時にスナップ補正を使用。
- ただし、実運用で有効に効いているか（品質向上に寄与しているか）は未検証。

## Decision Checklist
- `conservative` をUI公開するか。
- PreviewModal に入口を追加するか（または置換するか）。
- RMSスナップを維持/簡素化/廃止するか。

## Done Criteria
- 上記3項目の判断結果が確定し、`docs/guides/autoclip.md`（L1）に境界だけ反映されている。
- 実装詳細が `docs/guides/implementation/autoclip-simple.md` と一致している。
