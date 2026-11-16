import { contextBridge, ipcRenderer } from 'electron';

// Expose a typed API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // Setup channel
  setupGetState: () => ipcRenderer.invoke('setup:getState'),
  setupSave: (data: { setupComplete?: boolean; apiKeys?: any }) =>
    ipcRenderer.invoke('setup:save', data),

  // System channels
  systemDownloadDriver: () => ipcRenderer.invoke('system:downloadDriver'),
  systemConfigureFirewall: () => ipcRenderer.invoke('system:configureFirewall'),
  systemListSerialPorts: () => ipcRenderer.invoke('system:listSerialPorts'),
  systemIsAdmin: () => ipcRenderer.invoke('system:isAdmin'),
});
