export function clampToDuration(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, time));
}

export function constrainMarkerTime(
  marker: 'in' | 'out',
  candidateTime: number,
  duration: number,
  inPoint: number | null,
  outPoint: number | null,
): number {
  let next = clampToDuration(candidateTime, duration);
  if (marker === 'in' && outPoint !== null) {
    next = Math.min(next, outPoint);
  }
  if (marker === 'out' && inPoint !== null) {
    next = Math.max(next, inPoint);
  }
  return next;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
