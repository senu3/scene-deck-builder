#!/usr/bin/env node

import { execSync } from "node:child_process";

function parseArgs(argv) {
  const options = {
    from: "",
    to: "HEAD",
    mode: "warn",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--from") {
      options.from = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--to") {
      options.to = argv[i + 1] ?? "HEAD";
      i += 1;
    } else if (arg === "--mode") {
      const mode = argv[i + 1] ?? "warn";
      options.mode = mode === "fail" ? "fail" : "warn";
      i += 1;
    }
  }

  return options;
}

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function safeRun(command) {
  try {
    return run(command);
  } catch {
    return "";
  }
}

function splitLines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isLogicHeavyPath(filePath) {
  const p = normalizePath(filePath);
  if (p.startsWith("electron/") || p.startsWith("scripts/")) return true;
  if (p.startsWith("src/store/")) return true;
  if (p.startsWith("src/utils/")) return true;
  if (p.startsWith("src/features/")) return true;
  if (p.startsWith("src/types/")) return true;

  const isTsFile = p.endsWith(".ts") || p.endsWith(".tsx");
  if (isTsFile && p.startsWith("src/") && !p.startsWith("src/components/")) {
    return true;
  }

  return false;
}

function hasUiOnlyFooter(body) {
  return /^UI-Only:\s*true\s*$/im.test(body);
}

function parseScope(header) {
  const m = header.match(/^[a-z]+(?:\(([a-z0-9-]+)\))?:\s.+$/i);
  return m?.[1] ?? "";
}

const { from, to, mode } = parseArgs(process.argv.slice(2));
const range = from ? `${from}..${to}` : to;
const shas = splitLines(safeRun(`git rev-list --reverse ${range}`));
const changedFiles = splitLines(safeRun(`git diff --name-only ${range}`)).map(normalizePath);
const warnings = [];

let hasGateScopeCommit = false;

for (const sha of shas) {
  const header = safeRun(`git log -1 --pretty=format:%s ${sha}`);
  const body = safeRun(`git log -1 --pretty=format:%b ${sha}`);
  const scope = parseScope(header);
  if (/^gate([1-9]|10)$/.test(scope)) {
    hasGateScopeCommit = true;
  }

  if (hasUiOnlyFooter(body)) {
    const files = splitLines(
      safeRun(`git show --name-only --pretty=format: ${sha}`).replace(/^\s+|\s+$/g, ""),
    ).map(normalizePath);
    const logicHeavyFiles = files.filter(isLogicHeavyPath);
    if (logicHeavyFiles.length > 0) {
      warnings.push(
        `[${sha.slice(0, 7)}] UI-Only: true が指定されていますが、ロジック影響の大きい変更を検知しました: ${logicHeavyFiles.join(", ")}`,
      );
    }
  }
}

if (hasGateScopeCommit) {
  const docsChanged = changedFiles.some((p) => p.startsWith("docs/"));
  if (!docsChanged) {
    warnings.push(
      "scope=gateN のコミットがありますが、差分に docs/ の更新が見つかりません。例外の場合は PR 本文に理由を明記してください。",
    );
  }
}

if (warnings.length === 0) {
  console.log(`[check-commit-policy] OK (${range})`);
  process.exit(0);
}

for (const warning of warnings) {
  console.warn(`::warning::${warning}`);
}
console.warn(`[check-commit-policy] warnings: ${warnings.length}`);

if (mode === "fail") {
  process.exit(1);
}

process.exit(0);
