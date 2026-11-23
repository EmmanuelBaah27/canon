# Byolab Mande Button Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shareable, safe Mande adapter to byolab and prove import, actual-component preview, judgment, diff preview, Apply, rollback, and Edit with Mande Button.

**Architecture:** Existing byolab CLI, specimen discovery, verdict lifecycle, Vite API, and workbench remain the primary workflow. New focused modules own product configuration, source resolution, Git/hash safety, Mande mapping, diff staging, and atomic Apply; the UI calls those modules through the existing development-only API.

**Tech Stack:** Node.js built-ins, TypeScript 7, React 19, Vite 8, Tailwind CSS 4, pnpm, Git, Node test runner.

**Spec:** `../specs/2026-11-07-central-workshop-mande-design.md`

## Global Constraints

- Complete and validate `2026-11-07-mande-component-folder-migration.md` first.
- Preserve the user-owned `LEDGER.md` entry from the completed `copy-booking-email` verdict; do not duplicate its raw reason into curated `TASTE.md`.
- Mande owns production components and tokens; byolab owns isolated drafts and history only.
- Render the actual Mande Button, not an approximation.
- Require a completely clean Mande working tree for import preview and Apply.
- Apply writes local files only; never commit, push, open a PR, publish, or deploy.
- Add no new dependency without asking the user.
- Keep existing local-only draft, keep, toss, grid, and film behavior working.

## Review Focus

- A malicious or mistaken destination path must never escape the configured Mande checkout or adapter allowlist.
- A Mande source change after import must block Apply with a refresh instruction.
- Vite must resolve Mande's `@/` alias only for modules imported from Mande while preserving byolab's own `@/` alias.
- Validation failure after partial writes must restore changed files and remove newly created files.
- Multiple Button iterations must preserve prior kept specimens while creating one unambiguous next draft.

---

### Task 1: Add shareable product configuration

**Files:**
- Create: `/Volumes/APF/byolab/products/mande.json`
- Create: `/Volumes/APF/byolab/byolab.local.example.json`
- Modify: `/Volumes/APF/byolab/.gitignore`
- Create: `/Volumes/APF/byolab/scripts/products.mjs`
- Create: `/Volumes/APF/byolab/scripts/products.d.mts`
- Create: `/Volumes/APF/byolab/scripts/products.test.mjs`
- Modify: `/Volumes/APF/byolab/package.json`

**Interfaces:**
- Produces: `loadProductDefinition(root: string, id: string): ProductDefinition`
- Produces: `loadLocalProductPath(root: string, id: string): string`
- Produces: `resolveAllowedPath(checkout: string, relativePath: string, allowed: string[]): string`
- `ProductDefinition = { id: string; adapter: string; allowedPaths: string[]; validations: Array<{ command: string; args: string[] }> }`

- [ ] **Step 1: Write failing tests for committed definitions, missing local config, unknown products, symlink/path traversal, and allowlist rejection**

Use temporary directories; assert exact error codes/messages suitable for CLI and API responses.

- [ ] **Step 2: Run tests and verify they fail because the product module does not exist**

Run: `node --test scripts/products.test.mjs`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement config loading and strict path resolution with Node built-ins**

Local config filename is `byolab.local.json`; commit only `byolab.local.example.json`. Resolve real paths before checking containment.

- [ ] **Step 4: Define the Mande adapter allowlist and validation commands**

Allow only `packages/ui/src/components`, `packages/ui/src/index.ts`, and adapter-read dependencies. Configure TypeScript, playground build, and Storybook build commands without shell strings.

- [ ] **Step 5: Add `test:scripts` to run all `scripts/*.test.mjs` files and run it**

Run: `pnpm test:scripts`
Expected: PASS.

- [ ] **Step 6: Review the task diff**

Run: `git diff -- .gitignore package.json products byolab.local.example.json scripts/products*`
Expected: no absolute machine path or credential committed.

### Task 2: Add Git, hash, dependency, and target safety primitives

