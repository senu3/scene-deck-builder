import { describe, expect, it } from 'vitest';
import { buildProjectSavePayload, serializeProjectSavePayload } from '../projectSave';

const base = {
  version: 3,
  name: 'Project',
  vaultPath: 'C:/vault',
  scenes: [{ id: 's1', name: 'Scene 1', cuts: [], order: 0, notes: [] }],
  sourcePanel: { folders: [], expandedPaths: [], viewMode: 'list' as const },
  savedAt: '2026-02-05T00:00:00.000Z',
};

describe('projectSave', () => {
  it('builds payload with expected fields', () => {
    const payload = buildProjectSavePayload(base);
    expect(payload).toEqual(base);
  });

  it('serializes payload to JSON string', () => {
    const payload = buildProjectSavePayload(base);
    const serialized = serializeProjectSavePayload(payload);
    expect(serialized).toBe(JSON.stringify(base));
  });

  it('includes target duration when provided', () => {
    const payload = buildProjectSavePayload({ ...base, targetTotalDurationSec: 1500 });
    expect(payload.targetTotalDurationSec).toBe(1500);
  });
});
