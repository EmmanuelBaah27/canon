# Mande Component Folder Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every Mande UI component and its existing story into a folder-per-component layout without changing the public `@mande/ui` API or token files.

**Architecture:** A tested one-time migration utility inventories flat component files, plans deterministic moves, creates folder barrel files, and rewrites only known internal import paths. A committed public-export snapshot and layout checker prove compatibility after the move.

**Tech Stack:** Node.js built-ins, TypeScript, React 19, pnpm, Turborepo, Next.js, Storybook 8.

**Spec:** `../specs/2026-11-07-central-workshop-mande-design.md`

## Global Constraints

- The Mande repository must be clean before migration; preserve the current user-owned `alert-dialog.tsx` change until the user resolves it.
- Preserve every named export available from `@mande/ui`.
- Do not restructure or edit files in `packages/ui/src/tokens`.
- Do not invent stories for components that currently lack them.
- Do not commit, push, open a PR, publish a package, or deploy without separate user direction.
- Use folder names and file basenames exactly matching the current component slug.

## Review Focus

- Multiword components such as `alert-dialog` and `input-with-label` must retain exact import and export names.
- Components without stories must still receive a valid folder `index.ts`.
- Internal cross-component imports must resolve through the new folder entry points.
- The public export snapshot must detect missing value exports and missing type exports.
- Storybook must still discover all 46 existing stories after nesting them one directory deeper.

---

### Task 1: Add a tested migration inventory and public API snapshot

**Files:**
- Create: `/Volumes/APF/Mande/Mande-DS-and-playground/scripts/ui-layout.mjs`
- Create: `/Volumes/APF/Mande/Mande-DS-and-playground/scripts/ui-layout.test.mjs`
- Create: `/Volumes/APF/Mande/Mande-DS-and-playground/packages/ui/src/public-api.snapshot.json`
- Modify: `/Volumes/APF/Mande/Mande-DS-and-playground/package.json`

**Interfaces:**
- Produces: `inventoryFlatComponents(root: string): ComponentUnit[]`
- Produces: `readPublicExportSurface(indexPath: string): { values: string[]; types: string[] }`
- Produces: `assertCleanRepository(root: string): void`
- `ComponentUnit = { slug: string; component: string; story?: string }`

- [ ] **Step 1: Verify Mande is clean before creating migration files**

Run: `git status --short`
Expected: no output. If the user-owned `alert-dialog.tsx` change remains, stop; do not stash, commit, move, or discard it without user direction.

- [ ] **Step 2: Write failing Node tests for inventory, clean-tree refusal, multiword slugs, storyless components, and value/type export extraction**

Use temporary fixture directories and assert exact arrays and refusal messages.

- [ ] **Step 3: Run the tests and verify they fail because `scripts/ui-layout.mjs` does not exist**

Run: `node --test scripts/ui-layout.test.mjs`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement the inventory, Git cleanliness check, and public export reader with Node built-ins**

The export reader must normalize and sort exported symbol names while ignoring source paths.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test scripts/ui-layout.test.mjs`
Expected: PASS.

- [ ] **Step 6: Capture the current root export surface into `public-api.snapshot.json` and add package scripts**

Add `test:ui-layout`, `migrate:ui-folders`, and `check:ui-layout` scripts. Verify the snapshot contains both value and type exports.

- [ ] **Step 7: Review the task diff as an independent checkpoint**

Run: `git diff -- scripts package.json packages/ui/src/public-api.snapshot.json`
Expected: only the utility, tests, scripts, and snapshot.

### Task 2: Implement and test deterministic folder migration

**Files:**
- Modify: `/Volumes/APF/Mande/Mande-DS-and-playground/scripts/ui-layout.mjs`
- Modify: `/Volumes/APF/Mande/Mande-DS-and-playground/scripts/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `ComponentUnit[]` from Task 1.
- Produces: `planFolderMigration(root: string): MigrationPlan`
- Produces: `applyFolderMigration(plan: MigrationPlan): void`
- `MigrationPlan = { moves: Array<{ from: string; to: string }>; barrels: Array<{ path: string; source: string }>; rewrites: Array<{ path: string; before: string; after: string }> }`

- [ ] **Step 1: Add failing fixture tests for move planning, barrel generation, internal alias rewrites, root export-path rewrites, and idempotent second runs**