**Files:**
- Create: `/Volumes/APF/byolab/scripts/product-safety.mjs`
- Create: `/Volumes/APF/byolab/scripts/product-safety.test.mjs`

**Interfaces:**
- Consumes: resolved product checkout and definition from Task 1.
- Produces: `assertGitCheckout(path: string): void`
- Produces: `assertCleanTree(path: string): void`
- Produces: `sha256File(path: string): string`
- Produces: `assertBaseHashes(checkout: string, files: SourceFile[]): void`
- Produces: `assertDependencies(packageJsonPath: string, required: string[]): void`
- `SourceFile = { draftPath: string; targetPath: string; baseSha256: string | null }`

- [ ] **Step 1: Write failing fixture tests for non-Git paths, modified/untracked files, hash mismatch, missing files, missing dependencies, and valid clean state**

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test scripts/product-safety.test.mjs`
Expected: FAIL for missing functions.

- [ ] **Step 3: Implement safety primitives using `execFileSync` and Node crypto/fs APIs**

Use `git status --porcelain=v1 --untracked-files=all`; do not invoke a shell.

- [ ] **Step 4: Run all script tests**

Run: `pnpm test:scripts`
Expected: PASS.

- [ ] **Step 5: Review the task diff**

Run: `git diff -- scripts/product-safety*`
Expected: focused safety logic and fixtures only.

### Task 3: Implement the Mande adapter and Button import

**Files:**
- Create: `/Volumes/APF/byolab/scripts/adapters/mande.mjs`
- Create: `/Volumes/APF/byolab/scripts/adapters/mande.test.mjs`
- Create: `/Volumes/APF/byolab/scripts/import-product.mjs`
- Modify: `/Volumes/APF/byolab/scripts/lab.mjs`
- Modify: `/Volumes/APF/byolab/src/specimens/index.ts`

**Interfaces:**
- Consumes: product config and safety primitives from Tasks 1-2.
- Produces: `mandeAdapter.importComponent(ctx, 'button'): ImportedDraft`
- Produces: `importProductComponent(root: string, productId: string, componentId: string, mode?: 'new' | 'edit'): ImportResult`
- `ImportResult = { slug: string; revision: number; files: string[]; url: string }`
- Extends `Specimen` with `source?: { product: string; component: string; revision: number }`.

- [ ] **Step 1: Write failing adapter tests against a folder-structured Mande fixture**

Assert imported implementation/story bytes, relative target paths, SHA-256 base hashes, required dependencies, generated `source.json`, generated specimen entry, and `mande-button-r01` naming.

- [ ] **Step 2: Run adapter tests and verify they fail**

Run: `node --test scripts/adapters/mande.test.mjs`
Expected: FAIL for missing adapter.

- [ ] **Step 3: Implement Mande mapping and import into a staged byolab draft directory**

Copy only Button implementation/story/apply payload. Generate the preview wrapper, specimen entry, source metadata, and film file; rename the staged directory into `src/drafts` only after every file succeeds.

- [ ] **Step 4: Extend `scripts/lab.mjs` with `import <product> <component> [--json]`**

Reuse existing `fail`/`done` output. Refuse duplicate active drafts for the same product/component.

- [ ] **Step 5: Extend `Specimen` with minimal source identity metadata**

Keep full hashes and paths in `source.json`; expose only product, component, and revision to the browser registry.

- [ ] **Step 6: Run script tests and existing static checks**

Run: `pnpm test:scripts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Review the task diff and confirm existing taste/ledger changes are unchanged**

Run: `git diff -- scripts src/specimens TASTE.md LEDGER.md`
Expected: adapter changes do not alter the existing `copy-booking-email` ledger entry or add its raw reason to `TASTE.md`.

### Task 4: Render the actual Mande component in Vite

