# Changelog

Every release of byolab, newest first. Your agent reads this to update your lab, so each entry says what changed and what to do about it.

Each change is marked with how to apply it:

- **Automatic:** comes in with the update, nothing to do.
- **Action:** your own files need a change. The steps are listed.
- **Optional:** a new default you can adopt. Your files are left alone.

## Unreleased

- **Automatic:** BYOL now expands the original lab with connected local/GitHub design-system discovery; there is no separate application or replacement shell.
- **Automatic:** the internal design system is formalized in `DESIGN_SYSTEM.md` and `byol.design-system.json`, with strict token and shared-component enforcement.
- **Automatic:** owner-reviewed connected manifests, source-pinned component drafts, one issue rail, real DialKit controls, and exact draft-scoped approvals.
- **Automatic:** approval invalidation covers repository, commit, draft revision, component, rule/property, and exact value changes.
- **Action:** agents handling connected-source work must load `.agents/skills/lab-source/SKILL.md`; the route is registered in `AGENTS.md`.

## 0.1.0

First release.

- **Automatic:** the gallery, workbench, and anatomy view at `pnpm dev`.
- **Automatic:** the film engine, with `pnpm lab still`, `render`, `check`, and `export`.
- **Automatic:** `pnpm lab new`, `list`, `keep`, `toss`, and `grid`, all with `--json`.
- **Automatic:** DialKit in the workbench and the component starter.
- **Automatic:** agent skills for getting started, components, explainers, films, ideas, and updates.
