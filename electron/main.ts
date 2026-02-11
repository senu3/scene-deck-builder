import { app, BrowserWindow, ipcMain, dialog, protocol, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { Readable } from 'stream';
import { calculateFileHashStream, getMediaType, importAssetToVaultInternal, moveToTrashInternal, registerVaultGatewayHandlers, saveAssetIndexInternal, type AssetIndex, type TrashMeta } from './vaultGateway';
import { createSaveProjectHandler } from './handlers/saveProject';
import { createFfmpegController } from './services/ffmpegController';
import { createThumbnailService } from './services/thumbnailService';
const IPC_TOGGLE_SIDEBAR = 'toggle-sidebar';
const IPC_AUTOSAVE_FLUSH_REQUEST = 'autosave-flush-request';
const IPC_AUTOSAVE_FLUSH_COMPLETE = 'autosave-flush-complete';
const IPC_AUTOSAVE_ENABLED = 'autosave-enabled';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let autosaveEnabled = false;
let autosaveFlushInProgress = false;
let autosaveFlushTimer: NodeJS.Timeout | null = null;

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged;

// Register custom scheme as privileged BEFORE app is ready
// This MUST be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      bypassCSP: true,
      supportFetchAPI: true,
      standard: true,
      secure: true,
      corsEnabled: true,
      stream: true,
      allowServiceWorkers: false
    }
  }
]);

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  // Audio formats
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

type FfmpegTask<T> = () => Promise<T>;

interface FfmpegLimits {
  stderrMaxBytes: number;
  maxClipSeconds: number;
  maxTotalSeconds: number;
  maxClipBytes: number;
  maxTotalBytes: number;
}

const DEFAULT_FFMPEG_LIMITS: FfmpegLimits = {
  stderrMaxBytes: 128 * 1024,
  maxClipSeconds: 60,
  maxTotalSeconds: 15 * 60,
  maxClipBytes: 32 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
};

let ffmpegLimits: FfmpegLimits = { ...DEFAULT_FFMPEG_LIMITS };

interface StderrRing {
  buffer: Buffer;
}

function createStderrRing(): StderrRing {
  return { buffer: Buffer.alloc(0) };
}

function appendStderr(ring: StderrRing, chunk: Buffer, maxBytes: number) {
  if (maxBytes <= 0) return;
  if (ring.buffer.length === 0) {
    ring.buffer = chunk.length > maxBytes ? chunk.slice(chunk.length - maxBytes) : Buffer.from(chunk);
    return;
  }
  const combined = Buffer.concat([ring.buffer, chunk], ring.buffer.length + chunk.length);
  ring.buffer = combined.length > maxBytes ? combined.slice(combined.length - maxBytes) : combined;
}

function getStderrText(ring: StderrRing) {
  return ring.buffer.toString();
}

function sanitizeFfmpegLimits(next: Partial<FfmpegLimits>): FfmpegLimits {
  const toInt = (value: number | undefined, fallback: number, min: number) =>
    Number.isFinite(value) ? Math.max(min, Math.floor(value as number)) : fallback;
  return {
    stderrMaxBytes: toInt(next.stderrMaxBytes, ffmpegLimits.stderrMaxBytes, 1024),
    maxClipSeconds: toInt(next.maxClipSeconds, ffmpegLimits.maxClipSeconds, 1),
    maxTotalSeconds: toInt(next.maxTotalSeconds, ffmpegLimits.maxTotalSeconds, 1),
    maxClipBytes: toInt(next.maxClipBytes, ffmpegLimits.maxClipBytes, 1024),
    maxTotalBytes: toInt(next.maxTotalBytes, ffmpegLimits.maxTotalBytes, 1024),
  };
}

function createFfmpegQueue(name: string, concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    while (running < concurrency && queue.length > 0) {
      const job = queue.shift();
      if (job) job();
    }
  };

  const enqueue = <T>(task: FfmpegTask<T>): Promise<T> => new Promise((resolve, reject) => {
    const run = () => {
      running += 1;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          running -= 1;
          pump();
        });
    };
    queue.push(run);
    if (queue.length > 25) {
      console.warn(`[ffmpeg-queue:${name}] backlog=${queue.length}`);
    }
    pump();
  });

  return enqueue;
}

const enqueueFfmpegLight = createFfmpegQueue('light', 2);
const enqueueFfmpegHeavy = createFfmpegQueue('heavy', 1);
const ffmpegBinaryPath = ffmpegPath as string | null;
const ffmpegController = ffmpegBinaryPath ? createFfmpegController(ffmpegBinaryPath) : null;
const thumbnailService = ffmpegController
  ? createThumbnailService(ffmpegController, { getStderrMaxBytes: () => ffmpegLimits.stderrMaxBytes })
  : null;

