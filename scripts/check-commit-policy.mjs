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

function isGitGeneratedMergeHeader(header) {
  return (
    /^Merge branch '.+'(?: into .+)?$/i.test(header) ||
    /^Merge remote-tracking branch '.+'(?: into .+)?$/i.test(header) ||
    /^Merge pull request #\d+ from .+$/i.test(header) ||
    /^Merge tag '.+'(?: into .+)?$/i.test(header)
  );
}

function parseCommitHeader(header) {
  const conventional = header.match(
    /^(feat|fix|refactor|docs|test|chore|build|ci)\(([^)]+)\):\s+(.+)$/i,
  );
  if (conventional) {
    return {
      kind: "conventional",
      type: conventional[1].toLowerCase(),
      scope: conventional[2],
    };
  }

  if (isGitGeneratedMergeHeader(header)) {
    return {
      kind: "merge-generated",
      type: "merge",
      scope: "",
    };
  }

  return null;
}

const { from, to, mode } = parseArgs(process.argv.slice(2));
const range = from ? `${from}..${to}` : to;
const shas = splitLines(safeRun(`git rev-list --reverse ${range}`));
const warnings = [];

for (const sha of shas) {
  const header = safeRun(`git log -1 --pretty=format:%s ${sha}`);
  const body = safeRun(`git log -1 --pretty=format:%b ${sha}`);
  const parsedHeader = parseCommitHeader(header);
  if (!parsedHeader) {
    warnings.push(
      `[${sha.slice(0, 7)}] コミット件名が規約外です。許可形式: type(scope): subject または Git生成のマージ定型文`,
    );
    continue;
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
