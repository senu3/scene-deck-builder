import type { BrowserWindow, dialog as dialogType } from 'electron';
import type * as fsType from 'fs';

export interface SaveProjectDeps {
  dialog: Pick<typeof dialogType, 'showSaveDialog'>;
  fs: Pick<typeof fsType, 'writeFileSync'>;
  getMainWindow: () => BrowserWindow | null;
}

export function createSaveProjectHandler({ dialog, fs, getMainWindow }: SaveProjectDeps) {
  return async (_event: unknown, projectData: string, projectPath?: string) => {
    let savePath = projectPath;

    if (!savePath) {
      const mainWindow = getMainWindow();
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        filters: [{ name: 'Scene Deck Builder Project', extensions: ['sdp'] }],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }
      savePath = result.filePath;
    }

    try {
      fs.writeFileSync(savePath, projectData, 'utf-8');
      return savePath;
    } catch {
      return null;
    }
  };
}
