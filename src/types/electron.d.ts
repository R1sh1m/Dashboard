/**
 * Electron preload API type declarations.
 *
 * The Electron main process exposes `window.electronAPI.invoke(channel, ...args)`
 * via the preload script. These declarations let TypeScript type-check IPC calls
 * from the React dashboard without adding a hard dependency on Electron types.
 */

export interface SetupState {
  completed: boolean;
  apiKeys: Record<string, string>;
}

export interface DriverResult {
  success: boolean;
  message: string;
  driver?: string;
}

export interface FirewallResult {
  success: boolean;
  message: string;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  description?: string;
}

export interface ElectronAPI {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  setupGetState: () => Promise<SetupState>;
  setupSave: (data: { setupComplete?: boolean; apiKeys?: any }) => Promise<boolean>;
  systemDownloadDriver: () => Promise<DriverResult>;
  systemConfigureFirewall: () => Promise<FirewallResult>;
  systemListSerialPorts: () => Promise<SerialPortInfo[]>;
  systemIsAdmin: () => Promise<boolean>;
  systemGetBridgePort: () => Promise<number | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
