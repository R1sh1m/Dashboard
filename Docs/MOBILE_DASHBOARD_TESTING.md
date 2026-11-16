# Mobile Dashboard Testing — Artemis Ground Station

**Purpose:** Test the responsive dashboard layout on phones/tablets via the Vite dev server. The dashboard adapts at `≤760px` (off-canvas sidebar, bottom sheet, repositioned map controls).

---

## Quick Start

### 1. Start the dev server exposed to your network

From the `Dashboard` folder:

```powershell
npm run dev -- --host
```

Vite will print something like:

```
  Local:    http://localhost:5173/
  Network:  http://10.83.112.70:5173/   ← Use this IP on your phone
```

The `Network:` line under your **Wi-Fi** adapter is the address your phone uses.

### 2. Find your laptop's Wi-Fi IP

If the IP changes (DHCP lease renewal), run:

```powershell
ipconfig | findstr IPv4
```

Use the IPv4 address under the **Wireless LAN adapter Wi-Fi** section (e.g. `10.83.112.70`).

### 3. Open on your phone

On the phone, connected to the **same Wi-Fi network**:

```
http://<laptop-wifi-ip>:5173
```

Example: `http://10.83.112.70:5173`

### 4. Windows Firewall (if the phone can't connect)

Run PowerShell **as Administrator**:

```powershell
netsh advfirewall firewall add rule name="Vite Dev Server" dir=in action=allow protocol=TCP localport=5173
```

You should see `Ok.` Then refresh the page on your phone.

---

## What to Verify on Mobile

| Element | Desktop | Mobile (≤760px) |
|---|---|---|
| **LeftSidebar** | Fixed 190–220px left panel | Off-canvas drawer via hamburger (top-left, 44×44px). Connect serial promoted to top of open drawer. |
| **SensorSheet** | Fixed right panel 420–480px | Bottom sheet sliding up from bottom, full width, 18px radius. |
| **Map controls** | `right: 22px`, top/bottom stacks | Single stacked column at bottom-right, 44×44px hit targets. |
| **LKL button** | `top: 38px; right: 22px` | Moved to `top: 22px; left: 22px`. |
| **PoiModal** | Narrow left-offset panel | Full-width right drawer overlaying the map. |
| **E-STOP banner** | Fixed top full-width | Unchanged — always visible. |
| **Interaction** | — | `Esc` closes sidebar + sheet + POI modal; tap-outside closes via overlay. |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Site can't be reached" on phone | 1. Confirm phone is on the **same Wi-Fi** as the laptop.<br>2. Re-run `ipconfig` — the IP may have changed.<br>3. Add the Windows Firewall rule (step 4 above). |
| Dev server not running | Run `npm run dev -- --host` again. Plain `npm run dev` binds to localhost only and won't be reachable from the phone. |
| Page loads but layout looks like desktop | Confirm the phone's viewport is ≤760px wide. Rotate to portrait if needed. |
| IP changes between sessions | DHCP lease renewed. Check `ipconfig` again for the current Wi-Fi IPv4 address. |

---

## On the Laptop Itself

Use `http://localhost:5173` (or `http://127.0.0.1:5173`) — no firewall rule needed.

---

**Document created:** 2026-11-16  
**Related:** `Docs/MULTI_DEVICE_SETUP.md` (bridge server on port 3001), `Docs/DESIGN.md` (design standards), `mobile-layout-spec.md` (responsive layout spec)