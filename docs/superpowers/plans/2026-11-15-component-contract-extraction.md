# Component Contract Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one bounded extraction service that resolves complete component contracts and independently produces curated, immediate preview controls.

**Architecture:** A pinned TypeScript semantic resolver produces immutable property-granular evidence from approved source and locked declarations. Framework adapters annotate that evidence, Control Selection converts eligible evidence into stable domain-grouped controls, and versioned artifacts drive drafts, previews, review diffs, and caches.

**Tech Stack:** TypeScript 5.9, React, Vite, Vitest, existing repository evidence/cache services, Dialkit.

**Spec:** `docs/superpowers/specs/2026-11-15-component-contract-extraction-design.md`

## Global Constraints

- Never execute connected repository code, scripts, plugins, compiler configuration, or package lifecycle hooks.
- Source type safety outranks metadata and heuristics.
- Valid sibling properties survive local discrepancies and budget exhaustion.
- Public Contract extraction and Control Selection remain separate modules.
- Existing drafts never silently change artifacts; kept drafts are immutable.
- Dialkit uses Content, State, Appearance, Layout, and Behavior domains.
- Dialkit-to-preview changes render within the next animation frame and persist asynchronously.
- Do not add dependencies without owner approval.

## Review Focus

- Recursive conditional/mapped types must terminate within budgets and preserve verified siblings — covered by Task 3.
- Duplicate React declarations must create property-level conflicts without contaminating unrelated evidence — covered by Task 3.
- Workspace aliases crossing package boundaries must resolve from the approved commit only — covered by Task 2.
- A background artifact completing after source approval changes must be discarded — covered by Task 6.
- Required generic or compound content without a fixture must stop before an invalid preview render — covered by Task 5.

---

### Task 1: Extraction artifact domain model

**Files:**
- Create: `packages/runtime/src/extraction/types.ts`
- Create: `packages/runtime/src/extraction/artifact.ts`
- Test: `packages/runtime/src/extraction/artifact.test.ts`

**Interfaces:**
- Produces: `EvidenceState`, `PropertyEvidenceV2`, `ContractBranch`, `PublicContract`, `ControlSelection`, `ExtractionArtifact`, `ExtractionArtifactIdentity`, `artifactKey(identity)`.

- [ ] **Step 1: Write failing artifact-schema tests** asserting deterministic serialization, all semantic identity inputs, stable property provenance, and rejection of duplicate property IDs within a branch.
- [ ] **Step 2: Run** `npm exec vitest run packages/runtime/src/extraction/artifact.test.ts` and verify failure because the module does not exist.
- [ ] **Step 3: Implement the exact exported types and `artifactKey(identity: ExtractionArtifactIdentity): string`** using canonical key ordering and the existing cryptographic hash convention.
- [ ] **Step 4: Run the artifact tests and `npm run typecheck`; verify both pass.**
- [ ] **Step 5: Commit** `feat: define component extraction artifacts`.

### Task 2: Minimal approved declaration closure

**Files:**
- Create: `packages/repository/src/declaration-closure.ts`
- Modify: `packages/repository/src/executable-evidence.ts`
- Modify: `packages/repository/src/dependency-cache.ts`
- Test: `packages/repository/src/declaration-closure.test.ts`

**Interfaces:**
- Consumes: approved commit evidence, locked package bindings, local import graph.
- Produces: `buildDeclarationClosure(input): Promise<DeclarationClosure>` with files, module map, per-file imports, fingerprints, compiler-version notice, and bounded diagnostics.

- [ ] **Step 1: Write failing closure tests** for Mande-style React+CVA types, workspace aliases, exact lockfile identity, missing declarations, no lifecycle execution, and cancellation after approval changes.
- [ ] **Step 2: Run the focused test and verify the legacy cache loads broader package evidence or lacks the new result.**
- [ ] **Step 3: Implement recursive declaration resolution** from the selected component only, charging existing source budgets plus declaration-count and wall-time budgets.
- [ ] **Step 4: Prove package scripts do not run** with a fixture whose lifecycle script writes a sentinel; assert the sentinel is absent.
- [ ] **Step 5: Run repository tests and typecheck; verify pass.**
- [ ] **Step 6: Commit** `feat: build locked declaration closures`.

### Task 3: TypeScript semantic contract resolver

**Files:**
- Create: `packages/runtime/src/extraction/resolve-contract.ts`
- Create: `packages/runtime/src/extraction/budgets.ts`
- Modify: `packages/runtime/src/source-evidence.ts`
- Test: `packages/runtime/src/extraction/resolve-contract.test.ts`

