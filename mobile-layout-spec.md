# Mobile-Responsive Layout Specification
## Artemis Ground Station Dashboard (React 19 + TypeScript + Vite + Leaflet)

**Breakpoint**: `@media (max-width: 760px)` — consistent with existing CSS media query.

---

## 1. LeftSidebar on Mobile

**Behavior**: Off-canvas drawer — hidden by default, slides in from left when hamburger menu is activated.

**Rationale**: The fixed 190–220px sidebar consumes ~48% of a 390px phone width, severely crowding the map. An off-canvas pattern preserves map visibility while keeping all navigation accessible on demand.

**Hamburger Button**:
- **Placement**: Fixed at `top: 22px`, `left: 22px` — above the LKL button, outside the map area, consistent with existing map control positioning.
- **Size**: 44 × 44 px hit target (Apple HIG minimum).
- **Appearance**: Circular button with `border-radius: 50%`, `rgba(255, 255, 255, 0.15)` border, `#e6e6e9` icon (Lucide `Menu` or `X` when open), background `rgba(25, 26, 29, 0.72)` with `backdrop-filter: blur(16px)`.
- **ARIA**: `aria-label="Open sidebar"`, `aria-expanded` state toggled with drawer open/closed.
- **CSS Class**: New `.sidebar-hamburger` (or reuse existing icon button pattern from `.map-control`).

**Sidebar States**:
- **Closed**: `transform: translateX(-100%)` or `left: -220px`; `visibility: hidden`; `pointer-events: none`.
- **Open**: `transform: translateX(0)`; `left: 0`; `z-index: 55`; width: 220px (full sidebar width).
- **Overlay**: Background dim `rgba(0, 0, 0, 0.4)` behind the drawer with `backdrop-filter: blur(4px)`.

**E-STOP & Connect Serial Accessibility**:
- E-STOP banner remains **fixed top-0 left-0 right-0** — always visible, no changes needed.
- **Connect/Disconnect serial button**: Promoted to the **top of the open sidebar** as the first action item, directly below the sidebar header. This ensures it is immediately reachable without scrolling.
- **E-STOP integration**: The existing `handleSidebarEStop` on the LeftSidebar component already triggers the full-screen E-STOP banner; no behavior change needed. The E-STOP banner itself is fixed and always accessible.

**CSS Changes** (mobile only, `@media (max-width: 760px)`):
- `.sidebar` — remove `position: fixed; left: 0; top: 0; bottom: 0; width: 220px`; replace with `position: fixed; top: 0; left: -100%; width: 220px; transition: left 0.3s ease, transform 0.3s ease; z-index: 55`.
- `.sidebar.open` — `left: 0; transform: none`.
- `.sidebar-hamburger` — `display: grid; top: 22px; left: 22px; z-index: 60`.

---

## 2. SensorSheet on Mobile

**Behavior**: Bottom sheet — slides up from bottom of viewport, per Apple HIG bottom sheet pattern (APPLE_MAPS.md §2).

**Rationale**: The fixed right-side panel at 420–480px overflows a phone screen (390px wide). A bottom sheet uses full viewport width, keeps the map visible above, and follows the established Apple bottom-sheet pattern already referenced in the codebase.

**Dimensions** (mobile only):
- **Width**: 100% of viewport (`w-full`).
- **Max Height**: `calc(100vh - 200px)` — leaves room for map, bottom controls, and E-STOP banner.
- **Corner Radius**: 18 px (per APPLE_MAPS.md §2).
- **Background**: `rgba(25, 27, 31, 0.94)` with `backdrop-filter: blur(28px)`; `1px solid rgba(255, 255, 255, 0.12)` border.
- **Shadow**: `0 18px 50px rgba(0, 0, 0, .32)` (per APPLE_MAPS.md §2).

**Behavior**:
- **Default State**: Collapsed handle at top, `min-height: 44px`, `height: auto`.
- **Expanded**: Full height up to `calc(100vh - 200px)`; user can swipe to expand/collapse.
- **Swipe-to-Dismiss**: Swipe down below the handle dismisses the sheet (per APPLE_MAPS.md §2).
- **Esc to Dismiss**: Pressing `Esc` dismisses the sheet (per APPLE_MAPS.md §2).
- **Overlay Background**: Semi-transparent dim `rgba(0, 0, 0, 0.3)` behind the sheet when open; `backdrop-filter: blur(4px)`.

**Overlays vs Pushes Map**: **Overlays** — the sheet slides up over the map, which remains visible underneath (like a modal bottom sheet). The map `pointer-events` remain `auto` in non-sheet areas.

**CSS Changes** (mobile only, `@media (max-width: 760px)`):
- `.telemetry-sheet` — replace `position: fixed; right: 0; top: 0; bottom: 0; width: ...` with `position: fixed; left: 0; bottom: 0; width: 100%; max-height: calc(100vh - 200px); border-radius: 18px; transform: translateY(100%); transition: transform 0.3s ease; z-index: 60`.
- `.telemetry-sheet.open` — `transform: translateY(0)`.
- `.sheet-handle` — ensure `display: block; width: 100%; height: 44px; padding: 8px; cursor: grab;`.
- Add `.sheet-overlay` — fixed dim background, `inset: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; z-index: 59`.

