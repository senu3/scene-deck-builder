import { v4 as uuidv4 } from 'uuid';
import type { Asset } from '../../types';
import { importFileToVault } from '../../utils/assetPath';
import {
  getFileInfoBridge,
  showOpenFileDialogBridge,
} from '../platform/electronGateway';

export type AssetImportFilterType = 'all' | 'image' | 'video' | 'audio';

function resolveDialogFilter(type: AssetImportFilterType): {
  filterName: string;
  extensions: string[];
} {
  if (type === 'audio') {
    return {
      filterName: 'Audio',
      extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
    };
  }
  if (type === 'image') {
    return {
      filterName: 'Images',
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
    };
  }
  if (type === 'video') {
    return {
      filterName: 'Video',
      extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
    };
  }
  return {
    filterName: 'Media',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
  };
}

function resolveAssetTypeFromExtension(
  extension: string | undefined,
  fallback: AssetImportFilterType
): Asset['type'] {
  const ext = extension?.toLowerCase() || '';
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
    return 'video';
  }
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) {
    return 'audio';
  }
  if (fallback === 'audio') return 'audio';
  if (fallback === 'video') return 'video';
  return 'image';
}

export async function selectAndImportAssetToVault(params: {
  vaultPath: string;
  filterType?: AssetImportFilterType;
  dialogTitle?: string;
}): Promise<Asset | null> {
  const filterType = params.filterType ?? 'all';
  const { filterName, extensions } = resolveDialogFilter(filterType);
  const filePath = await showOpenFileDialogBridge({
    title: params.dialogTitle || `Import ${filterName} File`,
    filters: [{ name: filterName, extensions }],
  });
  if (!filePath) {
    return null;
  }

  const assetId = uuidv4();
  const fileInfo = await getFileInfoBridge(filePath);
  const originalName = fileInfo?.name || filePath.split(/[/\\]/).pop() || 'asset';
  const type = resolveAssetTypeFromExtension(fileInfo?.extension, filterType);

  const imported = await importFileToVault(filePath, params.vaultPath, assetId, {
    name: originalName,
    type,
    fileSize: fileInfo?.size,
  });
  if (!imported) {
    return null;
  }

  return {
    ...imported,
    id: assetId,
    name: originalName,
    type,
    fileSize: fileInfo?.size ?? imported.fileSize,
  };
}