// Register custom protocol for local file access (with Range support)
function registerMediaProtocol() {
  protocol.handle('media', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let filePath = decodeURI(parsedUrl.pathname);

      // On Windows, pathname starts with /C:/...; strip leading slash
      if (process.platform === 'win32' && /^[\\/][A-Za-z]:\//.test(filePath)) {
        filePath = filePath.slice(1);
      }
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const range = request.headers.get('range');
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        if (!match) {
          return new Response(null, { status: 416 });
        }

        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const safeStart = Number.isNaN(start) ? 0 : Math.max(0, start);
        const safeEnd = Number.isNaN(end) ? fileSize - 1 : Math.min(end, fileSize - 1);

        if (safeStart >= fileSize || safeStart > safeEnd) {
          if (fileSize === 0) {
            return new Response(null, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Length': '0',
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
          const lastByte = fileSize - 1;
          const stream = fs.createReadStream(filePath, { start: lastByte, end: lastByte });
          const body = Readable.toWeb(stream) as ReadableStream;
          return new Response(body, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Length': '1',
              'Content-Range': `bytes ${lastByte}-${lastByte}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        const stream = fs.createReadStream(filePath, { start: safeStart, end: safeEnd });
        const body = Readable.toWeb(stream) as ReadableStream;
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(safeEnd - safeStart + 1),
            'Content-Range': `bytes ${safeStart}-${safeEnd}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      const stream = fs.createReadStream(filePath);
      const body = Readable.toWeb(stream) as ReadableStream;
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('[Protocol] Failed to serve media:', error);
      return new Response(null, { status: 404 });
    }
  });
}

function parseFfmpegMetadata(stderr: string): { duration?: number; width?: number; height?: number } {
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  let duration: number | undefined;
  if (durationMatch) {
    const hours = parseInt(durationMatch[1], 10);
    const minutes = parseInt(durationMatch[2], 10);
    const seconds = parseFloat(durationMatch[3]);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes) && !Number.isNaN(seconds)) {
      duration = (hours * 3600) + (minutes * 60) + seconds;
    }
  }

  const sizeMatch = /Video:.*?(\d{2,5})x(\d{2,5})/i.exec(stderr);
  let width: number | undefined;
  let height: number | undefined;
  if (sizeMatch) {
    const w = parseInt(sizeMatch[1], 10);
    const h = parseInt(sizeMatch[2], 10);
    if (!Number.isNaN(w) && !Number.isNaN(h)) {
      width = w;
      height = h;
    }
  }

  return { duration, width, height };
}

