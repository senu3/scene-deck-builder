# Audio整備 + Export前提仕様（実装済みアーカイブ）

**アーカイブ日**: 2026-02-11  
**元ファイル**: `docs/notes/audio_pre_export_design.md`

## 実装済み事項（固定）
- AttachAudio は `AssetMetadata.attachedAudioId` ではなく `Cut.audioBindings` が主経路。
- `CutAudioBinding.kind` により音声分類を cut 単位で保持。
- `Cut.useEmbeddedAudio` は実装済み（既定 `true`、未定義も `true` 扱い）。
- DetailsPanel に `Audio from the video:` トグルを実装（Video cutのみ）。
- Preview は `globalMuted || !useEmbeddedAudio` で内蔵音声ミュート判定。

## 固定済みモデル
```ts
type AudioTrackKind = 'voice.lipsync' | 'voice.other' | 'se' | 'embedded';

interface CutAudioBinding {
  id: string;
  audioAssetId: string;
  sourceName?: string;
  offsetSec: number;
  gain?: number;
  enabled: boolean;
  kind: Exclude<AudioTrackKind, 'embedded'>;
}

interface Cut {
  audioBindings?: CutAudioBinding[];
  useEmbeddedAudio?: boolean; // default true (legacy undefined -> true)
}
```

## 実装済みテスト観点
- `useEmbeddedAudio` の保存/復元
- `setCutUseEmbeddedAudio` の更新
- 未定義値を `true` として扱う互換動作

## 備考
- ここは履歴保管用。現行運用は `docs/guides/export-guide.md` を正とする。