**Files:**
- Create: `/Volumes/APF/byolab/vite/product-source.ts`
- Create: `/Volumes/APF/byolab/vite/product-source.test.mjs`
- Modify: `/Volumes/APF/byolab/vite.config.ts`
- Modify: generated Mande Button preview wrapper from Task 3

**Interfaces:**
- Consumes: Mande checkout path and product definition from Task 1.
- Produces: `productSource(root: string): Plugin`
- Supports virtual imports `product:mande/button` and `product-style:mande`.
- Resolves `@/` to Mande `packages/ui/src` only when the importer is inside the configured Mande checkout.

- [ ] **Step 1: Write failing resolver tests for virtual component/style IDs, Mande-scoped aliasing, byolab alias preservation, and out-of-allowlist imports**

- [ ] **Step 2: Run resolver tests and verify they fail**

Run: `node --test vite/product-source.test.mjs`
Expected: FAIL for missing plugin helpers.

- [ ] **Step 3: Implement the pre-enforced Vite product-source plugin**

Resolve the actual Mande Button entry, expose Mande token CSS plus Tailwind `@source` coverage through the virtual style module, add only the configured checkout to `server.fs.allow`, and dedupe `react`/`react-dom`.

- [ ] **Step 4: Update the generated preview wrapper to import the actual Button and product style virtual module**

The wrapper supplies realistic props/state and DialKit controls around the Button; it must not duplicate Button markup.

- [ ] **Step 5: Start Vite and verify the lab and imported specimen render**

Run: `pnpm dev`
Expected: the gallery loads normally and `mande-button-r01` renders the actual Mande Button with Mande tokens.

- [ ] **Step 6: Run static and script checks**

Run: `pnpm test:scripts && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 7: Review the task diff**

Run: `git diff -- vite vite.config.ts src/drafts/mande-button-r01`
Expected: adapter boundary and generated pilot only.

### Task 5: Add Apply preview and exact diff generation

**Files:**
- Create: `/Volumes/APF/byolab/scripts/apply-product.mjs`
- Create: `/Volumes/APF/byolab/scripts/apply-product.test.mjs`
- Modify: `/Volumes/APF/byolab/scripts/lab.mjs`
- Modify: `/Volumes/APF/byolab/vite/lab-api.ts`

**Interfaces:**
- Consumes: kept specimen `source.json`, product config, adapter, and safety primitives.
- Produces: `previewApply(root: string, slug: string): ApplyPreview`
- `ApplyPreview = { product: string; component: string; files: Array<{ path: string; status: 'add' | 'modify' | 'delete' }>; diff: string }`
- Adds CLI `preview-apply <slug> [--json]` and API `POST /__lab/preview-apply`.

- [ ] **Step 1: Write failing tests for draft refusal, dirty repository, hash mismatch, missing dependency, escaped destination, added/modified files, and deterministic unified diff text**

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test scripts/apply-product.test.mjs`
Expected: FAIL for missing preview implementation.

- [ ] **Step 3: Implement staged output generation and unified diff without modifying Mande**

Use temporary directories and `git diff --no-index --no-ext-diff`; normalize temporary paths out of returned diff text.

- [ ] **Step 4: Add CLI and Vite API routes by reusing existing error/JSON response conventions**

Limit request bodies and accept only slug strings matching the existing `SLUG` rule.

- [ ] **Step 5: Run tests and static checks**