function probeVideoWithFfmpeg(ffmpegBinary: string, filePath: string): Promise<{ duration?: number; width?: number; height?: number }> {
  return enqueueFfmpegLight(() => new Promise((resolve) => {
    const args = ['-hide_banner', '-i', filePath];
    const proc = spawn(ffmpegBinary, args);
    const stderrRing = createStderrRing();

    proc.stderr.on('data', (data: Buffer) => {
      appendStderr(stderrRing, data, ffmpegLimits.stderrMaxBytes);
    });

    proc.on('close', () => {
      resolve(parseFfmpegMetadata(getStderrText(stderrRing)));
    });

    proc.on('error', () => resolve({}));
  }));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1a1d21',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // TEMPORARY: Disable web security for development to allow local file access
      // TODO: Fix custom protocol implementation before release
      webSecurity: false,
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform !== 'darwin',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Crash] WebContents render process gone:', details);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Crash] WebContents unresponsive');
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    if (!autosaveEnabled) return;
    if (autosaveFlushInProgress) return;

    event.preventDefault();
    autosaveFlushInProgress = true;
    mainWindow?.webContents.send(IPC_AUTOSAVE_FLUSH_REQUEST);

    const finalizeClose = () => {
      if (!autosaveFlushInProgress) return;
      autosaveFlushInProgress = false;
      if (autosaveFlushTimer) {
        clearTimeout(autosaveFlushTimer);
        autosaveFlushTimer = null;
      }
      if (!mainWindow) return;
      isQuitting = true;
      mainWindow.close();
    };

    ipcMain.once(IPC_AUTOSAVE_FLUSH_COMPLETE, () => {
      finalizeClose();
    });

    autosaveFlushTimer = setTimeout(() => {
      console.warn('[Autosave] Flush timed out, closing anyway.');
      finalizeClose();
    }, 5000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createAppMenu() {
  const menuRole = (role: Electron.MenuItemConstructorOptions['role']) => ({ role });
  const separator: Electron.MenuItemConstructorOptions = { type: 'separator' };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            menuRole('about'),
            separator,
            menuRole('services'),
            separator,
            menuRole('hide'),
            menuRole('hideOthers'),
            menuRole('unhide'),
            separator,
            menuRole('quit'),
          ],
        } as Electron.MenuItemConstructorOptions]
      : []),
    {
      label: 'File',
      submenu: [
        menuRole('close'),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        menuRole('undo'),
        menuRole('redo'),
        separator,
        menuRole('cut'),
        menuRole('copy'),
        menuRole('paste'),
        menuRole('selectAll'),
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow?.webContents.send(IPC_TOGGLE_SIDEBAR);
          },
        },
        separator,
        menuRole('resetZoom'),
        menuRole('zoomIn'),
        menuRole('zoomOut'),
        separator,
        menuRole('togglefullscreen'),
      ],
    },
    {
      label: 'Window',
      submenu: [
        menuRole('minimize'),
        menuRole('zoom'),
        ...(process.platform === 'darwin' ? [menuRole('front')] : [menuRole('close')]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        menuRole('toggleDevTools'),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  // Register custom protocol before creating window
  registerMediaProtocol();
  createWindow();
  createAppMenu();
});

app.on('render-process-gone', (_event, details) => {
  console.error('[Crash] Render process gone:', details);
});

app.on('child-process-gone', (_event, details) => {
  console.error('[Crash] Child process gone:', details);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle(IPC_AUTOSAVE_ENABLED, async (_, enabled: boolean) => {
  autosaveEnabled = Boolean(enabled);
  return autosaveEnabled;
});

// IPC Handlers for file system operations

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
}

interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  sampler?: string;
  cfg?: number;
  software?: string;
}

function scanDirectory(dirPath: string, depth: number = 0, maxDepth: number = 5): FileItem[] {
  if (depth > maxDepth) return [];

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileItem[] = [];

    for (const item of items) {
      if (item.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        result.push({
          name: item.name,
          path: fullPath,
          isDirectory: true,
          children: scanDirectory(fullPath, depth + 1, maxDepth),
        });
      } else if (getMediaType(item.name)) {
        result.push({
          name: item.name,
          path: fullPath,
          isDirectory: false,
        });
      }
    }

    return result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

// Parse PNG metadata for AI generation parameters
function parsePngMetadata(buffer: Buffer): ImageMetadata {
  const metadata: ImageMetadata = {};

  try {
    // PNG signature check
    if (buffer.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      return metadata;
    }

    let offset = 8;
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.slice(offset + 4, offset + 8).toString('ascii');

      if (type === 'IHDR') {
        metadata.width = buffer.readUInt32BE(offset + 8);
        metadata.height = buffer.readUInt32BE(offset + 12);
      }

      if (type === 'tEXt' || type === 'iTXt') {
        const data = buffer.slice(offset + 8, offset + 8 + length);
        const nullIndex = data.indexOf(0);
        if (nullIndex > 0) {
          const key = data.slice(0, nullIndex).toString('ascii');
          let value = '';

          if (type === 'tEXt') {
            value = data.slice(nullIndex + 1).toString('utf-8');
          } else {
            // iTXt has more complex structure
            const rest = data.slice(nullIndex + 1);
            const compressionFlag = rest[0];
            if (compressionFlag === 0) {
              // Find the text after null terminators
              let textStart = 1;
              for (let i = 1; i < rest.length && textStart < rest.length; i++) {
                if (rest[i] === 0) textStart = i + 1;
              }
              value = rest.slice(textStart).toString('utf-8');
            }
          }

          // Common keys used by AI image generators
          if (key === 'parameters' || key === 'prompt') {
            // Parse A1111/ComfyUI style parameters
            const lines = value.split('\n');
            for (const line of lines) {
              if (line.startsWith('Negative prompt:')) {
                metadata.negativePrompt = line.replace('Negative prompt:', '').trim();
              } else if (line.includes('Steps:')) {
                const match = line.match(/Steps:\s*(\d+)/);
                if (match) metadata.steps = parseInt(match[1]);
                const seedMatch = line.match(/Seed:\s*(\d+)/);
                if (seedMatch) metadata.seed = parseInt(seedMatch[1]);
                const samplerMatch = line.match(/Sampler:\s*([^,]+)/);
                if (samplerMatch) metadata.sampler = samplerMatch[1].trim();
                const cfgMatch = line.match(/CFG scale:\s*([\d.]+)/);
                if (cfgMatch) metadata.cfg = parseFloat(cfgMatch[1]);
                const modelMatch = line.match(/Model:\s*([^,]+)/);
                if (modelMatch) metadata.model = modelMatch[1].trim();
              } else if (!metadata.prompt && line.trim()) {
                metadata.prompt = line.trim();
              }
            }
          } else if (key === 'Description' || key === 'Comment') {
            if (!metadata.prompt) {
              try {
                const json = JSON.parse(value);
                if (json.prompt) metadata.prompt = json.prompt;
                if (json.negative_prompt) metadata.negativePrompt = json.negative_prompt;
              } catch {
                metadata.prompt = value;
              }
            }
          } else if (key === 'Software') {
            metadata.software = value;
          }
        }
      }

      if (type === 'IEND') break;
      offset += 12 + length;
    }
  } catch {
    // Ignore parsing errors
  }

  return metadata;
}

// Parse JPEG EXIF/XMP for metadata
function parseJpegMetadata(buffer: Buffer): ImageMetadata {
  const metadata: ImageMetadata = {};

  try {
    // Look for XMP data
    const xmpMarker = buffer.indexOf('http://ns.adobe.com/xap/1.0/');
    if (xmpMarker > 0) {
      const xmpEnd = buffer.indexOf('<?xpacket end', xmpMarker);
      if (xmpEnd > xmpMarker) {
        const xmpData = buffer.slice(xmpMarker, xmpEnd).toString('utf-8');

        // Simple extraction of description
        const descMatch = xmpData.match(/<dc:description[^>]*>[\s\S]*?<rdf:li[^>]*>([^<]+)/);
        if (descMatch) {
          metadata.prompt = descMatch[1].trim();
        }
      }
    }

    // Try to find dimensions from SOF markers
    let offset = 2;
    while (offset < buffer.length - 10) {
      if (buffer[offset] === 0xff) {
        const marker = buffer[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          metadata.height = buffer.readUInt16BE(offset + 5);
          metadata.width = buffer.readUInt16BE(offset + 7);
          break;
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        offset++;
      }
    }
  } catch {
    // Ignore parsing errors
  }

  return metadata;
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];
  const structure = scanDirectory(folderPath);

  return {
    path: folderPath,
    name: path.basename(folderPath),
    structure,
  };
});

ipcMain.handle('get-folder-contents', async (_, folderPath: string) => {
  return scanDirectory(folderPath);
});

ipcMain.handle('get-file-info', async (_, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      modified: stats.mtime,
      type: getMediaType(path.basename(filePath)),
      extension: ext,
    };
  } catch {
    return null;
  }
});

ipcMain.handle('read-file-as-base64', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
});

// Read audio file as ArrayBuffer (for Web Audio API - more stable than base64)
ipcMain.handle('read-audio-file', async (_, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    console.log('[Audio] read-audio-file:', filePath, `${stats.size} bytes`);
    const buffer = fs.readFileSync(filePath);
    // Return a copied Buffer to avoid shared slab issues across IPC
    return Buffer.from(buffer);
  } catch {
    console.error('[Audio] read-audio-file failed:', filePath);
    return null;
  }
});

ipcMain.handle('get-ffmpeg-limits', () => ({ ...ffmpegLimits }));

ipcMain.handle('set-ffmpeg-limits', async (_, next: Partial<FfmpegLimits>) => {
  ffmpegLimits = sanitizeFfmpegLimits(next);
  return { ...ffmpegLimits };
});

