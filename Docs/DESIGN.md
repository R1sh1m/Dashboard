# Artemis Ground Station — Dashboard UI/UX Design System

This document defines the interface standards, component architecture, and interaction guidelines for the Artemis Ground Station web dashboard.

The dashboard is built on React 19 + TypeScript + Vite with Leaflet for spatial telemetry and CSS variables for translucent glassmorphic materials.

---

## 1. Core Interface Principles

| Principle | Meaning for the Dashboard |
|-----------|---------------------------|
| **Purpose-Driven** | Every telemetry card, control, and view directly serves the rover operator. Eliminate decorative clutter and redundant indicators. |
| **Operator Agency** | Critical controls (E-STOP, serial connect, mode switches) are direct, immediate, and unambiguous. |
| **Data Integrity & Privacy** | Coordinates and sensor telemetry are treated as high-integrity operational data. When telemetry is offline or uncalibrated, state is explicitly indicated (`SENSOR STANDBY`, `--`, Last Known Location). |
| **Familiar Spatial Hierarchy** | Slide-up drawer sheets for deep diagnostics, persistent floating map control stack, and high-visibility status badges. |
| **Adaptive Layout** | Responsive viewports across desktop control monitors (1440×900) and rugged mobile tablets/phones (390×844). |
| **Progressive Disclosure** | Primary mission metrics (GPS, speed, battery, LoRa RSSI) remain visible at a glance; raw packet logs and registers live inside expandable sheets. |
| **Craft & Polish** | Fluid transitions, crisp vector iconography, consistent corner radii, and zero UI jitter. |

---

## 2. Layout & Spacing Metrics

- **Interactive Hit Targets:** Minimum **44 × 44 px** for all buttons, pills, controls, and navigation items.
- **Body Typography:** Minimum **11 px** for captions, with primary readouts at 14–17 px and telemetry metrics at 28–32 px bold monospace.
- **Contrast Ratios:** WCAG AA compliant **4.5:1** minimum contrast against dark slate surfaces.
- **Translucent Materials:** Backdrop blur (`backdrop-filter: blur(16px)`) with subtle borders (`1px solid rgba(255, 255, 255, 0.12)`).
- **Section Margins:** 24 px gaps between primary sections; 8 px gaps between stacked control buttons.

---

## 3. Typography & Iconography

- **Font Stack:** Modern system font family (`system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).
- **Telemetry Readouts:** Monospace font family (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) for lat/lng, voltage, frequencies, and raw logs.
- **Iconography:** Lucide Icons (stroke width 2.0–2.5) with accessible `aria-label` tags on all icon-only buttons.
- **Labels:** Crisp uppercase category headers with letter-spacing tracking (`tracking-wider`).

---

## 4. Color Palette & Semantic Materials

- **Background:** Rich dark slate `#0a0a0c` to `#1c1c1e`.
- **Primary Accent:** System high-visibility blue `#0A84FF` for primary actions and active navigation items.
- **Success / Online:** Emerald green `#30D158` for connected links, valid GPS 3D fixes, and active walking states.
- **Warning / Standby:** Amber gold `#FFD60A` / `#FF9F0A` for telemetry standby, moderate thresholds, and connecting states.
- **Error / Danger / Alert:** High-contrast coral red `#FF453A` / `#FF3B30` for E-STOP, connection faults, and Last Known Location beacons.
- **Translucent Tinting:** `rgba(255, 69, 58, 0.22)` for error glassmorphism; `rgba(48, 209, 88, 0.18)` for connected status.

---

## 5. Map & Location Privacy Guidelines

- **Last Known Location:** When GPS signal or LoRa telemetry stream is interrupted, the interface retains the last known position, rendering a glowing red warning pin (`[ ⚠️ ] LAST KNOWN`) with an uncertainty radius boundary.
- **Re-centering:** Clicking the top warning banner centers the camera onto the last known location and displays connection history.
- **Direct Navigation:** Map controls provide quick cycling between marked waypoints, home station origin, and rover position.

---

## 6. Accessibility & Operator Ergonomics

- All controls are accessible via keyboard navigation (`tabindex`, focus rings, `aria-pressed`, `aria-label`).
- Full support for `prefers-reduced-motion: reduce` (replaces slide animations with instant state transitions).
- Full support for `prefers-reduced-transparency: reduce` (elevates surface opacity for high-glare outdoor environments).
- Dark mode first architecture optimized for low-light field stations.
