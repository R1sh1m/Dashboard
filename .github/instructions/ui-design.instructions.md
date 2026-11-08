---
name: Artemis UI design
description: "Use when creating or modifying React dashboard components, CSS, controls, accessibility, responsive layouts, or visual styling."
applyTo: "{src/components/**/*.{ts,tsx},src/index.css}"
---

# Dashboard UI Guidance

Use [Docs/DESIGN.md](../../Docs/DESIGN.md) as the source of truth for the
dashboard design standards. Before completing a UI change, check its
review checklist and preserve the existing CSS variable and component patterns.

- Keep interactive targets at least 44 x 44 px.
- Keep body text at least 11 px and maintain 4.5:1 text contrast.
- Use system/SF Pro fallbacks and Lucide icons with clear accessible labels.
- Preserve keyboard focus, reduced-motion behavior, dark mode, and responsive
  layouts.
- Make interactions respond immediately and remain interruptible; for dragged
  sheets or controls, preserve the user's current position during transitions.
- Respect `prefers-reduced-motion` with short fades or static state changes and
  `prefers-reduced-transparency` with opaque, legible surfaces.
- Keep secondary telemetry behind progressive disclosure where practical.
- Do not add decorative UI that competes with operator-critical telemetry.
