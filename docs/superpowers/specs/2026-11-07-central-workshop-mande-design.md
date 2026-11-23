# Central Byolab Workshop with Mande Design

## Intent

Turn the standalone byolab repository into a shareable local workshop that can safely import, refine, judge, and apply React design-system components owned by separate product repositories. Mande is the first product integration and Button is the pilot component.

The workshop must preserve a hard boundary: product repositories own production components and tokens; byolab owns only isolated drafts, specimens, films, taste notes, and apply metadata. Editing a draft in byolab must not change Mande until the user explicitly chooses **Apply**.

## Why

The owner wants one workshop for shaping multiple independent design systems without forcing those products to share visual language or repository structure. The workflow must also be usable by multiple engineers through a shared byolab Git repository, with each engineer running a local instance and mapping product repositories through private machine-local configuration.

## Goals

- Keep byolab as one standalone, shareable Git repository.
- Let product adapters import existing components into isolated byolab drafts.
- Keep Mande authoritative for approved production components.
- Prove the full import-to-Apply workflow with Mande's Button.
- Reorganize all existing Mande UI components into folder-per-component units without changing the public `@mande/ui` API.
- Require explicit review before writing any file into Mande.
- Leave applied Mande changes uncommitted for the engineer's normal Git and PR workflow.
- Reuse byolab's existing CLI, specimen registry, verdict flow, Vite API, gallery, and validation conventions.

## Non-goals

- No token restructuring in Mande.
- No automatic dependency installation.
- No Git commit, push, PR creation, package release, or deployment.
- No two-way live synchronization.
- No SwiftUI support.
- No hosted or simultaneous real-time collaboration.
- No transfer of ownership for all existing Mande components; only Button is piloted in byolab.
- No attempt to support unknown external consumers of Mande deep imports in the first migration.

## Current Codebase Constraints

### Byolab

- `scripts/lab.mjs` is the CLI front door and already owns command parsing, JSON output, and delegation.
- `scripts/templates.mjs` owns new-draft scaffolding.
- `scripts/verdict.mjs` owns draft lookup, keep, toss, and ledger updates. Taste changes require a separate owner-approved review.
- `vite/lab-api.ts` is the development-only browser-to-filesystem boundary.
- `src/specimens/index.ts` is the automatic registry for drafts and kept specimens.
- `src/lab/draft-verdict.tsx` owns keep/toss interactions.
- `src/lab/gallery.tsx` and `src/lab/specimen-page.tsx` are the existing discovery and workbench surfaces.
- The repository currently has no automated unit-test suite; new filesystem and Git behavior needs tests using Node's built-in test runner.
- The untracked `LEDGER.md` records the user's completed `copy-booking-email` verdict and must be preserved. Its raw reason must not be duplicated into curated `TASTE.md`.

### Mande

- Mande is a pnpm/Turborepo monorepo.
- `packages/ui` is the private `@mande/ui` package.
- Components and stories currently live flat in `packages/ui/src/components/ui`.
- The root `packages/ui/src/index.ts` is the supported public API used by the playground.
- Storybook discovers `packages/ui/src/**/*.stories.*`, so component folders remain discoverable.
- Tokens remain in `packages/ui/src/tokens` and are outside this migration.
- The repository currently has a user-owned uncommitted change in `packages/ui/src/components/ui/alert-dialog.tsx`; implementation must preserve it. The Mande migration and all Apply operations require the user to make the target repository clean first.

## Product Configuration

Committed configuration describes product identity and adapter behavior without machine-specific paths. A gitignored local file maps a product ID to an absolute checkout path on each engineer's machine.

Committed Mande adapter configuration defines:

- product ID `mande`;
- component source and story conventions;
- public export file;
- validation commands;
- files the adapter is allowed to read and write.

Local configuration defines only the Mande checkout path. Paths must be resolved, normalized, and verified to stay inside that allowlisted checkout before any read or write.

## Mande Folder Migration

Every component becomes one folder under `packages/ui/src/components`:

```text
components/button/
  button.tsx
  button.stories.tsx
  index.ts
```

Components without stories still receive a folder and `index.ts`; the migration does not invent missing stories. Existing implementation and story contents remain unchanged except for import paths required by the move.

The public `@mande/ui` exports remain identical. Internal imports move from paths such as `@/components/ui/button` to the folder entry point. Storybook's recursive glob remains unchanged. Mande token files remain untouched.

