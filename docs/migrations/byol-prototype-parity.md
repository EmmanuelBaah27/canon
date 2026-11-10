# Unified BYOL migration parity

Date: 2026-11-10  
Unified branch: `codex/byol-unified`  
Prototype evidence branch: `codex/byol-mvp`  
Original byolab lineage: `jal-co/byolab` history, preserved in the unified branch

## Decision

BYOL is the original byolab expanded with connected-source capabilities. The original gallery, specimen page, theme hook, FitFrame, footer, verdict lifecycle, components, tokens, films, and project skills remain authoritative. The prototype's separate canvas app, UI package, copied stylesheet, and replacement shell are intentionally discarded.

The prototype is **not yet approved for deletion**. Useful history is preserved in Git, but retirement still requires the owner to accept the two open parity limits below and explicitly authorize the gated commands.

## Capability matrix

| Capability | Prototype evidence | Unified implementation | Status |
| --- | --- | --- | --- |
| Repository connection | `packages/repository/src/connect.ts` | Same audited headless package, exposed through `vite/lab-api.ts` and the original gallery | Complete |
| Static component discovery | `packages/repository/src/discover.ts` | Migrated package plus approved-manifest path filtering | Complete |
| Design-system discovery | Prototype assumed source conventions | Explicit/inferred proposal with evidence, ambiguity review, owner approval, symlink/submodule exclusion, and stale-commit rejection | Improved |
| Token fidelity | repository/runtime token evidence suites | Migrated immutable evidence and exact token binding logic; connected token namespace remains separate from BYOL chrome | Complete |
| Preview isolation | separate canvas CSS | Original FitFrame plus source-owned custom-property namespace; unsupported execution is visibly blocked | Partial: safe reconstruction, not arbitrary exact execution |
| Draft creation and recovery | runtime `DraftService` | Migrated runtime persistence plus source drafts in the original specimen registry and session | Complete for current local session workflow |
| Keep/close lifecycle | canvas-specific actions | Existing byolab Keep/Toss actions; unkept connected drafts disappear immediately and kept drafts remain in the gallery | Complete |
| Unified issues | prototype IssuesRail | One left rail, one count, dynamic category filters, only blockers auto-expand | Complete |
| Visual/component enforcement | partial token audit | Semantic visual values, shared-component bypass, ambiguity, governed behavior, and behavioral-addition findings | Improved |
| Approval invalidation | integration approval | Exact repository, commit, draft, revision, component, rule/property, and value tuple | Improved |
| Integration safety | isolated worktree and publication lease | Migrated `@byol/integration` unchanged, with 72 security tests passing | Complete |
| Dialkit | prototype bridge/card | Actual `DialRoot` in the original `SpecimenPage`; source-derived controls and Advanced initially expanded | Complete |
| Light/dark behavior | separate prototype theme | Original `useTheme` remains the only chrome theme; Playwright verifies gallery and connected draft behavior | Complete |
| Agent workflow | `.codex/skills/byol` prototype skill | `.agents/skills/lab-source/SKILL.md`, routed from the original `AGENTS.md` alongside every existing lab skill | Complete |
| Separate canvas shell | `apps/canvas`, `WorkbenchShell`, `LabPrimitives`, `byolab.css` | Intentionally absent | Discarded by design |
| Prototype UI package | `packages/ui` | Original `src/components/ui` and `src/index.css` formalized in `DESIGN_SYSTEM.md` | Discarded by design |
| Prototype CLI host adapter | `packages/cli` | Replaced in the product path by the Vite lab API and project skill | Not migrated |

## Verification evidence

The unified branch passed:

- Core contracts: 109 tests.
- Repository containment/discovery: 48 tests, including malicious paths, symlinks, submodules, CSS dependencies, and stale source evidence.
- Integration and publication safety: 72 tests, including HEAD/base drift, branch collisions, hooks/filters, verification timeouts, source mutation, leases, and approval reuse.
- Runtime: 149 tests for drafts, issues, controls, token audit/evidence, safe source reconstruction, and local server behavior.
- Original/unified application: 18 unit tests.
- Playwright: original gallery/theme behavior and connect → approve → select → source draft → issue rail → Dialkit → keep.
- `npm run typecheck`, `npm run lint`, and `npm run build`.
- Duplicate check: no `apps/canvas`, `packages/ui`, `WorkbenchShell`, `LabPrimitives`, `byolab.css`, `--byol-color-*`, or `--lab-*` in the unified source tree.

Three lint warnings remain inside migrated security fixtures/parser syntax; none were introduced by the unified UI.

## Open parity limits

1. **Arbitrary exact source execution is intentionally unavailable.** Checkbox evidence has a reviewed reconstruction path; unsupported components display a blocker and a source draft preview rather than being called the actual component. Retirement requires the owner to accept this safety boundary or a later isolated exact-renderer implementation.
2. **Two prototype CLI-crossing security suites remain preserved but excluded from the runtime aggregate:** `token-binding-safety.test.ts` and `token-capability-safety.test.ts` import the intentionally unmigrated `packages/cli`. Their underlying static token-evidence coverage runs in the migrated runtime suite, but the end-to-end CLI boundary is not part of the unified Vite-host path. Do not describe full CLI parity as complete.

These are documented gaps, not silent exceptions. They do not justify restoring the duplicate shell or UI package.

## Retirement targets

No command below has been executed.

- Prototype branch: `codex/byol-mvp` at `6e4bdfa`.
- Older prototype `main` lineage in `/Users/emmanuelbaah/Documents/ChatGPT/BYOL` at `cc1b429`.
- Unified working branch: `codex/byol-unified`.
- Recoverable generated-artifact archive: `/private/tmp/byol-prototype-artifacts-20261110`.
- Unified worktree: `/Users/emmanuelbaah/.codex/worktrees/byol-mvp/BYOL`.

## Gated retirement checklist

Only after the owner explicitly approves retirement:

1. Re-run the full verification commands from this document.
2. Preserve named archive refs before moving the surviving `main` branch:

   ```bash
   git -C /Users/emmanuelbaah/Documents/ChatGPT/BYOL tag archive/byol-prototype-main-2026-11-10 cc1b429
   git -C /Users/emmanuelbaah/Documents/ChatGPT/BYOL tag archive/byol-prototype-mvp-2026-11-10 6e4bdfa
   ```

3. With explicit confirmation that `codex/byol-unified` is the surviving product, move `main` to the verified unified commit using a reviewed, recoverable branch operation. Because the histories have no merge base, this is a lineage replacement rather than a normal merge; prepare and review the exact command at execution time instead of copying a force command from documentation.
4. Confirm the surviving checkout builds and that both archive tags resolve.
5. Remove the now-unused unified worktree with `git worktree remove <exact-worktree-path>` only after its branch is represented by surviving `main`.
6. Delete `codex/byol-mvp` only after checking that `archive/byol-prototype-mvp-2026-11-10` exists.
7. Remove `/private/tmp/byol-prototype-artifacts-20261110` only if the owner confirms the recoverable generated artifacts are no longer needed.

The branch move, worktree removal, branch deletion, and artifact deletion each require a fresh explicit owner confirmation. This document records targets and prerequisites; it grants no deletion authority.
