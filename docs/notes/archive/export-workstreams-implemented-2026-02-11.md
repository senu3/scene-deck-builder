# Export Workstreams（Archive）

**目的**: Export関連ワークストリーム（Line A/B/C）の実装完了時点を記録する。  
**アーカイブ日**: 2026-02-11

## 最終ステータス

### Line A: Audio Model / Routing
- ステータス: 継続中（MP4本線から分離）
- 実装済み:
  - `Cut.audioBindings` / `useEmbeddedAudio` 基本モデル導入
- 実装済み（追記）:
  - metadata attachedAudio 残骸削除（`AssetMetadata`/`metadataStore`/`assetRefs` から legacy 削除）
- メモ化:
  - AttachAudio ON/OFF（`audioBindings[].enabled`）UI最小導入案
- 中止:
  - Export向け音声出力仕様の最終確定
- 現行運用: `docs/guides/export-guide.md`

### Line B: MP4 Export (LipSync + VideoClip + Framing)
- ステータス: 完了（MVP実装完了）
- 実装済み要点:
  - Preview/Export framing 解決の共通化（`resolveFramingParams`）
  - LipSync payload の厳密検証と silent fallback 禁止
  - Export実行経路の App 側一本化
  - `resolveExportPlan` による設定正規化レイヤー追加
  - ExportModal の MP4 実運用切替（AviUtl は Coming Soon）
  - 成果物 `video.mp4 + manifest.json + timeline.txt` 出力
  - parity/統合回帰テスト追加
  - Export進行中 Banner 表示と完了時自動削除
 - 現行運用: `docs/guides/export-guide.md`

### Line C: Naming / Glossary Governance
- ステータス: 継続運用（MP4実装範囲は反映済み）
- 現行運用: `docs/guides/export-guide.md`

## 補足
- Workstreamの親管理ノートは本ファイルでクローズした。
- 今後の更新は Line A/B/C 各ノートで個別に継続する。