Run: `pnpm test:scripts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Review the task diff**

Run: `git diff -- scripts/apply-product* scripts/lab.mjs vite/lab-api.ts`
Expected: read-only preview behavior only; no Apply writes yet.

### Task 6: Add the reusable Apply interface to the workbench

**Files:**
- Create: `/Volumes/APF/byolab/src/lab/apply-panel.tsx`
- Modify: `/Volumes/APF/byolab/src/lab/specimen-page.tsx`
- Reuse: `/Volumes/APF/byolab/src/components/ui/button.tsx`
- Reuse: `/Volumes/APF/byolab/src/components/ui/input.tsx`
- Reuse: `/Volumes/APF/byolab/src/components/ui/separator.tsx`

**Interfaces:**
- Consumes: `Specimen.source` and `POST /__lab/preview-apply`.
- Produces: `ApplyPanel({ specimen }: { specimen: Specimen }): JSX.Element`.
- Shows Apply only for kept sourced specimens.

- [ ] **Step 1: Add a failing component-level type/build check by importing `ApplyPanel` from `specimen-page.tsx` before it exists**

- [ ] **Step 2: Run TypeScript and verify it fails with missing module**

Run: `pnpm typecheck`
Expected: FAIL for `./apply-panel`.

- [ ] **Step 3: Implement the panel with existing byolab primitives and a native `<dialog>` for confirmation**

Show destination product, affected files, exact diff, and the statement `Applied changes will be local, uncommitted, and not on GitHub.` Do not add a new UI dependency.

- [ ] **Step 4: Mount the panel in `SpecimenPage` only when `!isDraft(specimen) && specimen.source`**

Reuse the registry's existing `isDraft` helper.

- [ ] **Step 5: Verify keyboard, loading, error, long-path, and empty-diff states manually on localhost**

Expected: Escape closes the dialog, focus returns to Apply, and no filesystem write occurs.

- [ ] **Step 6: Run static checks and build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 7: Review the task diff**

Run: `git diff -- src/lab`
Expected: one focused reusable panel plus the specimen-page mount.

### Task 7: Implement atomic Apply, validation, rollback, and manifest recording

**Files:**
- Modify: `/Volumes/APF/byolab/scripts/apply-product.mjs`
- Modify: `/Volumes/APF/byolab/scripts/apply-product.test.mjs`
- Modify: `/Volumes/APF/byolab/scripts/lab.mjs`
- Modify: `/Volumes/APF/byolab/vite/lab-api.ts`
- Modify: `/Volumes/APF/byolab/src/lab/apply-panel.tsx`
- Create: `/Volumes/APF/byolab/applied/.gitkeep`

**Interfaces:**
- Consumes: exact preview and confirmation slug.
- Produces: `applyProduct(root: string, slug: string): ApplyResult`
- `ApplyResult = { product: string; component: string; files: string[]; manifest: string; status: 'applied' }`
- Adds CLI `apply <slug> [--json]` and API `POST /__lab/apply`.

- [ ] **Step 1: Add failing tests for successful atomic writes, validation failure rollback, mid-write failure rollback, new-file removal, base-hash recheck, and manifest hashes**

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test scripts/apply-product.test.mjs`
Expected: FAIL for missing Apply implementation.

- [ ] **Step 3: Implement transactional backup, sibling temporary writes, atomic rename, validation, and rollback**

Use `execFileSync` with configured command/arg arrays and `cwd` set to Mande. Never invoke a shell. Delete backup state only after success or successful rollback.

- [ ] **Step 4: Record a manifest under `applied/<product>/<component>/rNN.json` after successful validation**

Include imported base hashes, applied output hashes, timestamp, product, component, revision, and relative target paths; include no absolute machine path.

- [ ] **Step 5: Wire CLI, API, and the confirmation button**

On success show `Applied locally · Not committed · Not on GitHub` and suggested Git commands as inert text only.

- [ ] **Step 6: Run all tests and static checks**

Run: `pnpm test:scripts && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 7: Review the task diff**

Run: `git diff -- scripts vite src/lab applied`
Expected: transactional Apply and manifest behavior only.

### Task 8: Add Edit for subsequent Button iterations

**Files:**
- Modify: `/Volumes/APF/byolab/scripts/import-product.mjs`
- Modify: `/Volumes/APF/byolab/scripts/adapters/mande.test.mjs`
- Modify: `/Volumes/APF/byolab/vite/lab-api.ts`
- Modify: `/Volumes/APF/byolab/src/lab/apply-panel.tsx`

**Interfaces:**
- Consumes: latest kept sourced specimen and current authoritative Mande files.
- Produces: `editProductComponent(root: string, slug: string): ImportResult`.
- Adds API `POST /__lab/edit` and **Edit** action after successful Apply.

- [ ] **Step 1: Add failing tests for `r01` to `r02`, preserved prior specimen, duplicate active-draft refusal, fresh base hashes, and dirty Mande refusal**

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test scripts/adapters/mande.test.mjs`
Expected: FAIL for missing Edit behavior.

