# TODO Done Archive (2026-02)

このファイルは 2026-02 に完了した TODO のアーカイブ。

## TODO-DEBT-001
- ArchivedOn: 2026-02-20
- Summary: Vaultガイドを現行実装に合わせて更新し、Export正本入口・Vault責務境界・不変条件・未確定事項を固定した。
- UpdatedDocs:
  - `docs/guides/vault-assets.md`
  - `docs/guides/export.md`
  - `docs/references/DOMAIN.md`
  - `docs/references/MAPPING.md`

## TODO-DEBT-005
- ArchivedOn: 2026-02-20
- Summary: project再ロード時のscene attach audio未復元不具合を修正し、assetCache hydration回帰テストを追加した。
- UpdatedFiles:
  - `src/store/slices/metadataSlice.ts`
  - `src/store/__tests__/metadataLoadSceneAudioHydration.test.ts`
