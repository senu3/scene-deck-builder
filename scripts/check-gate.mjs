#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const baselinePath = path.join(root, 'scripts', 'check-gate-baseline.json');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function findAll(source, regex) {
  const matches = [];
  let m;
  while ((m = regex.exec(source)) !== null) {
    matches.push({ index: m.index, text: m[0] });
  }
  return matches;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function checkHotpathBlock({
  warningsRef,
  source,
  file,
  gate,
  startRegex,
  lookaheadChars,
  forbiddenPatterns,
}) {
  for (const m of findAll(source, startRegex)) {
    const block = source.slice(m.index, Math.min(source.length, m.index + lookaheadChars));
    for (const forbidden of forbiddenPatterns) {
      forbidden.pattern.lastIndex = 0;
      if (!forbidden.pattern.test(block)) continue;
      warningsRef.push({
        gate,
        file,
        line: lineOf(source, m.index),
        message: forbidden.message,
      });
    }
  }
}

const files = walk(srcDir);
const warnings = [];
const gate6AllowedUseStoreSetStateRules = [
  { path: 'src/store/commands.ts', reason: 'command undo/restore path (ADR-0003 boundary)' },
];
const gate6AllowedScenesSetRules = [
  { path: 'src/store/slices/cutTimelineSlice.ts', reason: 'core timeline slice mutation boundary' },
  { path: 'src/store/slices/groupSlice.ts', reason: 'group operations on timeline structure' },
  { path: 'src/store/slices/projectSlice.ts', reason: 'project load/restore normalization path (ADR-0003 exception)' },
];
const gate6AllowedUseStoreSetStateFiles = new Set(gate6AllowedUseStoreSetStateRules.map((rule) => rule.path));
const gate6AllowedScenesSetFiles = new Set(gate6AllowedScenesSetRules.map((rule) => rule.path));
const gate10HotpathFiles = new Set([
  'src/components/PreviewModal.tsx',
  'src/utils/previewPlaybackController.ts',
  'src/utils/previewMedia.tsx',
]);
const gate10ForbiddenInHotpathBlock = [
  {
    pattern: /\b(readFileSync|writeFileSync|appendFileSync|openSync|statSync|spawnSync|execSync)\b/g,
    message: 'sync I/O/process API detected in playback hotpath block',
  },
  {
    pattern: /\bwindow\.electronAPI\.(readAudioPcm|exportSequence|showSaveSequenceDialog|generateThumbnail|getVideoMetadata)\b/g,
    message: 'electron heavy API detected in playback hotpath block',
  },
  {
    pattern: /\banalyzeAudioRms\s*\(/g,
    message: 'audio analysis detected in playback hotpath block',
  },
  {
    pattern: /\bspawn\s*\(/g,
    message: 'process spawn usage detected in playback hotpath block',
  },
  {
    pattern: /\bawait\b|\.then\s*\(/g,
    message: 'async wait chain detected in playback hotpath block',
  },
];

for (const file of files) {
  const r = rel(file);
  if (r.includes('/__tests__/') || /\.test\.(ts|tsx)$/.test(r)) continue;
  const src = fs.readFileSync(file, 'utf8');

  // Gate 8: cut.asset should be localized in assetResolve.
  if (r !== 'src/utils/assetResolve.ts') {
    for (const m of findAll(src, /\bcut\.asset\b/g)) {
      warnings.push({
        gate: 'Gate8',
        file: r,
        line: lineOf(src, m.index),
        message: 'cut.asset usage outside assetResolve.ts',
      });
    }
  }

  // Gate 9: getThumbnail should pass explicit profile.
  if (r !== 'src/utils/thumbnailCache.ts') {
    for (const m of findAll(src, /getThumbnail\(/g)) {
      const tail = src.slice(m.index, Math.min(src.length, m.index + 400));
      const callText = tail.split(');')[0] || tail;
      if (callText.includes('profile')) continue;
      warnings.push({
        gate: 'Gate9',
        file: r,
        line: lineOf(src, m.index),
        message: 'getThumbnail call without explicit profile',
      });
    }
  }

  // Gate 3/4: PreviewModal must not reintroduce direct displayTime hand-calculation paths.
  if (r === 'src/components/PreviewModal.tsx') {
    for (const m of findAll(src, /\b(?:\w+\.)?cut\.displayTime\b/g)) {
      warnings.push({
        gate: 'Gate3',
        file: r,
        line: lineOf(src, m.index),
        message: 'direct cut.displayTime reference in PreviewModal (use canonical timings)',
      });
    }

    for (const m of findAll(src, /reduce\s*\(/g)) {
      const tail = src.slice(m.index, Math.min(src.length, m.index + 240));
      if (!tail.includes('displayTime')) continue;
      warnings.push({
        gate: 'Gate4',
        file: r,
        line: lineOf(src, m.index),
        message: 'reduce(...displayTime...) in PreviewModal (use canonical timing helpers)',
      });
    }
  }

  // Gate 6: state boundary checks (ADR-0003)
  // 1) useStore.setState is allowed only in boundary-approved files.
  for (const m of findAll(src, /\buseStore\.setState\s*\(/g)) {
    if (gate6AllowedUseStoreSetStateFiles.has(r)) continue;
    warnings.push({
      gate: 'Gate6',
      file: r,
      line: lineOf(src, m.index),
      message: 'useStore.setState outside Gate6 allowlist',
    });
  }

  // 2) Direct scenes mutation via set((state)=>({ scenes: ... })) is allowed only in core timeline slices.
  const scenesSetPatterns = [
    /\bset\s*\(\s*\(\s*(?:state|currentState)\s*\)\s*=>[\s\S]{0,500}?scenes\s*:/g,
    /\bset\s*\(\s*(?:state|currentState)\s*=>[\s\S]{0,500}?scenes\s*:/g,
  ];
  for (const pattern of scenesSetPatterns) {
    for (const m of findAll(src, pattern)) {
      if (gate6AllowedScenesSetFiles.has(r)) continue;
      warnings.push({
        gate: 'Gate6',
        file: r,
        line: lineOf(src, m.index),
        message: 'set(...scenes:...) outside Gate6 allowlist',
      });
    }
  }

  // Gate 10: playback hotpath must not include heavy processing.
  if (gate10HotpathFiles.has(r)) {
    for (const m of findAll(src, /from\s+['"]node:|from\s+['"]fs['"]|from\s+['"]child_process['"]/g)) {
      warnings.push({
        gate: 'Gate10',
        file: r,
        line: lineOf(src, m.index),
        message: 'node/fs/process import detected in playback hotpath file',
      });
    }
  }
  if (r === 'src/components/PreviewModal.tsx') {
    checkHotpathBlock({
      warningsRef: warnings,
      source: src,
      file: r,
      gate: 'Gate10',
      startRegex: /const update = \(\) => \{/g,
      lookaheadChars: 1200,
      forbiddenPatterns: gate10ForbiddenInHotpathBlock,
    });
  }
  if (r === 'src/utils/previewPlaybackController.ts') {
    checkHotpathBlock({
      warningsRef: warnings,
      source: src,
      file: r,
      gate: 'Gate10',
      startRegex: /const tick = useCallback\(\(localTime: number\) => \{/g,
      lookaheadChars: 1800,
      forbiddenPatterns: gate10ForbiddenInHotpathBlock,
    });
  }
  if (r === 'src/utils/previewMedia.tsx') {
    checkHotpathBlock({
      warningsRef: warnings,
      source: src,
      file: r,
      gate: 'Gate10',
      startRegex: /private tick = \(\) => \{/g,
      lookaheadChars: 1200,
      forbiddenPatterns: gate10ForbiddenInHotpathBlock,
    });
  }
}

// Gate 2: safeOrder fallback should be tracked until removed.
const timelineOrderFile = path.join(srcDir, 'utils', 'timelineOrder.ts');
if (fs.existsSync(timelineOrderFile)) {
  const src = fs.readFileSync(timelineOrderFile, 'utf8');
  const i = src.indexOf('safeOrder(');
  if (i >= 0) {
    warnings.push({
      gate: 'Gate2',
      file: 'src/utils/timelineOrder.ts',
      line: lineOf(src, i),
      message: 'safeOrder fallback still present',
    });
  }
}

if (warnings.length === 0) {
  console.log('[gate-check] OK: no warnings.');
  process.exit(0);
}

console.log(`[gate-check] WARN: ${warnings.length} item(s) detected.`);
for (const w of warnings) {
  console.log(`- ${w.gate} ${w.file}:${w.line} ${w.message}`);
}

if (process.argv.includes('--strict')) {
  let allowlist = new Set();
  if (fs.existsSync(baselinePath)) {
    try {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const entries = Array.isArray(baseline?.allowWarnings) ? baseline.allowWarnings : [];
      allowlist = new Set(entries.map((entry) => `${entry.gate}|${entry.file}|${entry.message}`));
    } catch (error) {
      console.error(`[gate-check] Failed to parse baseline: ${baselinePath}`);
      console.error(error);
      process.exit(1);
    }
  }

  const unexpected = warnings.filter((w) => !allowlist.has(`${w.gate}|${w.file}|${w.message}`));
  if (unexpected.length > 0) {
    console.log(`[gate-check] STRICT FAIL: ${unexpected.length} unexpected warning(s).`);
    for (const w of unexpected) {
      console.log(`  * ${w.gate} ${w.file}:${w.line} ${w.message}`);
    }
    process.exit(1);
  }

  console.log('[gate-check] STRICT OK: warnings are all in baseline allowlist.');
}
