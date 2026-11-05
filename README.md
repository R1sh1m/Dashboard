# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Design Standards

The dashboard follows Apple's Human Interface Guidelines (HIG) and Apple Maps UI/UX conventions, translated to this React + Leaflet web stack:

- **`Docs/DESIGN.md`** — Apple HIG design standards (eight design principles, layout/spacing, SF Pro typography, SF Symbols, Liquid Glass–style materials, accessibility, location privacy, pre-landing review checklist).
- **`Docs/APPLE_MAPS.md`** — Apple Maps UI/UX component reference (bottom-sheet search card, category pills, place card, map control stack, MapKit / MapKit JS / Maps Server API notes).
- **`AGENTS.md` §4** — autonomous agents review UI changes against these standards before landing.
- **`.github/instructions/`** — file-specific guidance automatically applies to UI, map, and documentation changes.

All UI changes should be checked against `Docs/DESIGN.md` §9 (review checklist) and `Docs/APPLE_MAPS.md` for map-related work.
