# Multi-Device Field Setup — Artemis Ground Station

**Purpose:** Enable tablets and phones on the same Wi-Fi/hotspot to access the dashboard with full telemetry and control capability.

---

## Quick Start (Working Method)

### 1. Build the Dashboard

```powershell
cd "C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard"
npm run build
```

### 2. Kill Any Process Holding Port 3001

```powershell
# Find what's using port 3001
$tcp = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($tcp) {
    Write-Host "Killing process $($tcp.OwningProcess) on port 3001"
    Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue
}
```

### 3. Start the Bridge Server

**Option A — Background PowerShell window (recommended for field use):**

```powershell
Start-Process powershell -ArgumentList "-NoExit","-File","C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard\start-server.ps1" -WindowStyle Normal
```

**Option B — Direct (blocks terminal):**

```powershell
cd "C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard"
node --import tsx/esm server/index.ts
```

### 4. Note the LAN IP

The server logs:

```
=== Artemis Ground Bridge Server ===
Listening on http://localhost:3001
Listening on http://10.224.249.70:3001   ← Use this IP on tablet/phone
API status at http://localhost:3001/api/status
WebSocket at ws://localhost:3001/ws
```

### 5. Connect from Tablet/Phone

On the tablet/phone (same Wi-Fi or phone hotspot):

```
http://<laptop-wifi-ip>:3001
```

Example: `http://10.224.249.70:3001`

### 6. Windows Firewall (if tablet can't connect)

Run as **Administrator**:

```powershell
netsh advfirewall firewall add rule name="Artemis Bridge" dir=in action=allow protocol=TCP localport=3001
```

---

## Troubleshooting

### Port Already in Use

The bridge server automatically selects an available port (3001, then 3002–3010) if the default is in use. If you still encounter `EADDRINUSE`:

```powershell
# Find and kill the process
$tcp = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($tcp) { Stop-Process -Id $tcp.OwningProcess -Force }

# Or use alternate port
$env:PORT="3002"; node --import tsx/esm server/index.ts
```

**Note**: The app now auto-falls back to ports 3002–3010 if 3001 is occupied, so manual intervention is rarely needed.

### Tablet Can't Reach Laptop

1. **Check firewall** — run the `netsh` command above as Administrator
2. **Verify same network** — both devices must be on the same Wi-Fi/hotspot
3. **Check hotspot client isolation** — some phones block device-to-device traffic; disable "AP isolation" in hotspot settings
4. **Verify IP** — run `ipconfig` on laptop, use the IPv4 address under the Wi-Fi adapter

### Server Starts But Page Won't Load

1. Check `dist/` exists: `Test-Path .\dist\index.html` should return `True`
2. Rebuild if needed: `npm run build`
3. Check server logs for `Listening on http://...` messages
4. Try `http://localhost:3001` on the laptop itself first

### WebSocket Connects But No Telemetry

- **ESP32 not plugged in** — server logs "No ESP32 serial port found; waiting for plug-in..."
- Plug the ESP32 ground receiver into the laptop's USB port
- Server auto-detects and starts streaming within 2 seconds
- Check `http://localhost:3001/api/status` for bridge connection state

---

## Architecture Summary

| Component | Role |
|-----------|------|
| **Laptop** | Runs Express + WebSocket bridge on port 3001, holds USB connection to ESP32 |
| **ESP32** | Plugged into laptop USB, emits newline-delimited JSON telemetry at 115200 baud |
| **Tablet/Phone** | Browser connects to `http://<laptop-ip>:3001`, receives telemetry via WebSocket, sends commands back |
| **WebSocket Protocol** | Server→Client: `TELEMETRY`, `GPS`, `RAW`, `STATUS`, `HYDRATE`. Client→Server: `COMMAND` |

**Key behaviors:**
- Server auto-detects ESP32 plug/unplug (2s polling)
- Auto-reconnect if USB cable is disconnected/reconnected
- Command queue with 50ms inter-command pacing
- ESTOP commands have immediate high-priority flush
- Late-joining clients receive `HYDRATE` frame with last known telemetry

---

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Build React dashboard to `dist/` |
| `npm run server:start` | Start bridge server (port 3001) |
| `npm run serve:all` | Build + start server in one step |
| `Get-NetTCPConnection -LocalPort 3001` | Find what's using port 3001 |
| `Stop-Process -Id <PID> -Force` | Kill process holding a port |
| `ipconfig` | Find laptop's Wi-Fi IP address |
| `netsh advfirewall firewall add rule ...` | Open port 3001 in Windows Firewall |

---

## Field Checklist

- [ ] Laptop charged or plugged into power
- [ ] ESP32 ground receiver plugged into laptop USB
- [ ] Server running in background PowerShell window
- [ ] LAN IP noted from server logs
- [ ] Windows Firewall rule added (if needed)
- [ ] Tablet/phone on same Wi-Fi/hotspot
- [ ] Dashboard loads on tablet (`http://<ip>:3001`)
- [ ] Telemetry streaming (check Wireless Link panel)
- [ ] E-STOP tested (optional but recommended)

---

**Document created:** 2026-11-16  
**Verified working method:** Background server on port 3001, tablet connects via LAN IP.