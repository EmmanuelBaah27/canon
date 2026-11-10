# Unified BYOL Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the original byolab codebase the single BYOL application, formalize its internal design system, and add connected-repository design-system import and enforcement without retaining the duplicate canvas shell.

**Architecture:** Start a new consolidation branch from the original byolab history while preserving the current prototype on `codex/byol-mvp`. Retain byolab's root Vite application, specimen route, theme, components, skills, `TASTE.md`, and `GRID.md`; migrate the headless BYOL domain packages into the same pnpm workspace. Connected component imports become ordinary byolab drafts rendered by the existing `SpecimenPage`, with source-system validation, issues, approvals, and Dialkit controls added as capabilities rather than a parallel page shell.

**Tech Stack:** React 19, TypeScript, Vite, pnpm workspaces, Tailwind CSS 4, shadcn/Radix, Dialkit, Zod, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-11-10-formal-design-system-design.md`

## Global Constraints

- BYOL and byolab are one application; no parallel shell, app, or product identity may remain.
- The original byolab repository history and application foundation survive the migration.
- Preserve `TASTE.md`, `GRID.md`, original project skills, specimen workflows, films, theme behavior, and `SpecimenPage`.
- Reuse the original `src/components/ui` implementations and the original semantic values in `src/index.css`; do not port, wrap, restyle, or recreate controls from the prototype.
- If a required primitive is missing, add the matching shadcn/Radix primitive directly to the original `src/components/ui` system and make it consume the original tokens; do not create a BYOL-only substitute.
- Never migrate `apps/canvas`, `packages/ui`, `WorkbenchShell`, `LabPrimitives`, `byolab.css`, prototype shell tokens, or prototype shell styles.
- BYOL internal tokens never style connected component previews; connected tokens never style BYOL chrome.
- Hardcoded visual values and shared-component bypasses require resolution or draft-scoped approval.
- Newly introduced behavioral values are non-blocking notices when no source-system rule exists.
- Approval is bound to repository, commit, draft revision, component, rule/property, and exact value; relevant changes invalidate it.
- Connected repository discovery is static and read-only; it never executes repository scripts.
- All findings share one count and issue bucket; only blockers auto-expand it.
- No repository or branch is deleted during this plan.
- Ask before adding any dependency not already present in either codebase.

## Review Focus

- A repository containing malicious paths, symlinks, submodules, or instruction text must remain contained and must not execute code.
- Identically named internal and connected tokens must remain distinct identities and must never cross the preview boundary.
- A previously approved value changed by one byte or attached to a new source commit must become pending again.
- CSS shorthand, CSS variables, arbitrary Tailwind values, JSX style objects, and component props must all produce consistent visual-value findings.
- Existing local byolab specimens, films, theme switching, keep/toss, and keyboard navigation must behave exactly as before migration.

---

### Task 1: Establish the Canonical byolab Lineage

**Files:**
- Preserve branch: `codex/byol-mvp`
- Create branch: `codex/byol-unified`
- Preserve from current branch: `docs/superpowers/specs/2026-11-10-formal-design-system-design.md`
- Preserve from current branch: `docs/superpowers/plans/2026-11-10-unified-byol-design-system.md`
- Base new branch on: original byolab `main`

**Interfaces:**
- Consumes: current prototype history and the local original byolab clone at `/private/tmp/byolab-upstream`
- Produces: a clean consolidation branch whose root is the original byolab application and whose Git history can still reach the archived prototype branch

- [ ] **Step 1: Capture the current prototype without mixing it into the surviving application tree**

Commit all current prototype code on `codex/byol-mvp` as `chore: checkpoint BYOL prototype`, keeping the approved spec and this plan in a separate docs commit so that docs alone can be cherry-picked.

- [ ] **Step 2: Verify the source histories are recoverable**

Run: `git branch --contains HEAD && git -C /private/tmp/byolab-upstream rev-parse --verify main`

Expected: `codex/byol-mvp` contains the checkpoint and the original clone reports a valid `main` commit.

- [ ] **Step 3: Import the original byolab history and create the consolidation branch**

Fetch `/private/tmp/byolab-upstream` as the `byolab` remote reference, create `codex/byol-unified` from `byolab/main`, then cherry-pick only the approved spec and plan docs commit.

- [ ] **Step 4: Install and verify the untouched original foundation**

Run: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build`

Expected: all original byolab checks pass before any BYOL migration code lands.

