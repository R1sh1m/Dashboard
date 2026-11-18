import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createServer } from '../server/index.js';
import { SerialPort } from 'serialport';
import Store from 'electron-store';
import { downloadAndInstallCp210xDriver, listNeededDrivers } from './installer/downloadDriver.js';
import { configureFirewall } from './installer/configureFirewall.js';
import { isAdmin } from './installer/admin.js';
import { fileURLToPath } from 'url';

// __dirname is not available in ES modules; shim it for path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize electron-store for persistent settings
const store = new Store();

// The port the bridge server actually bound to (set after server starts).
let bridgePort: number | null = null;

// Reference to the main window so a second-instance launch can focus it.
let mainWindow: BrowserWindow | null = null;

export function getBridgePort(): number | null {
  return bridgePort;
}

// Enforce single instance: only one Electron process may run at a time.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Start the Express + WebSocket server and return the port it bound to.
async function startBackend(): Promise<number> {
  const { port } = await createServer();
  bridgePort = port;
  store.set('bridgePort', port);
  return port;
}

function createWindow(port: number) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    x: 100,
    y: 100,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on('did-finish-load', () => {
    win.show();
    win.focus();
  });

  win.loadURL(`http://localhost:${port}`);
}

app.whenReady().then(async () => {
  const port = await startBackend();
  createWindow(port);
});

// IPC handlers

ipcMain.handle('setup:getState', async () => {
  const setupComplete = store.get('setupComplete', false) as boolean;
  const apiKeys = store.get('apiKeys', {}) as Record<string, string>;
  return { setupComplete, apiKeys };
});

ipcMain.handle('setup:save', async (_event, data: { setupComplete?: boolean; apiKeys?: Record<string, string> }) => {
  if (typeof data === 'object' && data !== null) {
    if ('setupComplete' in data) store.set('setupComplete', data.setupComplete);
    if ('apiKeys' in data) store.set('apiKeys', data.apiKeys);
  }
  return true;
});

ipcMain.handle('system:downloadDriver', async () => {
  try {
    return await downloadAndInstallCp210xDriver();
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Driver installation failed', driver: 'CP210x' };
  }
});

ipcMain.handle('system:configureFirewall', async () => {
  try {
    return await configureFirewall(bridgePort ?? 3001);
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Firewall configuration failed' };
  }
});

ipcMain.handle('system:getBridgePort', async () => {
  return bridgePort;
});

ipcMain.handle('system:listSerialPorts', async () => {
  const ports = await SerialPort.list();
  return ports;
});

ipcMain.handle('system:isAdmin', async () => {
  return isAdmin();
});

ipcMain.handle('system:listNeededDrivers', async () => {
  return listNeededDrivers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (bridgePort !== null) {
      createWindow(bridgePort);
    } else {
      startBackend().then((port) => createWindow(port));
    }
  }
});
