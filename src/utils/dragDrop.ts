import { v4 as uuidv4 } from 'uuid';
import { getPathForFileBridge } from '../features/platform/electronGateway';
import type { CutImportSource } from './cutImport';
import { getCuttableMediaType } from './mediaType';

export type CuttableMediaType = 'image' | 'video';
export type DragKind = 'asset' | 'externalFiles' | 'none';
const DND_DEBUG_STORAGE_KEY = 'sceneDeck:dndDebug';
export const DND_DEBUG_EVENT_NAME = 'scene-deck-dnd-debug';

interface DragDebugItemSnapshot {
  kind: string;
  type: string;
  hasFile: boolean;
  name?: string;
}

interface DragDebugFileSnapshot {
  name: string;
  type: string;
  size: number;
  hasPath: boolean;
  mediaType: CuttableMediaType | null;
}

export interface DragDebugSnapshot {
  types: string[];
  itemCount: number;
  fileCount: number;
  items: DragDebugItemSnapshot[];
  files: DragDebugFileSnapshot[];
}

export interface DragDebugEventDetail {
  label: string;
  details?: Record<string, unknown>;
  snapshot: DragDebugSnapshot;
  ts: string;
}

export function getMediaType(filename: string): CuttableMediaType | null {
  return getCuttableMediaType(filename);
}

export function isDndDebugEnabled(): boolean {
  const envEnabled = import.meta.env.DEV && import.meta.env.VITE_DND_DEBUG_HUD === '1';
  if (envEnabled) return true;
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DND_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDndDebugEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.localStorage.setItem(DND_DEBUG_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(DND_DEBUG_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getFilePath(file: File): string | undefined {
  const fromBridge = getPathForFileBridge(file);
  if (fromBridge) return fromBridge;
  return (file as File & { path?: string }).path;
}

export function getSupportedMediaFiles(dataTransfer: DataTransfer): File[] {
  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0) {
    const filesFromItems = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && getMediaType(file.name) !== null);
    if (filesFromItems.length > 0) {
      return filesFromItems;
    }
  }

  return Array.from(dataTransfer.files || [])
    .filter((file) => getMediaType(file.name) !== null);
}

export function hasSupportedMediaDrag(dataTransfer: DataTransfer): boolean {
  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0) {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      if (item.type?.startsWith('image/') || item.type?.startsWith('video/')) {
        return true;
      }
      const file = item.getAsFile();
      if (file && getMediaType(file.name) !== null) {
        return true;
      }
    }
  }

  return Array.from(dataTransfer.files || []).some((file) => getMediaType(file.name) !== null);
}

export function hasAssetPanelDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes('text/scene-deck-asset')
    || dataTransfer.types.includes('application/json');
}

export function getDragKind(dataTransfer: DataTransfer): DragKind {
  if (hasAssetPanelDrag(dataTransfer)) return 'asset';
  if (hasSupportedMediaDrag(dataTransfer) || getSupportedMediaFiles(dataTransfer).length > 0) {
    return 'externalFiles';
  }
  return 'none';
}

export function createDragDebugSnapshot(dataTransfer: DataTransfer): DragDebugSnapshot {
  const items = Array.from(dataTransfer.items || []);
  const files = Array.from(dataTransfer.files || []);

  return {
    types: Array.from(dataTransfer.types || []),
    itemCount: items.length,
    fileCount: files.length,
    items: items.map((item) => {
      const file = item.kind === 'file' ? item.getAsFile() : null;
      return {
        kind: item.kind,
        type: item.type || '',
        hasFile: !!file,
        name: file?.name,
      };
    }),
    files: files.map((file) => {
      const path = getFilePath(file);
      return {
        name: file.name,
        type: file.type || '',
        size: file.size,
        hasPath: !!path,
        mediaType: getMediaType(file.name),
      };
    }),
  };
}

export function logDragDebug(
  label: string,
  dataTransfer: DataTransfer,
  details?: Record<string, unknown>
): void {
  if (!isDndDebugEnabled()) return;
  const payload: DragDebugEventDetail = {
    label,
    details,
    snapshot: createDragDebugSnapshot(dataTransfer),
    ts: new Date().toISOString(),
  };
  console.warn(`[DND] ${label}`, payload);
  window.dispatchEvent(new CustomEvent<DragDebugEventDetail>(DND_DEBUG_EVENT_NAME, {
    detail: payload,
  }));
}

interface QueueExternalFilesToSceneOptions {
  sceneId: string;
  files: File[];
  createCutFromImport: (
    sceneId: string,
    source: CutImportSource,
    insertIndex?: number,
    vaultPathOverride?: string | null
  ) => Promise<string>;
  insertIndex?: number;
  vaultPathOverride?: string | null;
}

let importQueue: Promise<void> = Promise.resolve();

function enqueueImportTask(task: () => Promise<void>): void {
  importQueue = importQueue
    .then(async () => {
      await task();
      // Yield to the event loop between imports to keep drag UI responsive.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    })
    .catch(() => {
      // Keep queue alive even if a task fails.
    });
}

export function queueExternalFilesToScene({
  sceneId,
  files,
  createCutFromImport,
  insertIndex,
  vaultPathOverride,
}: QueueExternalFilesToSceneOptions): void {
  let offset = 0;
  for (const file of files) {
    const mediaType = getMediaType(file.name);
    const filePath = getFilePath(file);
    if (!filePath || !mediaType) continue;

    const assetId = uuidv4();
    const nextInsertIndex = insertIndex !== undefined ? insertIndex + offset : undefined;
    offset += 1;

    enqueueImportTask(async () => {
      await createCutFromImport(sceneId, {
        assetId,
        name: file.name,
        sourcePath: filePath,
        type: mediaType,
        fileSize: file.size,
      }, nextInsertIndex, vaultPathOverride);
    });
  }
}
