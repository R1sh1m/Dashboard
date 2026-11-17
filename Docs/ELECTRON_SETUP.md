# Artemis Ground Station — Packaged App Setup Guide

This document describes the one-click packaged Electron app setup flow for end users. The `.exe` installer is the recommended distribution method for field operators.

---

## What the Installer Contains

The Artemis Ground Station `.exe` installer packages:

- **Dashboard UI**: React 19 web interface with live map, telemetry panels, and rover controls
- **Bridge Server**: Express + WebSocket server that relays telemetry over LAN on port 3001
- **Electron Runtime**: Chromium-based runtime that hosts the dashboard as a native Windows app
- **Serial Port Support**: Built-in USB-to-UART bridge drivers and port detection

After installation, the app runs as a native Windows application with a system tray icon.

---

## First-Run Setup Wizard

When you launch the app for the first time, a 6-step setup wizard guides you through configuration:

### Step 1: Welcome

**What it does**: Introduces the setup process and explains what the package does end-to-end.

**What you'll need handy**:
- The ESP32 ground bridge plugged into your laptop's USB port
- A Map / tiles API key (required — the map won't load without it)

**Expected outcome**: You understand the setup flow and have the required items ready.

**Troubleshooting**: This is a one-time setup. You can re-run it later from the dashboard settings if you change your network, drivers, or serial port.

---

### Step 2: API Keys

**What it does**: Collects API keys for map tiles and optional telemetry services.

**What to do**:
1. Enter your **Map / Tiles API Key** (required)
2. Optionally enter Weather and Cloud telemetry keys (recommended for full sensor visibility)
3. Click **Continue**

**Required vs Optional**:
- **Map API key**: REQUIRED — the live map and rover tracking won't load without it
- **Weather API key**: Optional — enables environmental data overlays
- **Cloud telemetry key**: Optional — enables remote data sync

**Where to get a Map API key**: Get a free key from your map tile provider (e.g., OpenStreetMap-based tile services, Mapbox, or Stadia Maps). The key is stored locally and never uploaded to external servers.

**Expected outcome**: Map tiles load correctly; optional services are enabled if keys provided.

---

### Step 3: Drivers (CP210x USB-to-UART)

**What it does**: Installs the Silicon Labs CP210x driver required for the ESP32 USB-to-UART bridge.

**What to do**:
1. Click **Download & Install Drivers**
2. Wait for the download and installation to complete (progress bar shown)
3. Click **Continue**

**What "installing" means**: The driver allows Windows to recognize the ESP32 as a serial (COM) port. This is a one-time install — the driver persists across reboots and USB reconnections.

**Expected outcome**: Windows can detect the ESP32 as a COM port when plugged in.

**Troubleshooting**:
- **Driver install failed?** Run the app as Administrator (right-click the .exe → Run as administrator), then try again.
- After a successful install, unplug and reconnect the ESP32 USB cable.
- If the driver still fails to install, download it manually from [Silicon Labs CP210x](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) and run the installer.

---

### Step 4: Firewall (Port)

**What it does**: Creates a Windows Defender Firewall rule to allow inbound TCP connections on the bridge server port (defaults to 3001, auto-selects 3002–3010 if in use).

**What to do**:
1. Click **Allow Firewall Access**
2. Confirm the UAC (User Account Control) prompt if it appears
3. Click **Continue**

**What the rule does**: Permits inbound TCP connections on the bridge port, which is required for the WebSocket bridge that relays telemetry to tablets and phones on your LAN.

**Expected outcome**: Other devices on your network can access the dashboard at `http://<your-laptop-ip>:<port>`. The actual port is shown in the connection toast after setup completes.

**Troubleshooting**:
- **UAC prompt appeared?** This is normal — click **Yes** to allow the firewall rule.
- **Firewall configuration failed?** Run the app as Administrator and try again.
- **Tablet/phone can't connect?** Verify the firewall rule exists: open Windows Defender Firewall → Advanced Settings → Inbound Rules → look for "Artemis Ground Station".

---

### Step 5: Serial Port

**What it does**: Detects and selects the USB serial port connected to the ESP32 ground bridge.

**What to do**:
1. Ensure the ESP32 is plugged into your laptop's USB port
2. Select the matching COM port from the list (first entry is auto-selected if it matches a known bridge vendor)
3. Click **Connect & Test** to verify the link
4. Click **Continue**

**Port ranking**: Ports with known USB-to-UART bridge vendors (CP210x, CH340, FTDI, Espressif) are listed first.

**Expected outcome**: The correct ESP32 port is selected and tested successfully.

**Troubleshooting**:
- **No ports showing?** Check that the USB cable is plugged in firmly.
- **Still no ports?** Install the CP210x driver on the previous step, or try a different USB port.
- **Some cables are charge-only** — use a data-capable USB cable.
- **Port not responding?** Unplug and reconnect the ESP32, then refresh the list.

---

### Step 6: Finish

**What it does**: Summarizes your configuration and launches the dashboard.

**What's configured**:
- API Keys: Number of keys entered (Map required, others optional)
- Serial Port: Selected COM port path
- Drivers: Installed ✓
- Firewall: Configured ✓

**What happens next**:
1. The dashboard launches in the Electron window
2. A **connection toast** appears in the bottom-right corner showing:
   - **Local URL**: `http://localhost:3001` (access from this laptop)
   - **LAN URL**: `http://<your-ip>:3001` (access from tablets/phones on the same network)
3. Telemetry streaming begins from the ESP32 bridge
4. The map loads with your configured tile provider

**Expected outcome**: Dashboard is fully operational; you can monitor rover telemetry and access from other devices on your LAN.

---

## Connecting the ESP32

**Physical connection**:
1. Plug the ESP32 ground bridge into your laptop's USB port using a data-capable USB cable
2. The ESP32 should light up (LED indicator)
3. Windows should detect a new COM port (check Device Manager → Ports (COM & LPT))

**Verification**:
- The Serial Port step in setup should list the COM port
- The connection toast shows the dashboard URLs
- Telemetry data appears in the dashboard panels

---

## Accessing from Other Devices (LAN)

Once setup is complete, other devices on the same Wi-Fi network or hotspot can access the dashboard:

1. Find the **LAN URL** shown in the connection toast (e.g., `http://192.168.43.1:3001`)
2. Open a browser on your tablet or phone
3. Navigate to the LAN URL
4. The dashboard loads with live telemetry (WebSocket bridge)

**Requirements**:
- Tablet/phone must be on the same Wi-Fi network or hotspot as the laptop
- Firewall rule must allow inbound connections on port 3001
- Laptop must remain awake and connected to the ESP32 via USB

**Note**: Tablets and phones use the WebSocket bridge (Web Serial API is not supported on mobile browsers).

---

## Troubleshooting

### No Serial Ports Detected

**Symptoms**: Serial Port step shows "No serial ports detected"

**Solutions**:
1. Check USB cable is plugged in firmly at both ends
2. Try a different USB port on your laptop
3. Use a data-capable USB cable (some cables are charge-only)
4. Install the CP210x driver (Step 3) if not already done
5. Unplug and reconnect the ESP32 after driver installation
6. Check Device Manager → Ports (COM & LPT) for the ESP32 device

---

### Driver Installation Fails

**Symptoms**: Driver step shows "Driver installation failed"

**Solutions**:
1. Run the app as Administrator (right-click .exe → Run as administrator)
2. Retry the driver download and installation
3. If still failing, download manually from [Silicon Labs](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
4. Run the manual installer, then restart the app
5. Unplug and reconnect the ESP32 USB cable after installation

---

### Firewall Configuration Fails

**Symptoms**: Firewall step shows "Firewall configuration failed" or tablet can't connect

**Solutions**:
1. Run the app as Administrator and retry
2. Manually add the firewall rule (run as Administrator in PowerShell):
   ```powershell
   netsh advfirewall firewall add rule name="Artemis Bridge" dir=in action=allow protocol=TCP localport=3001
   ```
3. Verify the rule exists: Windows Defender Firewall → Advanced Settings → Inbound Rules
4. Check that your network profile is set to Private (not Public)

---

### Map Won't Load

**Symptoms**: Map panel shows blank or error message

**Solutions**:
1. Verify you entered a valid Map API key in Step 2
2. Check that the API key is active and hasn't expired
3. Try a different tile provider if your current one is unavailable
4. Check browser console for tile loading errors (F12 → Console)
5. Ensure your laptop has internet connectivity

---

### Connection Toast Doesn't Appear

**Symptoms**: No connection toast shown after setup

**Solutions**:
1. Check that the bridge server started (look for server logs in app)
2. Navigate to `http://localhost:3001/api/status` in a browser
3. Verify port 3001 isn't blocked by antivirus or third-party firewall
4. Restart the app and check the toast appears on launch

---

## Re-Running Setup / Resetting Setup State

If you need to re-run the setup wizard (e.g., changed network, serial port, or API keys):

**From the dashboard**:
1. Open the dashboard settings (gear icon in header)
2. Look for **Reset Setup** or **Re-run Setup Wizard**
3. Confirm the reset action
4. The wizard will launch on the next app restart

**Manual reset** (if UI option unavailable):
1. Close the app completely
2. Navigate to the app data folder:
   - `%APPDATA%\artemis-ground-station\` (Windows)
3. Delete or rename the `setup-state.json` file
4. Restart the app — the wizard will launch

---

## Support

For additional help:
- Check the [README.md](../README.md) for general getting started guide
- Review [Docs/MULTI_DEVICE_SETUP.md](MULTI_DEVICE_SETUP.md) for LAN configuration
- See [Docs/DESIGN.md](DESIGN.md) for UI/UX standards
- Contact Team Artemis support for hardware-specific issues
