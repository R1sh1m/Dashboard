import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createServer } from '../server/index.js';
import { SerialPort } from 'serialport';
import Store from 'electron-store';
import { downloadAndInstallCp210xDriver, listNeededDrivers } from './installer/downloadDriver.js';
import { configureFirewall } from './installer/configureFirewall.js';
import { isAdmin } from './installer/admin.js';

// Initialize electron-store for persistent settings
const store = new Store();

// Start the Express + WebSocket server before creating the window
function startBackend() {
  createServer();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the dashboard served by the Express server
  win.loadURL('http://localhost:3001');
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
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
    return await configureFirewall();
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Firewall configuration failed' };
  }
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
    createWindow();
  }
});
