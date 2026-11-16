import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Official Silicon Labs CP210x Windows driver download URL.
 * The MCP_Windows_Driver.zip package contains the CP210x USB-to-UART driver INF files.
 */
const CP210X_DRIVER_URL =
  'https://www.silabs.com/documents/public/software/MCP_Windows_Driver.zip';

export interface DriverInfo {
  id: string;
  name: string;
  vendorId: string;
  url: string;
}

/**
 * Returns a list of USB-to-UART drivers that may be needed for the ESP32
 * ground bridge to function on Windows.
 */
export function listNeededDrivers(): DriverInfo[] {
  return [
    {
      id: 'cp210x',
      name: 'Silicon Labs CP210x USB-to-UART',
      vendorId: '0x10c4',
      url: CP210X_DRIVER_URL,
    },
  ];
}

/**
 * Downloads the Silicon Labs CP210x Windows driver ZIP, extracts it,
 * and installs the .inf driver silently via pnputil.
 *
 * Requires administrator privileges.
 *
 * @returns Status object with success flag and message.
 */
export async function downloadAndInstallCp210xDriver(): Promise<{
  success: boolean;
  message: string;
  driver: 'CP210x';
}> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artemis-driver-'));
  const zipPath = path.join(tmpDir, 'MCP_Windows_Driver.zip');
  const extractDir = path.join(tmpDir, 'extracted');

  try {
    // Step 1: Download the ZIP
    await downloadFile(CP210X_DRIVER_URL, zipPath);

    // Step 2: Extract using PowerShell Expand-Archive
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: 'inherit' },
    );

    // Step 3: Find the .inf file(s) in the extracted contents
    const infFiles = findInfFiles(extractDir);
    if (infFiles.length === 0) {
      return {
        success: false,
        message: 'No .inf driver files found in the extracted driver package.',
        driver: 'CP210x',
      };
    }

    // Step 4: Install each .inf silently via pnputil
    const results: string[] = [];
    for (const inf of infFiles) {
      try {
        const output = execSync(`pnputil /add-driver "${inf}" /install`, {
          encoding: 'utf8',
        });
        results.push(output.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Failed to install driver "${path.basename(inf)}": ${msg}`,
          driver: 'CP210x',
        };
      }
    }

    return {
      success: true,
      message: `Installed ${infFiles.length} CP210x driver(s) successfully.`,
      driver: 'CP210x',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Driver installation failed: ${msg}`,
      driver: 'CP210x',
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Recursively finds all .inf files under the given directory.
 */
function findInfFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findInfFiles(fullPath));
    } else if (entry.name.toLowerCase().endsWith('.inf')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Downloads a file from a URL and saves it to the given path.
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, {
        headers: {
          'User-Agent': 'Artemis-Ground-Station/1.0',
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      },
    )
      .on('error', reject);
  });
}
