import type { FileItem } from '../../types';
import {
  getFolderContentsBridge,
  pathExistsBridge,
  selectFolderBridge,
} from '../platform/electronGateway';

export interface SourcePanelFolder {
  path: string;
  name: string;
  structure: FileItem[];
}

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

export async function selectSourceFolderForSourcePanel(): Promise<SourcePanelFolder | null> {
  try {
    const selected = await selectFolderBridge();
    if (!selected?.path || !selected.name || !Array.isArray(selected.structure)) {
      return null;
    }
    return selected;
  } catch {
    return null;
  }
}

export async function buildSourceFolderForSourcePanel(
  path: string,
  name: string
): Promise<SourcePanelFolder | null> {
  const structure = await readFolderContentsForSourcePanel(path);
  if (!structure) return null;
  return {
    path,
    name,
    structure,
  };
}
