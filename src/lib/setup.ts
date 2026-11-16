/**
 * Setup state management helpers for the Artemis Ground Station first-run wizard.
 *
 * These functions call Electron IPC via `window.electronAPI.invoke()` when running
 * in the Electron app, and return safe defaults when running in a browser (dev).
 *
 * @module setup
 */

import type { SetupState, DriverResult, FirewallResult, SerialPortInfo } from '../types/electron';

/**
 * Reads the persisted setup state from Electron storage.
 * Returns `{ completed: false, apiKeys: {} }` in browser dev mode.
 */
export async function getSetupState(): Promise<SetupState> {
  if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
    try {
      const result = await window.electronAPI.invoke<SetupState>('setup:getState');
      return result ?? { completed: false, apiKeys: {} };
    } catch {
      // Fallback on IPC error
      return { completed: false, apiKeys: {} };
    }
  }
  // Browser dev: no setup completed yet
  return { completed: false, apiKeys: {} };
}

/**
 * Persists the setup state (completion flag + API keys) to Electron storage.
 * No-op in browser dev mode.
 */
export async function saveSetupState(completed: boolean, apiKeys: Record<string, string>): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
    await window.electronAPI.invoke('setup:save', { completed, apiKeys });
  }
  // Browser dev: silently succeed
}

/**
 * Downloads and installs the Silicon Labs CP210x USB-to-UART driver.
 * Returns a result object with success status and message.
 */
export async function downloadDriver(): Promise<DriverResult> {
  if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
    try {
      return await window.electronAPI.invoke<DriverResult>('system:downloadDriver');
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  // Browser dev: simulate a successful download after delay
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, message: 'Driver installed (simulated)', driver: 'CP210x' });
    }, 1500);
  });
}

/**
 * Configures the Windows firewall to allow inbound connections on port 3001.
 * Returns a result object with success status and message.
 */
export async function configureFirewall(): Promise<FirewallResult> {
  if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
    try {
      return await window.electronAPI.invoke<FirewallResult>('system:configureFirewall');
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  // Browser dev: simulate success
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, message: 'Firewall configured (simulated)' });
    }, 1000);
  });
}

/**
 * Lists available serial ports on the system.
 * In browser dev, returns an empty array.
 */
export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
    try {
      return await window.electronAPI.invoke<SerialPortInfo[]>('system:listSerialPorts');
    } catch {
      return [];
    }
  }
  // Browser dev: return mock ports for testing
  return [
    { path: 'COM3', manufacturer: 'Silicon Labs', vendorId: '10C4', productId: 'EA60', description: 'CP2102 USB to UART Bridge' },
    { path: 'COM4', manufacturer: 'FTDI', vendorId: '0403', productId: '6001', description: 'FT232R USB UART' },
  ];
}

/**
 * Checks whether the app is running with administrator privileges.
 * Returns `false` in browser dev mode.
 */
export async function isAdmin(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
    try {
      return await window.electronAPI.invoke<boolean>('system:isAdmin');
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Preferred vendor IDs for ESP32 USB bridges.
 * Used to auto-select the most likely ESP32 port.
 */
export const PREFERRED_VENDOR_IDS = ['10C4', '0403', '2341', '303A']; // Silicon Labs, FTDI, Arduino, Espressif

/**
 * Ranks serial ports, preferring those with known ESP32/UART bridge vendor IDs.
 * Returns the sorted list with preferred ports first.
 */
export function rankSerialPorts(ports: SerialPortInfo[]): SerialPortInfo[] {
  return [...ports].sort((a, b) => {
    const aPreferred = a.vendorId ? PREFERRED_VENDOR_IDS.includes(a.vendorId.toUpperCase()) : false;
    const bPreferred = b.vendorId ? PREFERRED_VENDOR_IDS.includes(b.vendorId.toUpperCase()) : false;
    if (aPreferred && !bPreferred) return -1;
    if (!aPreferred && bPreferred) return 1;
    return 0;
  });
}
