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

const files = walk(srcDir);
const warnings = [];

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
