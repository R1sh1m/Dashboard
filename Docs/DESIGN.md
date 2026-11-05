# Artemis Ground Station — Apple HIG Design Standards

This document defines the design standards for the Artemis Ground Station web dashboard, grounded in Apple's Human Interface Guidelines (HIG) and the eight Apple design principles (Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight).

The dashboard is a React 19 + TypeScript + Vite web app using Leaflet for mapping and CSS variables for styling. Where Apple's guidance is native-platform (SwiftUI/UIKit), we translate it to the web equivalents used here.

## Sources and interpretation

These references inform the standards; this document is the repository's
implementation contract:

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Apple Maps HIG](https://developer.apple.com/design/human-interface-guidelines/maps)
- [Apple design skill](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)
- [DesignMD Apple design system](https://getdesign.md/apple/design-md)
- [DesignMD Apple reference](https://www.designmd.co/d/apple)

The external design skill's motion guidance is translated here without adding a
motion dependency: interactions should respond immediately, track direct
manipulation, remain interruptible, and preserve the user's current position
when transitioning. Prefer short, non-vestibular transitions when reduced
motion is requested.

---

## 1. Eight Apple Design Principles

| Principle | What it means for this dashboard |
|-----------|----------------------------------|
| **Purpose** | Every telemetry card, control, and view must serve the rover operator. Remove anything that doesn't deliver clear value (e.g., decorative chrome, redundant status indicators). |
| **Agency** | Operators stay in control. Mode toggles, sensor controls, and map interactions are direct and reversible. Destructive actions (e.g., clearing logs) require confirmation or easy undo. |
| **Responsibility** | Location data (GPS, points of interest) is treated as sensitive. Only request precise location when a feature needs it; show approximate location otherwise. Be transparent about what telemetry is collected and why. |
| **Familiarity** | Use conventions operators already know: bottom sheets for details, 44 pt touch targets, SF Symbol-style iconography, standard map controls (layer picker, current location, compass). |
| **Flexibility** | Adapt to screen sizes, orientations, and input methods (touch, keyboard, pointer). Respect safe areas and system dark/light mode. |
| **Simplicity** | Concise labels, strong visual hierarchy, every element earns its place. Progressive disclosure: hide secondary info (raw sensor bytes, debug logs) behind taps. |
| **Craft** | High-quality typography (SF Pro), crisp SF Symbol icons, fluid animations, precise spacing, consistent corner radii. No misaligned or jittery UI. |
| **Delight** | Delight comes from getting the above right — smooth map pans, immediate button feedback, clear empty/loading states — not from decoration. |

---

## 2. Layout & Spacing

- **Hit targets:** minimum **44 × 44 pt** for all tappable controls (buttons, pills, map controls, sidebar items).
- **Body text:** at least **11 pt**, legible without zooming.
- **Contrast:** WCAG AA minimum **4.5:1** between text and background.
- **Spacing:** generous breathing room; 24 pt section gaps between card sections; controls placed close to the content they modify.
- **Alignment:** align text, images, and buttons to show related information; use indentation to convey hierarchy.
- **Progressive disclosure:** use disclosure triangles, menus, or scrollable sections to reduce initially visible content.
- **Adaptive layout:** respect safe areas, margins, and guides; adapt to orientation/window-size changes (React + Tailwind media queries).

---

## 3. Typography & Iconography

- **Typeface:** SF Pro (SF Pro Display for headlines, SF Pro Text for body). Web fallback: system-ui / -apple-system / BlinkMacSystemFont.
- **Headlines:** SF Pro Display, bold, large scale; place most important items near the top and leading side.
- **Body:** SF Pro Text, regular/medium, 14–17 pt depending on context.
- **Icons:** SF Symbols (or Lucide equivalents that match SF Symbol semantics). Icons 18–28 pt, filled, category-colored where meaningful (e.g., orange for food/POI, blue for transit).
- **Labels:** plain language, concise, sentence case; avoid jargon and redundancy.

---

## 4. Color & Materials

- **Backgrounds:** system background colors; dark mode supported via CSS variables / Tailwind dark variant.
- **Controls:** use a translucent frosted material (Liquid Glass–style blur) to elevate controls above content, rather than solid opaque backgrounds. On the web, approximate with `backdrop-filter: blur()` + semi-opaque background.
- **Accent:** Apple system blue `#0A84FF` for primary actions (filled buttons, active states).
- **Surface gray:** `#F2F2F7` for input fields inside blurred materials.
- **Semantic colors:** green = Open/OK, red = Closed/Error/Closed, amber = warning, blue = interactive/primary.
- **Dark mode:** adapt colors and materials seamlessly; avoid hard-coded light-only colors.

---

## 5. Components (translated to this stack)

| Apple pattern | Web implementation in this dashboard |
|---------------|--------------------------------------|
| Bottom sheet / sliding card | `PoiModal.tsx`, `SensorSheet.tsx` — slide-up panels over the map |
| Search field | 44 pt tall, full width − 32 pt margins, 10 pt radius, leading magnifying-glass icon |
| Category pills | 64 × 88 pt white cards, 14 pt radius, 28 pt icon + 14 pt Medium label |
| Place card | Title 28 pt Bold, subtitle 15 pt Regular, action row (Directions filled `#0A84FF` pill / Call / Share / Save outlined), sticky Directions button 48 pt `#0A84FF` |
| Map controls | Top-right stack: three 44 × 44 pt circular translucent buttons (layer picker, current location, 3D/compass), 8 pt gap, 16 pt inset |
| Status indicators | Header connectivity/battery indicators with clear feedback colors |

See `Docs/APPLE_MAPS.md` for the full Apple Maps component spec.

---

## 6. Accessibility

- Text scales with system Dynamic Type preferences.
- All controls keyboard-navigable; visible focus states.
- VoiceOver-compatible labels on icons and custom controls.
- `prefers-reduced-motion: reduce` replaces slides, springs, and parallax with
  short fades or static state changes.
- `prefers-reduced-transparency: reduce` increases surface opacity and removes
  reliance on blur for legibility.
- Contrast ratios verified at 4.5:1 (WCAG AA).
- Touch targets never smaller than 44 × 44 pt.

---

## 7. Location Privacy (Apple Maps–aligned)

- Do not require precise location to use the product.
- Show approximate location (shaded area) by default; request precise location only when a feature needs it (e.g., turn-by-turn directions, rover tracking).
- Communicate clearly what location data is used and why; show a status/control for the setting.
- Offer proportional value in exchange for precise data.

---

## 8. How this is wired into the codebase

- `src/App.css` and `src/index.css` — Tailwind config + CSS variables for colors, spacing, radii, blur materials.
- `src/components/` — each component should be audited against this doc before landing UI changes.
- `AGENTS.md` — autonomous agents review UI changes against these standards (see the "Apple design review" section there).
- `Docs/APPLE_MAPS.md` — Apple Maps UI/UX component reference and MapKit JS integration notes.

---

## 9. Review checklist (before any UI change lands)

- [ ] Hit targets ≥ 44 × 44 pt
- [ ] Body text ≥ 11 pt, contrast ≥ 4.5:1
- [ ] SF Pro typography / SF Symbol icons used
- [ ] Controls close to the content they modify
- [ ] Progressive disclosure for secondary info
- [ ] Dark mode + safe areas respected
- [ ] Location data handled per §7
- [ ] Interactions respond immediately and remain interruptible
- [ ] Reduced motion and reduced transparency preferences are respected
- [ ] No jittery animations or misaligned elements
