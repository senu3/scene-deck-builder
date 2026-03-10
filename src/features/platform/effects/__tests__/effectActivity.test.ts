import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetEffectActivityForTests,
  getEffectActivityEntries,
  recordEffectActivity,
  subscribeEffectActivity,
} from '../effectActivity';

describe('effectActivity', () => {
  afterEach(() => {
    __resetEffectActivityForTests();
  });

  it('records entries and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEffectActivity(listener);

    recordEffectActivity({
      stage: 'issued',
      effectType: 'SAVE_METADATA',
      channel: 'commit',
      orderingKey: 'vault-metadata',
      commandId: 'cmd-1',
      commandType: 'UpdateSceneCommand',
    });

    const entries = getEffectActivityEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.seq).toBe(1);
    expect(entries[0]?.commandType).toBe('UpdateSceneCommand');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    recordEffectActivity({
      stage: 'success',
      effectType: 'SAVE_METADATA',
      channel: 'commit',
      orderingKey: 'vault-metadata',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