**Interfaces:**
- Consumes: `resolvePublicContract({sources, sourcePath, exportName, closure, adapter, budgets, signal})`.
- Produces: `PublicContract` plus property-level discrepancies and measured budget usage.

- [ ] **Step 1: Write a failing conformance table** for interfaces, aliases, `Omit`, `Pick`, `Partial`, `Required`, `Readonly`, mapped/conditional types, intersections, discriminated unions, generics, overloads, re-exports, conflicts, and recursive budget exhaustion.
- [ ] **Step 2: Add an exact Mande Input fixture** asserting verified `error`, `disabled`, `placeholder`, `value`, `defaultValue`, `readOnly`, `required`, `type`, `inputMode`, `autoComplete`, and relevant constraints while events remain contract evidence.
- [ ] **Step 3: Run the resolver tests and verify failure under the existing `noLib` walker.**
- [ ] **Step 4: Implement the pinned compiler host and stdlib** and resolve branch-aware properties through the TypeScript checker; attach original declarations and transformation provenance.
- [ ] **Step 5: Implement property-local conflict and budget degradation**; block only unidentified root contracts or compromised integrity.
- [ ] **Step 6: Keep `extractPublicPropertiesFromGraph` as a temporary adapter to the new resolver** and remove user-facing calls to the single-file extractor.
- [ ] **Step 7: Run runtime tests, typecheck, and adversarial budget fixtures; verify pass.**
- [ ] **Step 8: Commit** `feat: resolve complete component contracts`.

### Task 4: React and React Native adapters

**Files:**
- Create: `packages/runtime/src/extraction/adapters/types.ts`
- Create: `packages/runtime/src/extraction/adapters/react.ts`
- Create: `packages/runtime/src/extraction/adapters/react-native.ts`
- Create: `packages/runtime/src/extraction/platform-profiles.ts`
- Test: `packages/runtime/src/extraction/adapters/react.test.ts`
- Test: `packages/runtime/src/extraction/adapters/react-native.test.ts`

**Interfaces:**
- Produces: `FrameworkAdapter` with wrapper unwrapping, slot/event semantics, platform profile selection, and compound/polymorphic relationships.

- [ ] **Step 1: Write failing adapter tests** for `forwardRef`, `memo`, resolvable `lazy`, unknown HOCs, `as`/`asChild`, compound exports, React events/slots, and React Native `TextInput`.
- [ ] **Step 2: Run the adapter tests and verify failure.**
- [ ] **Step 3: Implement React adapter and versioned HTML profiles** without moving React concepts into core artifact types.
- [ ] **Step 4: Implement React Native adapter and profiles** with equivalent provenance and event semantics.
- [ ] **Step 5: Run adapter tests and typecheck; verify pass.**
- [ ] **Step 6: Commit** `feat: add React contract adapters`.

### Task 5: Deterministic control selection

**Files:**
- Create: `packages/runtime/src/control-selection.ts`
- Modify: `packages/runtime/src/control-derivation.ts`
- Modify: `packages/core/src/schemas.ts`
- Test: `packages/runtime/src/control-selection.test.ts`

**Interfaces:**
- Consumes: `selectControls(contract, metadata, platformProfile, tokenBindings): ControlSelection`.
- Produces: stable domain groups, applicability conditions, fixture requirements, state constraints, exclusions, and reasons.

- [ ] **Step 1: Write failing selection tests** for the five eligibility rules, metadata precedence, stale metadata conflicts, token-binding proof, event observations, fixture-only complex values, required props, conditional preservation, and stable ordering.
- [ ] **Step 2: Run the focused test and verify failure.**
- [ ] **Step 3: Add the versioned connected metadata schema** for labels, domains, order, visibility, constraints, fixtures, applicability, and relationships.
- [ ] **Step 4: Implement `selectControls`** with priority: valid connected metadata, source annotations, platform profile, generic heuristics.
- [ ] **Step 5: Adapt legacy `deriveControls` callers** while keeping output compatibility until Task 6 removes duplication.
- [ ] **Step 6: Run core/runtime tests and typecheck; verify pass.**
- [ ] **Step 7: Commit** `feat: separate control selection from extraction`.

### Task 6: One extraction service, artifact cache, and draft migration

**Files:**
- Create: `packages/runtime/src/extraction/service.ts`
- Create: `packages/runtime/src/extraction/cache.ts`
- Modify: `vite/lab-service.ts`
- Modify: `packages/runtime/src/server.ts`
- Modify: `packages/runtime/src/project-state.ts`
- Test: `vite/connected-extraction.test.ts`
- Test: `packages/runtime/src/extraction/cache.test.ts`

