import type { FileItem } from '../../types';
import { getFolderContentsBridge, pathExistsBridge } from '../platform/electronGateway';

export async function readFolderContentsForSourcePanel(path: string): Promise<FileItem[] | null> {
  if (!path) return null;
  try {
    const structure = await getFolderContentsBridge(path);
    if (!Array.isArray(structure)) return null;
    return structure;
  } catch {
    return null;
  }
}

export async function checkPathExistsForSourcePanel(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    return await pathExistsBridge(path);
  } catch {
    return false;
  }
}
