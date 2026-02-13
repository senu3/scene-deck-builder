import * as fs from 'fs';
import * as path from 'path';

export interface ExportSubtitleStyle {
  fontSizePx: number;
  fontColor: string;
  backgroundEnabled: boolean;
  backgroundOpacity: number;
  position: 'bottom' | 'center';
  outlineEnabled: boolean;
  shadowEnabled: boolean;
}

export interface ExportSubtitleRange {
  start: number;
  end: number;
}

export interface ExportSubtitlePayload {
  text: string;
  range?: ExportSubtitleRange;
}

const DEFAULT_SUBTITLE_STYLE: ExportSubtitleStyle = {
  fontSizePx: 36,
  fontColor: '#ffffff',
  backgroundEnabled: true,
  backgroundOpacity: 0.5,
  position: 'bottom',
  outlineEnabled: true,
  shadowEnabled: true,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeHexColor(value: string | undefined): string {
  if (!value) return DEFAULT_SUBTITLE_STYLE.fontColor;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : DEFAULT_SUBTITLE_STYLE.fontColor;
}

export function sanitizeExportSubtitleStyle(style?: Partial<ExportSubtitleStyle> | null): ExportSubtitleStyle {
  return {
    fontSizePx: Math.round(clamp(style?.fontSizePx ?? DEFAULT_SUBTITLE_STYLE.fontSizePx, 12, 96)),
    fontColor: normalizeHexColor(style?.fontColor),
    backgroundEnabled: style?.backgroundEnabled ?? DEFAULT_SUBTITLE_STYLE.backgroundEnabled,
    backgroundOpacity: clamp(style?.backgroundOpacity ?? DEFAULT_SUBTITLE_STYLE.backgroundOpacity, 0, 1),
    position: style?.position === 'center' ? 'center' : 'bottom',
    outlineEnabled: style?.outlineEnabled ?? DEFAULT_SUBTITLE_STYLE.outlineEnabled,
    shadowEnabled: style?.shadowEnabled ?? DEFAULT_SUBTITLE_STYLE.shadowEnabled,
  };
}

export function normalizeSubtitleRangeForDuration(
  range: ExportSubtitleRange | undefined,
  durationSec: number
): ExportSubtitleRange {
  const max = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  if (!range) return { start: 0, end: max };
  const a = clamp(range.start, 0, max);
  const b = clamp(range.end, 0, max);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function escapeDrawtext(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function toFfmpegColor(hexColor: string): string {
  return `0x${hexColor.replace('#', '')}`;
}

function escapeDrawtextValue(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function resolveDefaultSubtitleFontFile(): string | null {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    const fontDir = path.join(winDir, 'Fonts');
    candidates.push(
      path.join(fontDir, 'meiryo.ttc'),
      path.join(fontDir, 'YuGothM.ttc'),
      path.join(fontDir, 'msgothic.ttc'),
      path.join(fontDir, 'arialuni.ttf')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
      '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
      '/System/Library/Fonts/AppleSDGothicNeo.ttc'
    );
  } else {
    candidates.push(
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate.replace(/\\/g, '/');
    }
  }
  return null;
}

export function buildSubtitleDrawtextFilter(
  subtitle: ExportSubtitlePayload | undefined,
  durationSec: number,
  styleInput?: Partial<ExportSubtitleStyle> | null
): string | null {
  if (!subtitle?.text?.trim()) return null;
  const style = sanitizeExportSubtitleStyle(styleInput);
  const range = normalizeSubtitleRangeForDuration(subtitle.range, durationSec);
  const y = style.position === 'center'
    ? '(h-text_h)/2'
    : 'h-(text_h*2)-40';
  const box = style.backgroundEnabled
    ? `box=1:boxcolor=black@${style.backgroundOpacity.toFixed(3)}:boxborderw=12`
    : 'box=0';
  const outline = style.outlineEnabled ? 'borderw=2:bordercolor=black@0.9' : 'borderw=0';
  const shadow = style.shadowEnabled ? 'shadowx=2:shadowy=2:shadowcolor=black@0.75' : 'shadowx=0:shadowy=0';
  const fontFile = resolveDefaultSubtitleFontFile();
  const fontFileExpr = fontFile ? `fontfile='${escapeDrawtextValue(fontFile)}'` : null;
  return [
    `drawtext=text='${escapeDrawtext(subtitle.text)}'`,
    `enable='between(t,${range.start.toFixed(3)},${range.end.toFixed(3)})'`,
    ...(fontFileExpr ? [fontFileExpr] : []),
    `fontsize=${style.fontSizePx}`,
    `fontcolor=${toFfmpegColor(style.fontColor)}`,
    'x=(w-text_w)/2',
    `y=${y}`,
    box,
    outline,
    shadow,
  ].join(':');
}