---

## 3. Map Controls on Mobile

**Current Issue**: `.map-controls` at `right: 22px`, `top: 90px` and `.zoom-controls` at `right: 22px`, `bottom: 78px` are hidden behind the open SensorSheet (right side).

**Repositioning** (mobile only, `@media (max-width: 760px)`):
- **`.map-controls`**: Move to **bottom-right corner**, stacked vertically above the zoom controls.
  - `position: fixed; bottom: 20px; right: 20px; flex-direction: column; gap: 8px; z-index: 70`.
  - Keep `44 × 44 px` hit targets (`.map-control` already defined as 44×44).
- **`.zoom-controls`**: Move directly below map-controls or consolidate.
  - `bottom: 84px; right: 20px;` (below map-controls with 8px gap).
  - Or: merge both stacks into one `bottom: 20px; right: 20px;` column with 20px gap.

**Chosen Approach**: Single stacked control column at bottom-right:
- `.map-controls` → `bottom: 20px; right: 20px;`
- `.zoom-controls` → `bottom: 84px; right: 20px;` (or remove `bottom` and let it flow after map-controls with `gap: 20px`)

**Rationale**: Bottom-right keeps controls on-screen, avoids the sidebar/sheet edge, and maintains 44×44px minimum hit targets. The `right: 20px` offset ensures they’re not flush against the viewport edge.

**CSS Changes** (mobile only, `@media (max-width: 760px)`):
- `.map-controls` — `top: auto; bottom: 20px; right: 20px;`.
- `.zoom-controls` — `top: auto; bottom: 84px; right: 20px;` (or adjust gap).

---

## 4. LKL Button on Mobile

**Current Issue**: `.lkl-btn` at `position: absolute; top: 38px; right: 22px` may be hidden behind the open SensorSheet.

**Repositioning** (mobile only, `@media (max-width: 760px)`):
- Move to **top-left area** above the hamburger menu, or **fixed top-left** with safe offset.
- **Option A (preferred)**: `top: 22px; left: 22px;` — above/left of the map, outside the drawer path.
- **Option B**: Collapse into the hamburger button area when drawer is open.

**Chosen**: **Option A** — reposition to `top: 22px; left: 22px` when mobile. This keeps the LKL button visible and accessible without overlapping the sidebar drawer path.

**Appearance**: Same as desktop — `44 × 44 px` circular button, `border-radius: 50%`, `rgba(25, 26, 29, 0.72)` background, `#e6e6e9` icon, `backdrop-filter: blur(16px)`.

**CSS Changes** (mobile only, `@media (max-width: 760px)`):
- `.lkl-btn` — `top: 22px; left: 22px; right: auto;`.

**Rationale**: Moving to top-left keeps it away from the right-side sheet and sidebar drawer. The 22px offset from the viewport edge maintains the same margin pattern as the existing `right: 22px` but on the left side.

---

## 5. POI Modal on Mobile

**Current Issue**: `.poi-panel` starts at `left: var(--sidebar-width)` (190px), width: `min(420px, calc(100vw - var(--sidebar-width) - 24px))`. On a 390px phone, this leaves only ~176px content width after sidebar — cramped.

**Adaptation** (mobile only, `@media (max-width: 760px)`):
- **Width**: Full width — `100%` (or `min(420px, 100vw - 24px)` which resolves to ~366px on a 390px phone, but full width is safer).
- **Positioning**: Slide in from right, overlaid over map — `position: fixed; right: 0; top: 0; bottom: 0; width: 100%; z-index: 60; transform: translateX(100%); transition: transform 0.3s ease`.
- **Open State**: `transform: translateX(0)`.
- **Close**: `transform: translateX(100%)` or fade out.

**Alternative**: Full-width bottom sheet pattern, but since POI modal has internal tabs/cards and is distinct from telemetry, keeping it as a right-drawer that becomes full-width on mobile is appropriate.

**CSS Changes** (mobile only, `@media (max-width: 760px)`):
- `.poi-panel` — `right: 0; left: auto; width: 100%; transform: translateX(100%);`.
- `.poi-panel.open` — `transform: translateX(0)`.

**Rationale**: Full-width right-drawer on mobile is consistent with the bottom-sheet pattern and avoids the cramped `left: 190px` start. The 24px gutter is removed; the drawer uses the full viewport width.

---

## 6. E-STOP Banner

**Status**: ✅ Already correct — no changes needed.

- `.fixed top-0 left-0 right-0 z-50` — full-width fixed top banner.
- Remains visible above all mobile UI elements.
- Critical red `bg-[#ff453a]/90` contrast against dark slate `#101113`.
- Meets 4.5:1 contrast ratio (verified in DESIGN.md §4).
- **Mobile Behavior**: Still `top: 0; left: 0; right: 0`; width: 100% — no adjustments needed. The banner sits above the hamburger menu, sidebar drawer, bottom sheet, and POI modal.

