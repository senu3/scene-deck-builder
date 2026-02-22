import { describe, expect, it } from 'vitest';
import { getDragKind, getSupportedMediaFiles, hasSupportedMediaDrag } from '../dragDrop';

function createDataTransferMock({
  items,
  files,
  types,
}: {
  items?: Array<{
    kind: string;
    type?: string;
    getAsFile: () => File | null;
  }>;
  files?: File[];
  types?: string[];
}): DataTransfer {
  return {
    items: (items ?? []) as unknown as DataTransferItemList,
    files: (files ?? []) as unknown as FileList,
    types: types ?? [],
  } as unknown as DataTransfer;
}

describe('dragDrop external file detection', () => {
  it('detects external files from files list even when types does not include Files', () => {
    const file = new File(['x'], 'test.png', { type: 'image/png' });
    const dt = createDataTransferMock({
      files: [file],
      types: [],
    });

    expect(getDragKind(dt)).toBe('externalFiles');
  });

  it('falls back to files list when items exist but do not expose usable files', () => {
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const dt = createDataTransferMock({
      items: [
        { kind: 'file', type: '', getAsFile: () => null },
      ],
      files: [file],
      types: [],
    });

    expect(getSupportedMediaFiles(dt)).toHaveLength(1);
    expect(hasSupportedMediaDrag(dt)).toBe(true);
    expect(getDragKind(dt)).toBe('externalFiles');
  });

  it('keeps none for unsupported file extensions', () => {
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    const dt = createDataTransferMock({
      files: [file],
      types: [],
    });

    expect(getDragKind(dt)).toBe('none');
  });
});