// Decode audio to PCM (s16le) via ffmpeg and return buffer + format
ipcMain.handle('read-audio-pcm', async (_, filePath: string) => {
  const ffmpegBinary = ffmpegPath as string | null;
  if (!ffmpegBinary) {
    console.error('[Audio] ffmpeg not found');
    return { success: false, error: 'ffmpeg not found' };
  }

  try {
    const stats = fs.statSync(filePath);
    console.log('[Audio] read-audio-pcm:', filePath, `${stats.size} bytes`);

    const args = [
      '-hide_banner',
      '-i', filePath,
      '-vn',
      '-ac', '2',
      '-ar', '44100',
      '-f', 's16le',
      'pipe:1',
    ];

    return await enqueueFfmpegLight(() => new Promise((resolve) => {
      const proc = spawn(ffmpegBinary, args);
      const chunks: Buffer[] = [];
      const stderrRing = createStderrRing();
      const bytesPerSecond = 44100 * 2 * 2;
      const maxClipBytes = Math.min(
        ffmpegLimits.maxClipBytes,
        ffmpegLimits.maxClipSeconds * bytesPerSecond,
      );
      const maxTotalBytes = Math.min(
        ffmpegLimits.maxTotalBytes,
        ffmpegLimits.maxTotalSeconds * bytesPerSecond,
      );
      let totalBytes = 0;
      let resolved = false;

      const finish = (result: { success: boolean; pcm?: Buffer; sampleRate?: number; channels?: number; error?: string }) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        if (resolved) return;
        totalBytes += chunk.length;
        if (totalBytes > maxClipBytes) {
          proc.kill();
          chunks.length = 0;
          finish({
            success: false,
            error: `PCM exceeds clip limit (${ffmpegLimits.maxClipSeconds}s / ${Math.floor(maxClipBytes / (1024 * 1024))}MB)`,
          });
          return;
        }
        if (totalBytes > maxTotalBytes) {
          proc.kill();
          chunks.length = 0;
          finish({
            success: false,
            error: `PCM exceeds total limit (${ffmpegLimits.maxTotalSeconds}s / ${Math.floor(maxTotalBytes / (1024 * 1024))}MB)`,
          });
          return;
        }
        chunks.push(chunk);
      });

      proc.stderr.on('data', (data: Buffer) => {
        appendStderr(stderrRing, data, ffmpegLimits.stderrMaxBytes);
      });

      proc.on('close', (code: number | null) => {
        if (resolved) return;
        if (code !== 0) {
          const message = getStderrText(stderrRing) || `ffmpeg exited with code ${code}`;
          console.error('[Audio] ffmpeg decode failed:', message);
          finish({ success: false, error: message });
          return;
        }

        const pcm = Buffer.concat(chunks);
        finish({ success: true, pcm, sampleRate: 44100, channels: 2 });
      });

      proc.on('error', (err: Error) => {
        const message = `Failed to start ffmpeg: ${err.message}`;
        console.error('[Audio] ffmpeg spawn error:', message);
        finish({ success: false, error: message });
      });
    }));
  } catch (error) {
    console.error('[Audio] read-audio-pcm failed:', error);
    return { success: false, error: 'read-audio-pcm failed' };
  }
});

// Read image metadata
ipcMain.handle('read-image-metadata', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);

    let metadata: ImageMetadata = {};

    if (ext === '.png') {
      metadata = parsePngMetadata(buffer);
    } else if (ext === '.jpg' || ext === '.jpeg') {
      metadata = parseJpegMetadata(buffer);
    }

    metadata.format = ext.replace('.', '').toUpperCase();

    return {
      ...metadata,
      fileSize: stats.size,
    };
  } catch {
    return null;
  }
});

// Get video metadata (duration, dimensions)
// Returns the file path so renderer can load it in a video element to extract metadata
ipcMain.handle('get-video-metadata', async (_, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const ffmpegBinary = ffmpegPath as string | null;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;

    if (ffmpegBinary) {
      const meta = await probeVideoWithFfmpeg(ffmpegBinary, filePath);
      duration = meta.duration;
      width = meta.width;
      height = meta.height;
    }

    return {
      path: filePath,
      fileSize: stats.size,
      format: ext.replace('.', '').toUpperCase(),
      duration,
      width,
      height,
    };
  } catch {
    return null;
  }
});

// Generate thumbnail via ffmpeg (unified image/video path)
ipcMain.handle('generate-thumbnail', async (_, options: {
  filePath: string;
  type: 'image' | 'video';
  timeOffset?: number;
  profile?: 'timeline-card' | 'asset-grid' | 'sequence-preview' | 'details-panel';
}) => {
  if (!thumbnailService) return { success: false, error: 'ffmpeg not found' };
  return thumbnailService.generateThumbnail({
    filePath: options.filePath,
    type: options.type,
    timeOffset: options.timeOffset,
    profile: options.profile,
  });
});

// Backward compatible alias (existing renderer callsites)
ipcMain.handle('generate-video-thumbnail', async (_, options: { filePath: string; timeOffset?: number }) => {
  if (!thumbnailService) return { success: false, error: 'ffmpeg not found' };
  return thumbnailService.generateThumbnail({
    filePath: options.filePath,
    type: 'video',
    timeOffset: options.timeOffset ?? 1,
    profile: 'timeline-card',
  });
});

