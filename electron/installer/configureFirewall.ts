import { execSync } from 'child_process';
import { isAdmin } from './admin.js';

/**
 * Configures Windows Firewall to allow inbound TCP connections on the
 * Artemis Ground Station port.
 *
 * Requires administrator privileges.
 *
 * @param port - The TCP port the bridge server is bound to.
 * @returns Status object with success flag and message.
 */
export async function configureFirewall(port: number): Promise<{ success: boolean; message: string }> {
  if (!(await isAdmin())) {
    return {
      success: false,
      message: 'Administrator privileges required to configure Windows Firewall.',
    };
  }

  try {
    // Add inbound rule for Artemis Ground Station WebSocket/HTTP port
    const ruleName = 'Artemis Ground Station';
    const command = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port} profile=any`;

    execSync(command, { stdio: 'pipe' });

    return {
      success: true,
      message: `Firewall rule "${ruleName}" added successfully. TCP port ${port} is now allowed for inbound connections.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Check if the rule already exists
    if (msg.includes('The object already exists') || msg.includes('already exists')) {
      return {
        success: true,
        message: `Firewall rule "Artemis Ground Station" already exists. TCP port ${port} is allowed.`,
      };
    }
    return {
      success: false,
      message: `Failed to configure firewall: ${msg}`,
    };
  }
}

/**
 * Removes the Artemis Ground Station firewall rule.
 * Useful for uninstallation or cleanup.
 *
 * Requires administrator privileges.
 *
 * @returns Status object with success flag and message.
 */
export async function removeFirewallRule(): Promise<{ success: boolean; message: string }> {
  if (!(await isAdmin())) {
    return {
      success: false,
      message: 'Administrator privileges required to remove Windows Firewall rules.',
    };
  }

  try {
    const ruleName = 'Artemis Ground Station';
    const command = `netsh advfirewall firewall delete rule name="${ruleName}"`;

    execSync(command, { stdio: 'pipe' });

    return {
      success: true,
      message: `Firewall rule "${ruleName}" removed successfully.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No rules match the specified criteria')) {
      return {
        success: true,
        message: 'Firewall rule "Artemis Ground Station" did not exist.',
      };
    }
    return {
      success: false,
      message: `Failed to remove firewall rule: ${msg}`,
    };
  }
}
