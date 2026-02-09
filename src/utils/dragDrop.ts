import { v4 as uuidv4 } from 'uuid';
import type { CutImportSource } from './cutImport';
import { getCuttableMediaType } from './mediaType';

export type CuttableMediaType = 'image' | 'video';
export type DragKind = 'asset' | 'externalFiles' | 'none';

export function getMediaType(filename: string): CuttableMediaType | null {
  return getCuttableMediaType(filename);
}

export function getFilePath(file: File): string | undefined {
  return (file as File & { path?: string }).path;
}

export function getSupportedMediaFiles(dataTransfer: DataTransfer): File[] {
  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0) {
    return items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && getMediaType(file.name) !== null);
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
    return false;
  }

  return Array.from(dataTransfer.files || []).some((file) => getMediaType(file.name) !== null);
}

export function hasAssetPanelDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes('text/scene-deck-asset')
    || dataTransfer.types.includes('application/json');
}

export function getDragKind(dataTransfer: DataTransfer): DragKind {
  if (hasAssetPanelDrag(dataTransfer)) return 'asset';
  if (dataTransfer.types.includes('Files')) {
    if (hasSupportedMediaDrag(dataTransfer) || getSupportedMediaFiles(dataTransfer).length > 0) {
      return 'externalFiles';
    }
  }
  return 'none';
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