// Create vault folder structure
ipcMain.handle('create-vault', async (_, vaultPath: string, projectName: string) => {
  try {
    const projectPath = path.join(vaultPath, projectName);

    // Create main project folder
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Create trash folder
    const trashPath = path.join(projectPath, '.trash');
    if (!fs.existsSync(trashPath)) {
      fs.mkdirSync(trashPath);
    }

    // Create project config file
    const configPath = path.join(projectPath, 'project.json');
    const config = {
      name: projectName,
      createdAt: new Date().toISOString(),
      version: '1.0',
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return {
      path: projectPath,
      trashPath,
      configPath,
    };
  } catch (error) {
    console.error('Failed to create vault:', error);
    return null;
  }
});

// Select or create vault folder
ipcMain.handle('select-vault', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select or Create Vault Folder',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Create scene folder in vault
ipcMain.handle('create-scene-folder', async (_, vaultPath: string, sceneName: string) => {
  try {
    // Sanitize scene name for folder
    const safeName = sceneName.replace(/[<>:"/\\|?*]/g, '_');
    const scenePath = path.join(vaultPath, safeName);

    if (!fs.existsSync(scenePath)) {
      fs.mkdirSync(scenePath, { recursive: true });
    }

    return scenePath;
  } catch {
    return null;
  }
});

// Move file to vault
ipcMain.handle('move-to-vault', async (_, sourcePath: string, destFolder: string, newName?: string) => {
  try {
    const fileName = newName || path.basename(sourcePath);
    let destPath = path.join(destFolder, fileName);

    // Handle duplicate names
    let counter = 1;
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    while (fs.existsSync(destPath)) {
      destPath = path.join(destFolder, `${baseName}_${counter}${ext}`);
      counter++;
    }

    // Copy then delete (safer than move for cross-device)
    fs.copyFileSync(sourcePath, destPath);

    return destPath;
  } catch (error) {
    console.error('Failed to move file:', error);
    return null;
  }
});

// Move file to trash folder
ipcMain.handle('move-to-trash', async (_, filePath: string, trashPath: string) => {
  return moveToTrashInternal(filePath, trashPath, null);
});

ipcMain.handle('move-to-trash-with-meta', async (_, filePath: string, trashPath: string, meta: TrashMeta) => {
  return moveToTrashInternal(filePath, trashPath, meta || null);
});

// Save project data
ipcMain.handle('save-project', createSaveProjectHandler({
  dialog,
  fs,
  getMainWindow: () => mainWindow,
}));

// Load project data
ipcMain.handle('load-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'Scene Deck Project', extensions: ['sdp'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    return {
      data: JSON.parse(data),
      path: result.filePaths[0],
    };
  } catch {
    return null;
  }
});

// Load project from specific path (for recent projects)
ipcMain.handle('load-project-from-path', async (_, projectPath: string) => {
  try {
    if (!fs.existsSync(projectPath)) {
      return null;
    }
    const data = fs.readFileSync(projectPath, 'utf-8');
    return {
      data: JSON.parse(data),
      path: projectPath,
    };
  } catch {
    return null;
  }
});

// Check if path exists
ipcMain.handle('path-exists', async (_, checkPath: string) => {
  return fs.existsSync(checkPath);
});

// Show open file dialog for selecting a single file
interface OpenFileDialogOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

ipcMain.handle('show-open-file-dialog', async (_, options: OpenFileDialogOptions) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: options.title || 'Select File',
    properties: ['openFile'],
    filters: options.filters || [
      { name: 'Media Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'] }
    ],
    defaultPath: options.defaultPath,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Get recent projects (from app data)
ipcMain.handle('get-recent-projects', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const recentPath = path.join(userDataPath, 'recent-projects.json');

    if (fs.existsSync(recentPath)) {
      const data = fs.readFileSync(recentPath, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
});

// Save recent projects
ipcMain.handle('save-recent-projects', async (_, projects: Array<{ name: string; path: string; date: string }>) => {
  try {
    const userDataPath = app.getPath('userData');
    const recentPath = path.join(userDataPath, 'recent-projects.json');
    fs.writeFileSync(recentPath, JSON.stringify(projects.slice(0, 10), null, 2));
    return true;
  } catch {
    return false;
  }
});

// Save scene notes
ipcMain.handle('save-scene-notes', async (_, scenePath: string, notes: string) => {
  try {
    const notesPath = path.join(scenePath, '.notes.json');
    fs.writeFileSync(notesPath, notes, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

// Load scene notes
ipcMain.handle('load-scene-notes', async (_, scenePath: string) => {
  try {
    const notesPath = path.join(scenePath, '.notes.json');
    if (fs.existsSync(notesPath)) {
      const data = fs.readFileSync(notesPath, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
});

// ============================================
// Vault Asset Sync Handlers
// ============================================

// Calculate SHA256 hash of a file
ipcMain.handle('calculate-file-hash', async (_, filePath: string) => {
  try {
    const hash = await calculateFileHashStream(filePath);
    return hash;
  } catch (error) {
    console.error('Failed to calculate file hash:', error);
    return null;
  }
});

// Ensure assets folder exists in vault
ipcMain.handle('ensure-assets-folder', async (_, vaultPath: string) => {
  try {
    const assetsPath = path.join(vaultPath, 'assets');
    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
    }
    return assetsPath;
  } catch (error) {
    console.error('Failed to create assets folder:', error);
    return null;
  }
});

// Load asset index from vault
ipcMain.handle('load-asset-index', async (_, vaultPath: string) => {
  try {
    const indexPath = path.join(vaultPath, 'assets', '.index.json');
    if (fs.existsSync(indexPath)) {
      const data = fs.readFileSync(indexPath, 'utf-8');
      return JSON.parse(data) as AssetIndex;
    }
    return { version: 1, assets: [] } as AssetIndex;
  } catch (error) {
    console.error('Failed to load asset index:', error);
    return { version: 1, assets: [] } as AssetIndex;
  }
});

// Save asset index to vault
ipcMain.handle('save-asset-index', async (_, vaultPath: string, index: AssetIndex) => {
  return saveAssetIndexInternal(vaultPath, index);
});

// Import asset to vault with hash-based naming
ipcMain.handle('import-asset-to-vault', async (_, sourcePath: string, vaultPath: string, assetId: string) => {
  return importAssetToVaultInternal(sourcePath, vaultPath, assetId);
});
registerVaultGatewayHandlers(ipcMain);

// Verify vault assets - check for missing files
ipcMain.handle('verify-vault-assets', async (_, vaultPath: string) => {
  try {
    const assetsPath = path.join(vaultPath, 'assets');
    const indexPath = path.join(assetsPath, '.index.json');

    if (!fs.existsSync(indexPath)) {
      return { valid: true, missing: [], orphaned: [] };
    }

    const index: AssetIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const missing: string[] = [];
    const existingFiles = new Set<string>();

    // Check each indexed asset
    for (const entry of index.assets) {
      const assetPath = path.join(assetsPath, entry.filename);
      if (!fs.existsSync(assetPath)) {
        missing.push(entry.filename);
      } else {
        existingFiles.add(entry.filename);
      }
    }

    // Find orphaned files (not in index)
    const orphaned: string[] = [];
    if (fs.existsSync(assetsPath)) {
      const files = fs.readdirSync(assetsPath);
      for (const file of files) {
        if (file === '.index.json') continue;
        if (!existingFiles.has(file) && !index.assets.some(a => a.filename === file)) {
          orphaned.push(file);
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      orphaned,
    };
  } catch (error) {
    console.error('Failed to verify vault assets:', error);
    return { valid: false, missing: [], orphaned: [], error: String(error) };
  }
});

// Resolve relative path to absolute path
ipcMain.handle('resolve-vault-path', async (_, vaultPath: string, relativePath: string) => {
  try {
    const absolutePath = path.join(vaultPath, relativePath);
    const exists = fs.existsSync(absolutePath);
    return { absolutePath, exists };
  } catch (error) {
    return { absolutePath: null, exists: false, error: String(error) };
  }
});

// Get relative path from vault
ipcMain.handle('get-relative-path', async (_, vaultPath: string, absolutePath: string) => {
  try {
    const relativePath = path.relative(vaultPath, absolutePath);
    // Ensure forward slashes for consistency
    return relativePath.replace(/\\/g, '/');
  } catch (error) {
    return null;
  }
});

// Check if path is inside vault
ipcMain.handle('is-path-in-vault', async (_, vaultPath: string, checkPath: string) => {
  try {
    const normalizedVault = path.normalize(vaultPath);
    const normalizedCheck = path.normalize(checkPath);
    return normalizedCheck.startsWith(normalizedVault);
  } catch {
    return false;
  }
});

// ============================================
// Video Clip Finalization (ffmpeg)
// ============================================

interface FinalizeClipOptions {
  sourcePath: string;
  outputPath: string;
  inPoint: number;
  outPoint: number;
  reverse?: boolean;
}

// Show save dialog for clip export
ipcMain.handle('show-save-clip-dialog', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save Video Clip',
    defaultPath: defaultName,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
});

// Finalize video clip using ffmpeg
ipcMain.handle('finalize-clip', async (_, options: FinalizeClipOptions) => {
  const { sourcePath, outputPath, inPoint, outPoint, reverse } = options;

  // Get ffmpeg path - it can be null if not found
  const ffmpegBinary = ffmpegPath as string | null;
  if (!ffmpegBinary) {
    return { success: false, error: 'ffmpeg not found' };
  }

  return enqueueFfmpegHeavy(() => new Promise<{ success: boolean; outputPath?: string; fileSize?: number; error?: string }>((resolve) => {
    const start = Math.min(inPoint, outPoint);
    const duration = Math.abs(outPoint - inPoint);

    const runFfmpeg = (args: string[]) => new Promise<{ success: boolean; outputPath?: string; fileSize?: number; error?: string }>((innerResolve) => {
      console.log('[ffmpeg] Running:', ffmpegBinary, args.join(' '));
      const ffmpegProcess = spawn(ffmpegBinary, args);
      const stderrRing = createStderrRing();

      ffmpegProcess.stderr.on('data', (data: Buffer) => {
        appendStderr(stderrRing, data, ffmpegLimits.stderrMaxBytes);
        console.log('[ffmpeg]', data.toString());
      });

      ffmpegProcess.on('close', (code: number | null) => {
        if (code === 0) {
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            innerResolve({
              success: true,
              outputPath,
              fileSize: stats.size,
            });
          } else {
            innerResolve({
              success: false,
              error: 'Output file was not created',
            });
          }
        } else {
          const stderr = getStderrText(stderrRing);
          innerResolve({
            success: false,
            error: `ffmpeg exited with code ${code}: ${stderr}`,
          });
        }
      });

      ffmpegProcess.on('error', (err: Error) => {
        innerResolve({
          success: false,
          error: `Failed to start ffmpeg: ${err.message}`,
        });
      });
    });

    const baseArgs = [
      '-y',
      '-ss', start.toString(),
      '-i', sourcePath,
      '-t', duration.toString(),
    ];

    if (!reverse) {
      const args = [
        ...baseArgs,
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        outputPath
      ];
      runFfmpeg(args).then(resolve);
      return;
    }

    const reverseArgs = [
      ...baseArgs,
      '-vf', 'reverse',
      '-af', 'areverse',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'veryfast',
      '-movflags', '+faststart',
      outputPath
    ];

    runFfmpeg(reverseArgs).then((result) => {
      if (result.success) {
        resolve(result);
        return;
      }

      if (result.error && /matches no streams|Stream specifier/i.test(result.error)) {
        const noAudioArgs = [
          ...baseArgs,
          '-vf', 'reverse',
          '-an',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-movflags', '+faststart',
          outputPath
        ];
        runFfmpeg(noAudioArgs).then(resolve);
        return;
      }

      resolve(result);
    });
  }));
});

// Extract video frame as image using ffmpeg
interface ExtractFrameOptions {
  sourcePath: string;
  outputPath: string;
  timestamp: number;  // Time in seconds
}

interface ExtractFrameResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

interface CropImageOptions {
  sourcePath: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  anchorX: number;
  anchorY: number;
}

interface CropImageResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

interface PrecomposeLipSyncFramesOptions {
  baseImagePath: string;
  frameImagePaths: string[]; // Includes closed + variants
  maskImagePath: string;
}

interface PrecomposeLipSyncFramesResult {
  success: boolean;
  frameDataUrls?: string[];
  error?: string;
}

ipcMain.handle('crop-image-to-aspect', async (_, options: CropImageOptions): Promise<CropImageResult> => {
  const ffmpegBinary = ffmpegPath as string | null;
  if (!ffmpegBinary) {
    return { success: false, error: 'ffmpeg not found' };
  }

  const { sourcePath, outputPath } = options;
  const targetWidth = Math.max(1, Math.round(options.targetWidth));
  const targetHeight = Math.max(1, Math.round(options.targetHeight));
  const anchorX = Math.max(0, Math.min(1, options.anchorX));
  const anchorY = Math.max(0, Math.min(1, options.anchorY));
  const targetAspect = targetWidth / targetHeight;

  const cropFilter = `crop=w='if(gte(iw/ih,${targetAspect}),ih*${targetAspect},iw)':h='if(gte(iw/ih,${targetAspect}),ih,iw/${targetAspect})':x='(iw-ow)*${anchorX}':y='(ih-oh)*${anchorY}'`;

  const args = [
    '-y',
    '-i', sourcePath,
    '-frames:v', '1',
    '-vf', cropFilter,
    outputPath,
  ];

  try {
    await runFfmpeg(ffmpegBinary, args);
    if (!fs.existsSync(outputPath)) {
      return { success: false, error: 'Output file was not created' };
    }
    const stats = fs.statSync(outputPath);
    return {
      success: true,
      outputPath,
      fileSize: stats.size,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
});

// ============================================
// Sequence Export (ffmpeg)
// ============================================

interface SequenceItem {
  type: 'image' | 'video';
  path: string;
  duration: number;  // Duration in seconds
  inPoint?: number;  // For video clips
  outPoint?: number; // For video clips
}

interface ExportSequenceOptions {
  items: SequenceItem[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
}

interface ExportSequenceResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

// Show save dialog for sequence export
ipcMain.handle('show-save-sequence-dialog', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Sequence as MP4',
    defaultPath: defaultName,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
});

// Helper function to run ffmpeg process
function runFfmpeg(ffmpegBinary: string, args: string[]): Promise<void> {
  return enqueueFfmpegHeavy(() => new Promise((resolve, reject) => {
    console.log('[ffmpeg] Running:', args.join(' '));
    const proc = spawn(ffmpegBinary, args);
    const stderrRing = createStderrRing();
    proc.stderr.on('data', (data: Buffer) => {
      appendStderr(stderrRing, data, ffmpegLimits.stderrMaxBytes);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${getStderrText(stderrRing)}`));
    });
    proc.on('error', reject);
  }));
}

// Export sequence to MP4 using ffmpeg
ipcMain.handle('export-sequence', async (_, options: ExportSequenceOptions): Promise<ExportSequenceResult> => {
  const { items, outputPath, width, height, fps } = options;

  const ffmpegBinary = ffmpegPath as string | null;
  if (!ffmpegBinary) {
    return { success: false, error: 'ffmpeg not found' };
  }

  // Create a temporary directory for intermediate files
  const tempDir = app.getPath('temp');
  const sessionId = Date.now();
  const tempFiles: string[] = [];

  try {
    // Step 1: Convert each item to a standardized video segment
    const segmentFiles: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const segmentFile = path.join(tempDir, `segment_${sessionId}_${i}.mp4`);
      tempFiles.push(segmentFile);

      if (item.type === 'image') {
        // Convert image to video with specified duration
        const imageArgs = [
          '-y',
          '-loop', '1',
          '-i', item.path,
          '-t', item.duration.toString(),
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`,
          '-r', fps.toString(),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-pix_fmt', 'yuv420p',
          segmentFile
        ];

        await runFfmpeg(ffmpegBinary, imageArgs);
      } else {
        // Video: extract segment and re-encode to consistent format
        const inPoint = item.inPoint ?? 0;
        const duration = item.outPoint !== undefined
          ? item.outPoint - inPoint
          : item.duration;

        const videoArgs = [
          '-y',
          '-ss', inPoint.toString(),
          '-i', item.path,
          '-t', duration.toString(),
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`,
          '-r', fps.toString(),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-pix_fmt', 'yuv420p',
          '-an',  // Remove audio for now (can be added later)
          segmentFile
        ];

        await runFfmpeg(ffmpegBinary, videoArgs);
      }

      segmentFiles.push(segmentFile);
    }

    // Step 2: Create concat list file
    const listFile = path.join(tempDir, `concat_${sessionId}.txt`);
    tempFiles.push(listFile);

    const concatLines = segmentFiles.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
    fs.writeFileSync(listFile, concatLines.join('\n'), 'utf-8');

    // Step 3: Concatenate all segments
    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath
    ];

    console.log('[ffmpeg] Concatenating segments...');

    return enqueueFfmpegHeavy(() => new Promise<ExportSequenceResult>((resolve) => {
      const ffmpegProcess = spawn(ffmpegBinary, concatArgs);

      const stderrRing = createStderrRing();

      ffmpegProcess.stderr.on('data', (data: Buffer) => {
        appendStderr(stderrRing, data, ffmpegLimits.stderrMaxBytes);
        console.log('[ffmpeg]', data.toString());
      });

      ffmpegProcess.on('close', (code: number | null) => {
        // Clean up temp files
        for (const tempFile of tempFiles) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e) {
            console.warn('Failed to clean up temp file:', tempFile, e);
          }
        }

        if (code === 0) {
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            resolve({
              success: true,
              outputPath,
              fileSize: stats.size,
            });
          } else {
            resolve({
              success: false,
              error: 'Output file was not created',
            });
          }
        } else {
          const stderr = getStderrText(stderrRing);
          resolve({
            success: false,
            error: `ffmpeg exited with code ${code}: ${stderr}`,
          });
        }
      });

      ffmpegProcess.on('error', (err: Error) => {
        // Clean up temp files
        for (const tempFile of tempFiles) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e) {
            console.warn('Failed to clean up temp file:', tempFile, e);
          }
        }

        resolve({
          success: false,
          error: `Failed to start ffmpeg: ${err.message}`,
        });
      });
    }));
  } catch (error) {
    // Clean up temp files on error
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e) {
        console.warn('Failed to clean up temp file:', tempFile, e);
      }
    }

    return {
      success: false,
      error: `Export failed: ${String(error)}`,
    };
  }
});

ipcMain.handle('extract-video-frame', async (_, options: ExtractFrameOptions): Promise<ExtractFrameResult> => {
  const { sourcePath, outputPath, timestamp } = options;

  // Get ffmpeg path
  const ffmpegBinary = ffmpegPath as string | null;
  if (!ffmpegBinary) {
    return { success: false, error: 'ffmpeg not found' };
  }

  return enqueueFfmpegHeavy(() => new Promise<ExtractFrameResult>((resolve) => {
    // Build ffmpeg arguments for frame extraction
    // -ss for seeking to timestamp
    // -vframes 1 to extract single frame
    // -q:v 2 for high quality JPEG (1-31, lower is better)
    const args = [
      '-y',                      // Overwrite output file
      '-ss', timestamp.toString(), // Seek to timestamp
      '-i', sourcePath,          // Input file
      '-vframes', '1',           // Extract single frame
      '-q:v', '2',               // High quality
      outputPath
    ];

    console.log('[ffmpeg] Extracting frame:', ffmpegBinary, args.join(' '));

    const ffmpegProcess = spawn(ffmpegBinary, args);

    const stderrRing = createStderrRing();

    ffmpegProcess.stderr.on('data', (data: Buffer) => {
      appendStderr(stderrRing, data, ffmpegLimits.stderrMaxBytes);
    });

    ffmpegProcess.on('close', (code: number | null) => {
      if (code === 0) {
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          resolve({
            success: true,
            outputPath,
            fileSize: stats.size,
          });
        } else {
          resolve({
            success: false,
            error: 'Output file was not created',
          });
        }
      } else {
        const stderr = getStderrText(stderrRing);
        resolve({
          success: false,
          error: `ffmpeg exited with code ${code}: ${stderr}`,
        });
      }
    });

    ffmpegProcess.on('error', (err: Error) => {
      resolve({
        success: false,
        error: `Failed to start ffmpeg: ${err.message}`,
      });
    });
  }));
});

ipcMain.handle('precompose-lipsync-frames', async (_, options: PrecomposeLipSyncFramesOptions): Promise<PrecomposeLipSyncFramesResult> => {
  const { baseImagePath, frameImagePaths, maskImagePath } = options;
  const ffmpegBinary = ffmpegPath as string | null;
  if (!ffmpegBinary) {
    return { success: false, error: 'ffmpeg not found' };
  }
  if (!baseImagePath || !maskImagePath || !Array.isArray(frameImagePaths) || frameImagePaths.length === 0) {
    return { success: false, error: 'Invalid precompose options' };
  }

  const tempDir = app.getPath('temp');
  const sessionId = `lipsync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];

  try {
    const frameDataUrls: string[] = [];
    for (let i = 0; i < frameImagePaths.length; i++) {
      const framePath = frameImagePaths[i];
      const outputPath = path.join(tempDir, `${sessionId}_${i}.png`);
      tempFiles.push(outputPath);

      const filterComplex = [
        '[1:v][0:v]scale2ref[variant][base]',
        '[2:v]format=gray[masksrc]',
        '[masksrc][base]scale2ref[mask][base2]',
        '[variant][mask]alphamerge[masked]',
        '[base2][masked]overlay=0:0:format=auto[out]',
      ].join(';');

      const args = [
        '-y',
        '-i', baseImagePath,
        '-i', framePath,
        '-i', maskImagePath,
        '-filter_complex', filterComplex,
        '-map', '[out]',
        '-frames:v', '1',
        '-c:v', 'png',
        outputPath,
      ];

      await runFfmpeg(ffmpegBinary, args);

      if (!fs.existsSync(outputPath)) {
        return { success: false, error: `Composited frame was not created (index: ${i})` };
      }
      const buffer = fs.readFileSync(outputPath);
      frameDataUrls.push(`data:image/png;base64,${buffer.toString('base64')}`);
    }

    return { success: true, frameDataUrls };
  } catch (error) {
    return { success: false, error: `Precompose failed: ${String(error)}` };
  } finally {
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up precompose temp file:', tempFile, cleanupError);
      }
    }
  }
});