- [ ] **Step 5: Verify the consolidation branch is clean and docs-only relative to byolab**

Run: `git status --porcelain && git diff --name-only byolab/main...HEAD`

Expected: status is empty and the diff lists only the approved specification and this plan.

### Task 2: Formalize the Internal Design-System Contract

**Files:**
- Create: `DESIGN_SYSTEM.md`
- Create: `byol.design-system.json`
- Create: `src/design-system/schema.ts`
- Create: `src/design-system/schema.test.ts`
- Create: `src/design-system/internal.ts`
- Modify: `src/index.css`
- Modify: `src/components/ui/*.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: original `src/index.css`, `src/components/ui`, `TASTE.md`, and `GRID.md`
- Produces: `DesignSystemManifestSchema`, `DesignSystemManifest`, and `internalDesignSystem` for repository discovery and validation tasks

- [ ] **Step 1: Write failing manifest-schema tests**

Add tests that accept the approved internal manifest; reject unknown keys, empty paths, path traversal, absolute paths, duplicate evidence paths, unsupported schema versions, and validation severities outside `approval | notice | ignore`.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `pnpm vitest run src/design-system/schema.test.ts`

Expected: FAIL because `schema.ts` and its exports do not exist.

- [ ] **Step 3: Implement `DesignSystemManifestSchema` and `DesignSystemManifest`**

The schema must expose version `1`, repository-relative arrays for `tokens`, `components`, and `rules`, declared themes, and validation modes for `hardcodedVisualValues`, `sharedComponentBypass`, and `unknownBehavioralValues`.

- [ ] **Step 4: Add and load the internal manifest**

Create `byol.design-system.json` pointing to `src/index.css`, `src/components/ui`, `AGENTS.md`, `TASTE.md`, `GRID.md`, and `DESIGN_SYSTEM.md`; implement `internalDesignSystem` as a parsed immutable value.

- [ ] **Step 5: Document the system**

`DESIGN_SYSTEM.md` must define token categories, namespace boundaries, component inventory, component contribution requirements, variant/state/accessibility documentation, visual-value approval rules, behavioral notices, and the relationship among the manifest, `TASTE.md`, and `GRID.md`.

- [ ] **Step 6: Close internal token gaps without changing the incumbent visual world**

Capture light and dark baseline screenshots of the untouched original gallery and specimen shell. Name the existing spacing, sizing, motion, layer, radius, typography, color, and elevation values in `src/index.css`; update only the original shared components to consume those semantic tokens instead of equivalent arbitrary values. Preserve rendered appearance against the baselines. Do not import any prototype token or component file.

- [ ] **Step 7: Run focused and foundation verification**

Run: `pnpm vitest run src/design-system/schema.test.ts && pnpm typecheck && pnpm build`

Expected: schema tests, typecheck, and build pass.

- [ ] **Step 8: Commit**

```bash
git add DESIGN_SYSTEM.md byol.design-system.json src/design-system src/index.css src/components/ui package.json pnpm-lock.yaml
git commit -m "feat: formalize BYOL design system"
```

### Task 3: Migrate the Headless BYOL Domain Packages

**Files:**
- Create: `pnpm-workspace.yaml`
- Create from prototype: `packages/core/**`
- Create from prototype: `packages/repository/**`
- Create from prototype: `packages/runtime/**`
- Create from prototype: `packages/integration/**`
- Modify: `package.json`
- Modify: `tsconfig.app.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: prototype packages from `codex/byol-mvp`, `DesignSystemManifest` from Task 2
- Produces: tested `@byol/core`, `@byol/repository`, `@byol/runtime`, and `@byol/integration` workspace packages available to the original byolab application and Vite server plugin

- [ ] **Step 1: Add a failing root workspace verification**

Add a root `test:byol` script that runs all migrated package tests and a root typecheck reference that includes each package; run it before copying packages.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:byol`

Expected: FAIL because the workspace packages do not exist.

- [ ] **Step 3: Import only headless packages from `codex/byol-mvp`**

Bring over `core`, `repository`, `runtime`, and `integration`; do not import `apps/canvas`, `packages/ui`, copied shell CSS, or temporary UI primitives. Convert package dependency versions to `workspace:*` and preserve their tests.

Run: `test ! -e apps/canvas && test ! -e packages/ui && ! git diff --name-only byolab/main...HEAD | rg 'WorkbenchShell|LabPrimitives|byolab\.css|apps/canvas|packages/ui'`

Expected: exit 0 before continuing.

- [ ] **Step 4: Reconcile package contracts with the formal manifest**

Move the shared `DesignSystemManifestSchema` to `@byol/core` and re-export it to the root application. Update Task 2 imports without duplicating the schema.

- [ ] **Step 5: Preserve React singleton and Node/browser boundaries**

Keep headless packages free of React; configure Vite to dedupe `react` and `react-dom`; expose Node-only repository/runtime APIs only through the Vite server plugin.

- [ ] **Step 6: Run package and application verification**

Run: `pnpm test:byol && pnpm typecheck && pnpm build`

Expected: all migrated tests and the original application pass together.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml packages package.json pnpm-lock.yaml tsconfig.app.json vite.config.ts src/design-system
git commit -m "feat: migrate BYOL domain runtime"
```

### Task 4: Discover and Approve Connected Design-System Manifests

**Files:**
- Create: `packages/repository/src/design-system.ts`
- Create: `packages/repository/src/design-system.test.ts`
- Modify: `packages/repository/src/index.ts`
- Modify: `packages/core/src/schemas.ts`
- Modify: `packages/core/src/schemas.test.ts`
- Create: `src/byol/repository-setup.tsx`
- Create: `src/byol/repository-setup.test.tsx`
- Modify: `vite/lab-api.ts`

**Interfaces:**
- Consumes: immutable Git snapshot reader from `@byol/repository` and `DesignSystemManifestSchema` from `@byol/core`
- Produces: `discoverDesignSystem(connection): Promise<DesignSystemProposal>` and `approveDesignSystemProposal(input): Promise<ApprovedDesignSystem>`

- [ ] **Step 1: Write failing discovery tests**

Cover an explicit manifest, inferred tokens/components/rules, ambiguous candidates with evidence, malicious paths, symlinks, submodules, instruction files that contain executable-looking text, duplicate paths, and a source commit changing between discovery and approval.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @byol/repository test -- design-system.test.ts`

Expected: FAIL because design-system discovery does not exist.

- [ ] **Step 3: Implement static proposal discovery**

`discoverDesignSystem` must prefer a valid root `byol.design-system.json`, otherwise infer candidates from committed regular blobs only. Every proposed path includes evidence and confidence; no repository module or script executes.

- [ ] **Step 4: Implement approval and source revalidation**

Approval must bind repository identity and exact source commit, reject stale proposals, parse the corrected manifest, and store the approved contract in BYOL session state without writing to the connected repository automatically.

- [ ] **Step 5: Build the first-connection review surface with original UI components**

Use the original shadcn components and original internal tokens. When a missing Dialog, Command, Select, or other primitive is required, add its shadcn/Radix implementation to the original `src/components/ui` directory and document it in the formal system. Show discovered paths, evidence, ambiguities, editable corrections, and one explicit approval action. Do not recreate or wrap the specimen header, theme controls, Button, Input, Select, or any other existing primitive.

- [ ] **Step 6: Run focused and aggregate tests**

Run: `pnpm --filter @byol/repository test -- design-system.test.ts && pnpm vitest run src/byol/repository-setup.test.tsx && pnpm test:byol`

Expected: discovery, approval UI, and all domain tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/repository src/byol/repository-setup.tsx src/byol/repository-setup.test.tsx vite/lab-api.ts
git commit -m "feat: import connected design system rules"
```

### Task 5: Enforce Visual Values, Component Use, and Approval Invalidation

**Files:**
- Create: `packages/runtime/src/design-validation.ts`
- Create: `packages/runtime/src/design-validation.test.ts`
- Create: `packages/runtime/src/approvals.ts`
- Create: `packages/runtime/src/approvals.test.ts`
- Modify: `packages/core/src/schemas.ts`
- Modify: `packages/runtime/src/issues.ts`
- Modify: `packages/runtime/src/drafts.ts`
- Modify: `packages/runtime/src/protocol.ts`

**Interfaces:**
- Consumes: approved design-system manifest, component source snapshot, token/component inventories, draft revision state
- Produces: `validateDesignContract(input): DesignFinding[]`, `approveFinding(input): DraftApproval`, and invalidation on any bound-field change

- [ ] **Step 1: Write failing visual-value validation tests**

Cover CSS declarations and shorthands, CSS variables, JSX style objects, arbitrary Tailwind values, styled component props, same-name cross-namespace tokens, shared-component bypass, allowed structural values, computed runtime geometry, and ambiguous classification.

- [ ] **Step 2: Write failing behavioral-notice tests**

Cover an existing behavioral rule violation as approval-required, an unknown debounce/drag/keyboard/state-machine value as a non-blocking notice, visual motion as a visual finding, and a notice disappearing when a matching rule is later imported.

- [ ] **Step 3: Write failing approval-binding tests**

Assert approval invalidation for repository, commit, draft revision, component, rule/property, or exact-value changes; assert that approval never mutates the manifest or creates a reusable exception.

- [ ] **Step 4: Verify RED**

Run: `pnpm --filter @byol/runtime test -- design-validation.test.ts approvals.test.ts`

Expected: FAIL because validation and draft approvals do not exist.

- [ ] **Step 5: Implement semantic validation**

Reuse immutable source evidence and TypeScript/CSS parsing from the migrated runtime. Classify semantic usage rather than rejecting every literal. Unknown classification creates an ambiguity issue. Each finding includes location, evidence, rule, current value, alternatives, integration impact, and actions.

- [ ] **Step 6: Implement draft-scoped approvals**

Store approvals with the complete binding tuple from the specification. Revalidation compares every field and resolves only an exact match. Approved deviations remain visible metadata and satisfy readiness only for their bound revision.

- [ ] **Step 7: Extend the unified issue model**

Add violation and behavioral-addition categories while preserving one total count and category filters. Only blockers emit `autoExpand: true`.

- [ ] **Step 8: Run focused and aggregate verification**

Run: `pnpm --filter @byol/runtime test -- design-validation.test.ts approvals.test.ts && pnpm test:byol`

Expected: all new and migrated runtime tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core packages/runtime
git commit -m "feat: enforce design system contracts"
```

### Task 6: Integrate Connected Drafts into the Existing Lab Experience

**Files:**
- Create: `src/byol/component-picker.tsx`
- Create: `src/byol/component-picker.test.tsx`
- Create: `src/byol/issues-rail.tsx`
- Create: `src/byol/issues-rail.test.tsx`
- Create: `src/byol/dialkit.tsx`
- Create: `src/byol/dialkit.test.tsx`
- Create: `src/byol/source-draft.ts`
- Create: `src/byol/source-draft.test.ts`
- Create: `tests/e2e/original-lab.spec.ts`
- Create: `tests/e2e/connected-draft.spec.ts`
- Create: `playwright.config.ts`
- Modify: `src/lab/gallery.tsx`
- Modify: `src/lab/specimen-page.tsx`
- Modify: `src/lab/hooks.ts`
- Modify: `vite/lab-api.ts`
- Modify: `src/specimens/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: approved repository contract, component discovery, draft/issue/approval APIs, existing `SpecimenPage`, existing theme hook, and actual Dialkit
- Produces: repository connection and component selection from the gallery, connected drafts rendered through `SpecimenPage`, one issues rail, and source-aware Dialkit controls

- [ ] **Step 1: Write failing source-draft tests**

Assert that selecting a connected component creates an ordinary byolab draft entry with immutable source metadata, approved design-system identity, states, conditions, token bindings, behavioral configuration, and no duplicate shell metadata.

- [ ] **Step 2: Write failing UI boundary tests**

Assert that the gallery launches repository setup/component search; a created draft routes to the existing specimen URL; `SpecimenPage` retains its original header/theme/footer; connected drafts add one left issue rail and actual Dialkit; closing an unkept connected draft removes it immediately; keeping it uses the existing lab verdict lifecycle.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run src/byol/source-draft.test.ts src/byol/component-picker.test.tsx src/byol/issues-rail.test.tsx src/byol/dialkit.test.tsx`

Expected: FAIL because connected drafts are not integrated into the original lab.

- [ ] **Step 4: Add repository and component selection to the gallery**

Use the original internal components and tokens directly. After connection approval, expose component search in a command-style dialog built from primitives added to the same original design system. Create one temporary source draft and route to its existing specimen path. Do not copy JSX or CSS from the prototype canvas.

- [ ] **Step 5: Extend `SpecimenPage` in place**

Do not introduce a replacement shell. Render connected draft source inside the existing `FitFrame`; preserve header, theme, footer, keyboard behavior, and actual `DialRoot`. Add connected-draft actions through existing header action slots and render the collapsible issue rail on the left.

- [ ] **Step 6: Wire actual Dialkit controls**

Derive basic and advanced controls from source evidence; advanced starts expanded. Overrides stay in preview configuration, preserve source-token identity, and create the required issues or notices.

- [ ] **Step 7: Verify theme and namespace isolation in the browser**

Add `tests/e2e/original-lab.spec.ts` for the gallery, specimen header, theme switching, keyboard navigation, and draft verdict using a generated temporary fixture that is removed by test teardown. Add `tests/e2e/connected-draft.spec.ts` proving light/dark changes the lab chrome and Dialkit while connected preview tokens remain source-owned; include a same-name token fixture proving no identity leak. Add the root `test:e2e` script.

- [ ] **Step 8: Run the full application path**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm test:byol && pnpm vitest run && pnpm test:e2e`

Expected: all checks pass, including gallery, original specimen-shell fixture, connected draft, and theme-isolation browser tests.

- [ ] **Step 9: Commit**

```bash
git add src/byol src/lab src/specimens vite/lab-api.ts
git commit -m "feat: add connected design system drafts"
```

### Task 7: Add the Source Workflow Skill and Remove Duplicate Architecture

**Files:**
- Create: `.agents/skills/lab-source/SKILL.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Verify absent: `apps/canvas/**`
- Verify absent: `packages/ui/**`
- Verify absent: `src/byol/WorkbenchShell.tsx`
- Verify absent: `src/byol/LabPrimitives.tsx`
- Verify absent: copied `byolab.css`

**Interfaces:**
- Consumes: the completed connected-source workflow and formal system contracts
- Produces: agent instructions that reliably invoke the workflow and a single-application repository with no copied shell

- [ ] **Step 1: Write the `lab-source` skill contract**

Require reading `TASTE.md`, `GRID.md`, `DESIGN_SYSTEM.md`, and the approved connected manifest; connect/discover/approve before drafting; preserve source rules and token identity; use preview overrides only through Dialkit; surface violations and behavioral notices; never approve on the owner's behalf; run source revalidation before keep/integration.

- [ ] **Step 2: Route repository-source tasks from `AGENTS.md`**

Add one task row for connecting a design system, importing a component, retheming from source, or updating a connected draft. Preserve every original skill route.

- [ ] **Step 3: Document the unified product and migration**

Update README and changelog to describe BYOL as the expanded lab, the formal internal system, connected manifests, approval semantics, and the fact that no second application exists.

- [ ] **Step 4: Prove duplicate architecture is absent**

Run: `test ! -e apps/canvas && test ! -e packages/ui && ! rg -n "WorkbenchShell|LabPrimitives|byolab\.css|--byol-color-|--lab-" src`

Expected: exit 0.

- [ ] **Step 5: Run complete verification and inspect both themes**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm test:byol && pnpm vitest run`

Expected: every check passes. Then open the gallery, an original specimen, and a connected draft in light and dark themes; verify the original shell is the only shell.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills/lab-source AGENTS.md README.md CHANGELOG.md
git commit -m "docs: enforce connected source workflow"
```

### Task 8: Migration Parity and Retirement Readiness

**Files:**
- Create: `docs/migrations/byol-prototype-parity.md`
- Compare against branch: `codex/byol-mvp`

**Interfaces:**
- Consumes: all completed tasks and prototype behavior
- Produces: evidence that the unified application contains every approved capability and an exact, still-unexecuted retirement checklist

- [ ] **Step 1: Build the parity matrix**

Map repository connection, static discovery, token fidelity, preview isolation, draft keep/close, issue categories, approval invalidation, integration safety, Dialkit controls, theme behavior, and agent workflow from prototype to unified implementation. Mark intentionally discarded duplicate-shell behavior explicitly.

- [ ] **Step 2: Run security and edge-case verification**

Run all repository containment, token capability safety, source update, stale approval, publication lease, and CSS dependency tests migrated from the prototype.

Expected: all pass without weakening assertions.

- [ ] **Step 3: Run original byolab regression verification**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm test:e2e`

Expected: the gallery, original specimen shell fixture, theme switching, keyboard navigation, draft verdict, and deterministic film test fixture pass without connected-source mode enabled.

- [ ] **Step 4: Record retirement targets without deleting them**

List the obsolete prototype branch/worktree/repository target, the evidence preserving its useful history, and the exact removal commands. State that execution requires separate explicit owner confirmation.

- [ ] **Step 5: Commit**

```bash
git add docs/migrations/byol-prototype-parity.md
git commit -m "docs: verify unified BYOL migration parity"
```
