---
name: Artemis project documentation
description: "Use when editing README files, Docs markdown, AGENTS.md, architecture notes, or other project guidance."
applyTo: "**/*.{md,mdx}"
---

# Project Documentation Guidance

- Keep [AGENTS.md](../../AGENTS.md) concise and project-wide; put task-specific
  rules in `.github/instructions/`.
- Link to detailed standards instead of duplicating them.
- Keep references accurate to the current React, TypeScript, Vite, and Leaflet
  implementation.
- When changing UI guidance, update the relevant source document in `Docs/` and
  the instruction file that points to it.
- Use relative links inside repository Markdown files.