---

## 7. Interaction Specifications

### 7.1 Esc-to-Dismiss
- **SensorSheet**: `Esc` dismisses and closes the bottom sheet, returning map to full view.
- **PoiModal (right-drawer)**: `Esc` closes the drawer (sets `transform: translateX(100%)`).
- **LeftSidebar (off-canvas)**: `Esc` closes the drawer if open.
- **Implementation**: Listen for `Escape` keydown event; call respective close functions (`setIsSensorSheetOpen(false)`, `setIsPoiModalOpen(false)`, sidebar `left: -100%`).

### 7.2 Focus Management
- When a sheet/drawer opens, **focus** should be trapped within the interactive elements of that component and not return to the map until dismissed.
- **Hamburger button** receives focus on drawer open; focus returns to triggering element on close.
- **Map controls** (`.map-control`, `.zoom-controls`) retain `tabindex` and `focus-visible` rings per Apple HIG §4 (`:focus-visible` rings with `outline: 2px solid #0a84ff` or similar).
- **LKL button** retains focus ring when keyboard-navigated.

### 7.3 Touch Considerations
- All tap targets meet **minimum 44 × 44 px** (DESIGN.md §2, APPLE_MAPS.md §4).
- **Swipe gestures**: 
  - Bottom sheet: swipe down to dismiss.
  - Drawer: swipe right to close (optional enhancement).
- **No hover-dependent states** on mobile — buttons use `active`/`focus-visible` states only.
- **Pointer events**: `auto` when visible, `none` when dismissed (per APPLE_MAPS.md §2).

### 7.4 Reduced Motion
- `prefers-reduced-motion: reduce` — per DESIGN.md §6 and APPLE_MAPS.md §7:
  - Slide animations instant state transitions (no `transform` transitions).
  - LKL pulse animation disabled.
  - Background blur replaced with solid `rgba` (per `prefers-reduced-transparency`).
- Implementation: Add `@media (prefers-reduced-motion: reduce)` rules to override `.telemetry-sheet.open` transform, `.sidebar.open` transition, etc.

### 7.5 Accessibility
- All icon-only buttons have `aria-label` (already present in App.tsx: `aria-expanded`, `aria-label` on LKL, map controls).
- `.map-controls` and `.zoom-controls` have `aria-label="Map controls"` and `aria-label="Zoom controls"`.
- Bottom sheet has `role="dialog"` and `aria-modal="true"` when open.
- Contrast: 4.5:1 minimum for text over map tiles, 3:1 for UI controls (APPLE_MAPS.md §6).

---

## 8. Summary of CSS Media Query Additions (`@media (max-width: 760px)`)

```css
/* Hamburger menu — appear on mobile */
.sidebar-hamburger {
  display: grid;
  position: fixed;
  top: 22px;
  left: 22px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(25, 26, 29, 0.72);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  z-index: 60;
}

/* LeftSidebar off-canvas */
.sidebar {
  position: fixed;
  top: 0;
  left: -220px;
  width: 220px;
  height: 100vh;
  transition: left 0.3s ease, transform 0.3s ease;
  z-index: 55;
}
.sidebar.open { left: 0; }

/* Map controls — bottom-right on mobile */
.map-controls {
  top: auto;
  bottom: 20px;
  right: 20px;
}
.zoom-controls {
  top: auto;
  bottom: 84px; /* 20px (map-controls) + 8px gap + 56px (zoom) */
  right: 20px;
}

/* LKL button — top-left on mobile */
.lkl-btn {
  top: 22px;
  left: 22px;
  right: auto;
}

/* SensorSheet — bottom sheet */
.telemetry-sheet {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  max-height: calc(100vh - 200px);
  border-radius: 18px;
  transform: translateY(100%);
  transition: transform 0.3s ease;
  z-index: 60;
}
.telemetry-sheet.open { transform: translateY(0); }

/* POI Modal — full-width right drawer */
.poi-panel {
  right: 0;
  left: auto;
  width: 100%;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  border-radius: 18px;
}
.poi-panel.open { transform: translateX(0); }
```

---

## 9. Component Files Referenced

| Component | File | Mobile Changes |
|---|---|---|
| **App shell** | `src/App.tsx` | Add `.sidebar-hamburger` toggle logic; reposition `.lkl-btn`; keep E-STOP banner fixed top |
| **LeftSidebar** | `src/components/LeftSidebar.tsx` | Remove fixed positioning; drawer slides; E-STOP/Connect at top of open drawer |
| **SensorSheet** | `src/components/SensorSheet.tsx` | Change from right panel to bottom sheet; add handle; swipe-to-dismiss |
| **PoiModal** | `src/components/PoiModal.tsx` | Change from left-offset to full-width right drawer on mobile |
| **Map controls** | `src/index.css` | Reposition `.map-controls`, `.zoom-controls` to bottom-right; `.lkl-btn` to top-left |
| **Existing breakpoints** | `src/index.css @media (max-width: 760px)` | Extend with all mobile adaptations above |

---
*End of Specification*