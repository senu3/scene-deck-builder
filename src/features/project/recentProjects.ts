function normalizeProjectPathSegments(projectPath: string): {
  prefix: string;
  body: string;
  windowsLike: boolean;
} {
  const normalizedSeparators = projectPath.trim().replace(/\\/g, '/');
  const windowsDriveMatch = normalizedSeparators.match(/^[A-Za-z]:/);
  const isUncPath = normalizedSeparators.startsWith('//');
  const hasLeadingSlash = normalizedSeparators.startsWith('/');
  const segments = normalizedSeparators.split('/').filter(Boolean);
  const body = segments.join('/');

  if (windowsDriveMatch) {
    return {
      prefix: `${windowsDriveMatch[0][0]}:`,
      body: body.slice(2),
      windowsLike: true,
    };
  }

  return {
    prefix: isUncPath ? '//' : (hasLeadingSlash ? '/' : ''),
    body,
    windowsLike: isUncPath,
  };
}

export function normalizeRecentProjectIdentity(projectPath: string): string {
  if (projectPath.trim().length === 0) return '';

  const { prefix, body, windowsLike } = normalizeProjectPathSegments(projectPath);
  const combined = `${prefix}${body}`;

  if (windowsLike || /^[A-Za-z]:/.test(combined)) {
    return combined.toLowerCase();
  }

  return combined;
}

export function removeRecentProjectsByPath<T extends { path: string }>(
  projects: T[],
  projectPath: string,
): T[] {
  const targetIdentity = normalizeRecentProjectIdentity(projectPath);
  return projects.filter((entry) => normalizeRecentProjectIdentity(entry.path) !== targetIdentity);
}

export function upsertRecentProjectEntry<T extends { path: string }>(
  projects: T[],
  nextEntry: T,
  limit = 10,
): T[] {
  const filtered = removeRecentProjectsByPath(projects, nextEntry.path);
  return [nextEntry, ...filtered.slice(0, Math.max(limit - 1, 0))];
}

export function dedupeRecentProjectEntries<T extends { path: string }>(
  projects: T[],
): { projects: T[]; changed: boolean } {
  const seen = new Set<string>();
  const deduped: T[] = [];
  let changed = false;

  for (const project of projects) {
    const identity = normalizeRecentProjectIdentity(project.path);
    if (seen.has(identity)) {
      changed = true;
      continue;
    }
    seen.add(identity);
    deduped.push(project);
  }

  return {
    projects: deduped,
    changed,
  };
}