Assert that implementation contents and story contents are byte-identical after migration.

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `node --test scripts/ui-layout.test.mjs`
Expected: FAIL for missing migration functions.

- [ ] **Step 3: Implement `planFolderMigration` without writing files**

Plan `components/ui/<slug>.tsx` to `components/<slug>/<slug>.tsx`, place an existing story beside it, create `index.ts` exporting from `./<slug>`, and rewrite only `@/components/ui/<slug>` and `./components/ui/<slug>` paths.

- [ ] **Step 4: Implement `applyFolderMigration` with preflight collision checks and temporary-file writes**

Refuse if any destination exists before the first write. Remove `components/ui` only when empty.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test scripts/ui-layout.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run the migration utility in dry-run mode against Mande and inspect the complete plan**

Run: `pnpm migrate:ui-folders -- --dry-run`
Expected: 49 component folders planned, 46 story moves planned, no token files listed.

- [ ] **Step 7: Review the task diff as an independent checkpoint**

Run: `git diff -- scripts/ui-layout.mjs scripts/ui-layout.test.mjs`
Expected: only migration behavior and tests.

### Task 3: Execute the component migration and preserve package contracts

**Files:**
- Move: `/Volumes/APF/Mande/Mande-DS-and-playground/packages/ui/src/components/ui/*.tsx`
- Create: `/Volumes/APF/Mande/Mande-DS-and-playground/packages/ui/src/components/*/index.ts`
- Modify: `/Volumes/APF/Mande/Mande-DS-and-playground/packages/ui/src/index.ts`
- Modify: `/Volumes/APF/Mande/Mande-DS-and-playground/packages/ui/package.json`
- Modify: component files containing `@/components/ui/*` imports

**Interfaces:**
- Consumes: tested migration plan from Task 2.
- Produces: folder entry points at `packages/ui/src/components/<slug>/index.ts`.
- Preserves: root imports from `@mande/ui` and named exports captured in `public-api.snapshot.json`.

- [ ] **Step 1: Verify the working tree contains only the reviewed Task 1-2 migration-tooling changes**

Run: `git status --short`
Expected: only `scripts/ui-layout*`, `package.json`, and `packages/ui/src/public-api.snapshot.json`; stop if any unrelated path is present.

- [ ] **Step 2: Run the tested migration utility**

Run: `pnpm migrate:ui-folders`
Expected: 49 folders created, 49 component files moved, 46 stories moved, and old internal import paths rewritten.

- [ ] **Step 3: Update the package component wildcard export**

Change `./components/*` to resolve `./src/components/*/index.ts`; keep `.` and token/lib exports unchanged.

- [ ] **Step 4: Run the layout and public API checker**

Run: `pnpm check:ui-layout`
Expected: the current export surface exactly matches `public-api.snapshot.json`; every component folder has a barrel; no `components/ui` imports remain.

- [ ] **Step 5: Search independently for obsolete paths and accidental token changes**

Run: `rg -n "components/ui" packages/ui apps .storybook`
Expected: no obsolete source imports.

Run: `git diff -- packages/ui/src/tokens`
Expected: no output.

- [ ] **Step 6: Review the full mechanical diff before validation**

Run: `git diff --stat && git diff -- packages/ui/src/index.ts packages/ui/package.json`
Expected: moves, barrels, path-only import edits, and package wildcard change.

### Task 4: Validate Mande end to end

**Files:**
- Modify only if validation exposes a migration-caused path error.

**Interfaces:**
- Consumes: migrated Mande layout.
- Produces: verified compatibility baseline required by the byolab adapter plan.

- [ ] **Step 1: Run migration utility tests**

Run: `node --test scripts/ui-layout.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run the UI package TypeScript check**

Run: `pnpm exec tsc -p packages/ui/tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 3: Build the Next.js playground**

Run: `pnpm --filter @mande/playground build`
Expected: exit 0 with all existing `@mande/ui` imports resolved.

- [ ] **Step 4: Build Storybook**

Run: `pnpm build-storybook`
Expected: exit 0 and 46 existing stories discovered.

- [ ] **Step 5: Run the public API and layout checker again**

Run: `pnpm check:ui-layout`
Expected: PASS.

- [ ] **Step 6: Present the uncommitted migration diff for user review**

Run: `git status --short && git diff --stat`
Expected: only the planned Mande migration and its verification tooling; do not commit or push.

