import { describe, expect, it } from 'vitest';
import { getAssetDisplayName } from '../assetDisplayName';

describe('getAssetDisplayName', () => {
  it('prefers originalName when available', () => {
    expect(getAssetDisplayName({
      name: 'img_abcdef123456.png',
      originalName: 'cover.png',
      path: 'C:/vault/assets/img_abcdef123456.png',
      originalPath: 'C:/imports/cover.png',
    })).toBe('cover.png');
  });

  it('uses asset.name when it differs from the stored filename', () => {
    expect(getAssetDisplayName({
      name: 'Display Title.wav',
      path: 'C:/vault/assets/aud_abcdef123456.wav',
      originalPath: 'C:/imports/source.wav',
    })).toBe('Display Title.wav');
  });

  it('falls back to originalPath basename when name mirrors the stored filename', () => {
    expect(getAssetDisplayName({
      name: 'aud_123.wav',
      path: 'C:/vault/assets/aud_123.wav',
      originalPath: 'D:/recordings/voice_take_01.wav',
    })).toBe('voice_take_01.wav');
  });
});