**Interfaces:**
- Produces: `ExtractionService.extractSelected(request, signal)`, `warm(requests, signal)`, `diffArtifacts(previous, next)`, and artifact-backed draft snapshots.

- [ ] **Step 1: Write failing integration tests** proving Vite and runtime entry points return the same artifact and controls, cache identity invalidates every semantic input, stale jobs are discarded, and kept drafts never mutate.
- [ ] **Step 2: Run focused tests and verify the duplicated legacy server path diverges.**
- [ ] **Step 3: Implement the shared service and local cache** with selected work priority, cancellation, bounded concurrency, and immutable artifact storage.
- [ ] **Step 4: Route draft creation, refresh, status, validation, preview, and integration through the service.**
- [ ] **Step 5: Add explicit artifact refresh and property-level diff migration** preserving compatible values and requiring review for changed/removed controls.
- [ ] **Step 6: Run Vite, runtime, integration, and project-state tests; verify pass.**
- [ ] **Step 7: Commit** `feat: unify artifact-backed extraction`.

### Task 7: Progressive immediate Dialkit preview

**Files:**
- Modify: `src/byol/dialkit.tsx`
- Modify: `src/byol/dialkit-model.ts`
- Modify: `src/byol/source-draft.ts`
- Modify: `src/byol/source-draft-model.ts`
- Modify: `src/byol/issue-copy.ts`
- Test: `src/byol/dialkit.test.tsx`
- Test: `src/byol/source-draft.test.ts`

**Interfaces:**
- Consumes: progressive artifact/control updates and applicability conditions.
- Produces: optimistic next-frame preview messages, asynchronous persistence, rollback, stable domain positions, explicit empty/loading/discrepancy states, and interaction observations.

- [ ] **Step 1: Write failing UI/model tests** for optimistic preview before persistence, rollback on rejection, preserved inactive values omitted from render, stable ordering when controls arrive, required-prop configuration, and three distinct empty states.
- [ ] **Step 2: Run focused tests and verify failure under server-roundtrip-first updates.**
- [ ] **Step 3: Split local preview projection from durable draft persistence** and coalesce persistence without delaying iframe render messages.
- [ ] **Step 4: Apply conditional visibility and valid-state constraints** without replacing the five control domains.
- [ ] **Step 5: Update plain-language discrepancy copy** and bounded Technical details.
- [ ] **Step 6: Run BYOL tests and typecheck; verify pass.**
- [ ] **Step 7: Commit** `feat: make extracted controls immediately responsive`.

### Task 8: Performance, security, migration, and release proof

**Files:**
- Create: `packages/runtime/src/extraction/performance.test.ts`
- Create: `packages/runtime/src/extraction/security.test.ts`
- Create: `docs/migrations/component-contract-artifacts.md`
- Modify: `vite/connected-issues.test.ts`
- Modify: `packages/integration/src/integration.test.ts`

**Interfaces:**
- Verifies the complete system and documents rollout/rollback; produces no new product API.

- [ ] **Step 1: Add performance fixtures** asserting cached retrieval under 100 ms, local evidence under 500 ms, warm resolution under 2 seconds, and selected work priority over warming.
- [ ] **Step 2: Add adversarial fixtures** for recursive types, branch explosions, malicious declarations, path escape, duplicate declarations, stale approvals, cancellation, and lifecycle-script sentinels.
- [ ] **Step 3: Add Mande regression fixtures** for Input, Button, Checkbox, Chip, and InputWithLabel with curated expected controls and partial-declaration behavior.
- [ ] **Step 4: Write the migration document** covering artifact versioning, unchanged saved drafts, explicit refresh, cache eviction, APF document relocation, and rollback to the prior extractor.
- [ ] **Step 5: Run** `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:byol`, and `npm run test:e2e`; verify all required suites pass and only documented fixture warnings remain.
- [ ] **Step 6: Manually inspect light/dark Mande Input** and verify immediate controls, contract evidence, conditional behavior, readable discrepancies, and zero repository execution.
- [ ] **Step 7: Commit** `test: prove component extraction release gates`.

## Self-review result

- All six grill rounds map to Tasks 1–8.
- Type names and service interfaces are defined before downstream use.
- Security, performance, migration, UI responsiveness, and difficult TypeScript shapes each have explicit tests.
- The plan deliberately postpones Vue/Svelte adapters and structured slot editors.
- When `/Volumes/APF/CodexWorktrees/byol-unified` is mounted, copy these five document groups (glossary, two ADRs, spec, and plan) there before implementation and reconcile paths against the then-current branch.