Acceptance requires:

- the pre- and post-migration named export surfaces to match;
- no obsolete `components/ui` source imports to remain;
- TypeScript/package validation to pass;
- the Next.js playground build to pass;
- the Storybook build to pass.

## Button Import Workflow

An import command reads Mande's Button folder and creates an isolated byolab draft. The draft stores:

- product ID and component ID;
- source and story destination paths relative to the Mande checkout;
- SHA-256 hashes of every imported source file;
- the imported component and story content needed for Apply;
- specimen metadata and a byolab preview wrapper;
- film metadata when present.

The workbench must render the actual imported Mande Button, not a visual approximation. A Vite adapter resolves Mande's source aliases, token stylesheet, dependencies, and shared React instance from the configured checkout. A preview wrapper may add DialKit controls and realistic specimen state around the actual component, but byolab-specific preview code must never be applied into Mande unless it is explicitly part of the mapped output.

## Judgment

The existing keep/toss lifecycle remains authoritative:

- Toss archives the draft and records the reason in taste history.
- Keep moves the draft into specimens and makes it eligible for Apply.
- Existing local-only specimens continue to work unchanged.
- Only kept specimens with product-source metadata display **Apply**.
- After Apply, the kept specimen is the historical checkpoint for that iteration. An **Edit** action creates the next isolated draft from the latest authoritative Mande source and records fresh base hashes.

## Apply Preview

Before Apply, byolab performs read-only checks:

1. Resolve the configured Mande checkout and verify it is an allowlisted Git repository.
2. Require an entirely clean working tree, including untracked files.
3. Verify every imported base hash still matches Mande.
4. Verify every destination stays inside the configured checkout and allowlisted paths.
5. Verify required dependencies already exist; do not edit `package.json`.
6. Build a complete staged output tree without modifying Mande.
7. Produce the exact unified diff and affected-file list.

The UI shows **Apply**, the destination product, affected files, and the diff. It states that successful changes will be local, uncommitted, and not on GitHub.

## Apply Transaction

Apply requires explicit confirmation and reruns all preconditions immediately before writing.

The adapter then:

1. Creates a recoverable temporary backup of every destination file.
2. Writes the complete output set using temporary sibling files and atomic renames.
3. Runs the configured Mande validation commands.
4. Restores all original files and removes newly created files if any validation fails.
5. On success, leaves the Mande working tree modified and uncommitted.
6. Records applied source and target hashes in byolab's manifest.

After success the UI states: **Applied locally · Not committed · Not on GitHub**. It may show suggested Git commands but must never execute them.

## Conflict Rules

- Dirty target repository: refuse before preview or Apply.
- Target file changed since import: refuse and require a refreshed draft.
- Missing dependency: refuse with the exact missing package.
- Destination outside the allowlist: refuse.
- Validation failure: roll back the entire file set.
- Existing byolab draft with the same product/component identity: refuse.
- Starting another iteration: require **Edit**, which imports the latest Mande source into a new draft revision while preserving the prior kept specimen as history.

## Reuse Strategy

- Extend `scripts/lab.mjs` with import, preview, and Apply commands instead of creating a second CLI.
- Extend specimen metadata rather than creating a parallel registry.
- Reuse `scripts/verdict.mjs` for eligibility state and keep/toss behavior.
- Extend `vite/lab-api.ts` rather than adding another local server.
- Add focused product-config, Git-check, diff, and atomic-write modules because no current module owns those responsibilities.
- Reuse existing lab buttons, inputs, panels, and workbench layout for Apply UI.
- Keep product adapters data-driven; Mande-specific behavior lives behind a product adapter interface rather than inside gallery components.

## Team Model

The byolab repository is shareable by default:

- machine paths and credentials are gitignored;
- adapter definitions, drafts, specimens, taste rules, and manifests are committed;
- every engineer runs a local byolab instance;
- engineers use normal branches and PRs for byolab changes;
- Apply targets each engineer's separate local product checkout.

## Delivery Sequence

1. Migrate all Mande components into folders while preserving its public API.
2. Add shareable product configuration and safety primitives to byolab.
3. Add the Mande adapter and Button import workflow.
4. Add Apply preview and exact diff UI.
5. Add atomic Apply, validation, rollback, and manifest recording.
6. Prove the complete workflow with Button before adopting more components.

