import { execSync } from 'child_process';

/**
 * Checks whether the current process has administrative privileges.
 * On Windows, attempting to list the contents of a system-protected directory
 * (e.g., C:\Windows\System32) will fail without admin rights.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    // "net session" returns an error code when not elevated.
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Relaunches the current Node/Electron process with elevated privileges.
 * Uses PowerShell's Start-Process with the -Verb RunAs flag.
 */
export function relaunchAsAdmin(): void {
  const script = `Start-Process -FilePath "${process.execPath}" -ArgumentList "${process.argv.slice(1).map(arg => `"${arg}"`).join(' ')}" -Verb RunAs`;
  execSync(`powershell -Command "${script}"`, { stdio: 'inherit' });
  process.exit();
}