- [ ] **Step 3: Implement revision discovery and Edit import**

Keep the prior specimen untouched, compute the next revision from existing draft/specimen metadata, and import current Mande files into a new draft atomically.

- [ ] **Step 4: Add the API route and UI action**

After success navigate to the new draft URL returned by the API.

- [ ] **Step 5: Run all tests and static checks**

Run: `pnpm test:scripts && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 6: Review the task diff**

Run: `git diff -- scripts/import-product.mjs scripts/adapters/mande.test.mjs vite/lab-api.ts src/lab/apply-panel.tsx`
Expected: revision workflow only.

### Task 9: Prove the full Button workflow against Mande

**Files:**
- Create through CLI: `/Volumes/APF/byolab/src/drafts/mande-button-r01/*`
- Move through existing keep flow: `/Volumes/APF/byolab/src/specimens/mande-button-r01/*`
- Modify through Apply: Mande Button implementation/story/barrels only after confirmation.

**Interfaces:**
- Consumes: completed Mande migration and Tasks 1-8.
- Produces: verified end-to-end pilot and an uncommitted Mande diff.

- [ ] **Step 1: Verify both repositories' starting states**

Run: `git -C /Volumes/APF/byolab status --short` and `git -C /Volumes/APF/Mande/Mande-DS-and-playground status --short`
Expected: only known byolab planning and `copy-booking-email` verdict changes; Mande must be clean.

- [ ] **Step 2: Configure the local Mande path in gitignored `byolab.local.json`**

Verify `git check-ignore byolab.local.json` succeeds.

- [ ] **Step 3: Import Button and inspect the generated draft**

Run: `pnpm lab import mande button --json`
Expected: `mande-button-r01`, source hashes, actual Mande component preview, and no Mande modifications.

- [ ] **Step 4: Run byolab grid and film checks before Keep**

Run: `pnpm lab grid mande-button-r01 && pnpm lab check mande-button-r01`
Expected: PASS.

- [ ] **Step 5: Keep the Button draft through the existing verdict workflow**

Run: `pnpm lab keep mande-button-r01 --json`
Expected: specimen moves into `src/specimens` and becomes Apply-eligible.

- [ ] **Step 6: Preview Apply and verify Mande remains unchanged**

Run: `pnpm lab preview-apply mande-button-r01 --json`
Expected: exact diff returned; Mande `git status --short` remains empty.

- [ ] **Step 7: Apply only after reviewing and confirming the preview**

Run: `pnpm lab apply mande-button-r01 --json`
Expected: validations pass; Mande contains uncommitted Button-related changes; no commit or push occurs.

- [ ] **Step 8: Verify the final status and manifest**

Run: `git -C /Volumes/APF/Mande/Mande-DS-and-playground status --short && git -C /Volumes/APF/byolab status --short`
Expected: Mande shows only reviewed Button output; byolab contains the kept specimen and apply manifest.

- [ ] **Step 9: Exercise Edit without applying a second revision**

Use **Edit** and verify `mande-button-r02` appears as a draft while `r01` remains kept; Mande remains at the applied `r01` state.

- [ ] **Step 10: Run final verification**

Run in byolab: `pnpm test:scripts && pnpm typecheck && pnpm lint && pnpm build`

Run in Mande: `pnpm exec tsc -p packages/ui/tsconfig.json --noEmit && pnpm --filter @mande/playground build && pnpm build-storybook`

Expected: all commands pass. Present both repositories' uncommitted diffs for user review; do not commit or push.

