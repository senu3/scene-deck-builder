import { describe, expect, it } from 'vitest';
import { buildSubtitleDrawtextFilter, escapeDrawtext } from '../subtitleExport';

describe('subtitleExport', () => {
  it('escapes drawtext special characters safely', () => {
    const escaped = escapeDrawtext("A:B\\C'D\n100% [ok]");
    expect(escaped).toBe("A\\:B\\\\C\\'D\\n100\\% \\[ok\\]");
  });

  it('builds drawtext filter with normalized between range', () => {
    const filter = buildSubtitleDrawtextFilter(
      {
        text: 'hello',
        range: { start: 1.5, end: -1 },
      },
      2
    );
    expect(filter).toContain("drawtext=text='hello'");
    expect(filter).toContain("enable='between(t,0.000,1.500)'");
  });
});
