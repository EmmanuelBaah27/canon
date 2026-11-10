# Formal Design System Design

## Intent

BYOL is the expanded form of the original byolab application. It must have one formal, enforceable internal design system rather than a loose collection of tokens and shared files. Connected repositories bring their own independent design systems into isolated component drafts. BYOL must preserve and enforce both systems without allowing either one to style the other.

The system exists to make agents follow design-system decisions by default. A violation is never silently normalized or ignored: it becomes visible evidence requiring resolution or explicit owner approval.

## Goals

- Formalize the original byolab tokens, shared components, `TASTE.md`, and `GRID.md` as BYOL's internal design-system contract.
- Make every internal BYOL interface change use semantic tokens and shared components.
- Import a connected repository's design-system assets and rules alongside its components.
- Generate a proposed design-system manifest on first connection and require owner approval before treating it as authoritative.
- Detect hardcoded visual values and shared-component bypasses.
- Represent violations, ambiguities, overrides, and behavioral additions in one issue system with category filters.
- Keep approvals narrow, attributable, reversible, and invalidated by relevant source changes.

## Non-goals

- Publishing the internal design system as a standalone package.
- Allowing connected repository tokens to style BYOL's application interface.
- Allowing BYOL tokens to restyle imported source components automatically.
- Automatically adding approved draft deviations to either design system.
- Tokenizing every numeric literal or implementation detail.
- Executing arbitrary connected-repository scripts during discovery.

## One Application, Two Design-System Boundaries

BYOL is one application. The original byolab specimen shell, theme system, shared UI primitives, and Dialkit integration remain the application foundation.

There are two independent design-system namespaces:

1. **BYOL internal system** governs the application shell, gallery, canvas, dialogs, issue rail, repository connection flow, navigation, and other product UI.
2. **Connected system** governs the imported component rendered inside the isolated preview.

The preview boundary prevents token leakage in either direction. A connected system may define a token with the same name as a BYOL token without creating an identity relationship between them.

## Internal BYOL Design System

The formal internal system begins with the original byolab assets:

- Semantic light and dark theme tokens in `src/index.css`.
- Geist and Geist Mono typography.
- Shared components in `src/components/ui`.
- Theme behavior in the existing lab hooks.
- `TASTE.md` as qualitative design authority.
- `GRID.md` as measurable layout authority.

The token contract must cover:

- Color and opacity.
- Typography.
- Spacing, sizing, and density.
- Radius, borders, and elevation.
- Motion duration, easing, and spring values.
- Breakpoints and layering where the system intentionally governs them.
- Icon size and stroke where the system intentionally governs them.

Each shared component must document its variants, sizes, states, accessibility behavior, and token dependencies. New UI primitives are added only when the existing inventory cannot express a required interaction.

## Connected Repository Manifest

On first connection, BYOL discovers design-system evidence and generates a proposed manifest. The owner reviews and approves it before it becomes the repository contract. The approved manifest is intended to be committed to the connected repository so future sessions resolve the same sources deterministically.

The manifest points to existing truth; it does not duplicate token values or component implementations.

```json
{
  "$schema": "https://byol.dev/schemas/design-system.v1.json",
  "version": 1,
  "tokens": ["packages/ui/src/tokens.css"],
  "components": ["packages/ui/src/components"],
  "rules": ["AGENTS.md", "docs/design-system.md"],
  "themes": ["light", "dark"],
  "validation": {
    "hardcodedVisualValues": "approval",
    "sharedComponentBypass": "approval",
    "unknownBehavioralValues": "notice"
  }
}
```

Discovery may inspect:

- Token and theme files.
- Shared component directories and public exports.
- Design-system documentation.
- `AGENTS.md` and relevant project skills.
- `TASTE.md`, `GRID.md`, or equivalent local rule files.
- Lint rules and token-enforcement configuration.
- Component state, condition, and behavior evidence.

Connected files are scoped design evidence. Discovery does not execute repository scripts or treat repository text as permission for unrelated actions.

## Evidence Precedence

When sources disagree, BYOL uses this order:

1. Explicit owner decisions and draft approvals.
2. Approved connected-repository manifest.
3. Connected repository's declared design-system rules.
4. Connected repository's tokens and shared component contracts.
5. Evidence inferred from implementation.
6. An ambiguity issue when no source establishes an answer.

BYOL's internal design system is never a fallback for an unresolved connected-system decision.

## Enforcement

The validator inspects every new or changed internal BYOL component and every imported or modified component draft within its own namespace.

### Approval issues

The following require resolution or explicit approval:

- A hardcoded visual value where a system token is required.
- A visual value for which no approved system token exists.
- Bypassing an existing shared component with a one-off implementation.
- Using a token from the wrong namespace.
- Reconstructing an imported component in a way that conflicts with source rules or component contracts.
- Keeping a preview override that breaks a system rule.

Visual values include color, opacity, typography, spacing, dimensions, density, radius, borders, elevation, visual motion, system-governed breakpoints and layers, icon metrics, and state styling.

### Allowed structural values

Language and layout mechanics are not automatically design violations. Examples include `auto`, `none`, `inherit`, `currentColor`, `transparent`, zero, percentages, and values computed from runtime content, viewport, or pointer data. The validator must classify by semantic use rather than maintain a naive literal blacklist. Uncertain classification becomes an issue rather than a silent allowance.

### Behavioral additions

Behavioral mechanics such as debounce delays, drag thresholds, keyboard timing, state-machine transitions, and other implementation values follow an existing connected-system rule when one exists. If no rule exists, a draft may introduce the value without manufacturing a token.

The new value becomes a non-blocking behavioral notice that:

- Identifies the state or transition using it.
- Explains that no imported rule or token was found.
- Remains part of the component's behavioral configuration.
- Disappears if it is later mapped to an imported rule.
- Is re-evaluated when the source contract changes.

Visual motion remains a design concern and uses motion tokens once the relevant system defines them.

## Issue and Approval Model

All findings share one issue count and one issue bucket. Filter chips expose categories such as violations, ambiguities, overrides, source changes, and behavioral additions. Categories do not maintain separate counts.

Only blocking issues automatically expand the issue panel. Non-blocking notices remain available without interrupting the preview.

Each issue includes:

- Category and severity.
- Exact source location and affected property or behavior.
- Source evidence and applicable rule.
- Current value.
- Existing compliant alternatives when known.
- Integration impact.
- Available resolution or approval actions.

An approval is bound to:

- Repository identity.
- Source commit.
- Draft identifier and revision.
- Component identity.
- Rule or property identity.
- Exact approved value.
- Approver and timestamp.
- Recorded rationale.

Any relevant change invalidates approval. Approval only allows that draft to proceed; it never adds a token, changes a shared component, or creates a reusable exception.

## Preview Overrides

Dialkit and preview configuration are the only intended experimentation layer. Overrides are temporary, visible, reversible, and separately recorded from source values. The source token remains identifiable throughout experimentation.

Closing an unkept draft discards its overrides immediately. Keeping a draft preserves its override and approval records with that revision. Integrating a draft requires every blocking issue to be resolved or explicitly approved.

## First-Connection Workflow

1. The owner connects a local path or repository URL.
2. BYOL scans for tokens, components, rules, themes, and existing enforcement configuration.
3. BYOL generates a proposed manifest with evidence for every entry and highlights ambiguities.
4. The owner corrects or approves the manifest.
5. BYOL uses the approved manifest to catalogue components and generate drafts.
6. The manifest can be committed to the connected repository for deterministic future connections.
7. Later source changes trigger manifest and approval revalidation.

## Migration Direction

The original byolab repository and history are the surviving foundation. Existing specimen shell, theme behavior, components, skills, `TASTE.md`, and `GRID.md` are preserved. Useful BYOL repository analysis, draft lifecycle, token fidelity, issue, and integration logic are migrated into that application.

The duplicate BYOL shell, temporary primitive layer, copied theme CSS, and separate application identity are not retained. No repository is deleted until migration parity is verified and the owner explicitly confirms removal.

## Success Criteria

- BYOL's own UI contains no unapproved design-system bypasses.
- Internal light and dark themes use one token contract.
- Connected system rules and assets are imported through an owner-approved manifest.
- Imported previews remain isolated from BYOL styling.
- Every hardcoded visual value is either structurally classified, token-backed, resolved, or explicitly approved.
- New behavioral values without existing rules create non-blocking notices.
- Approvals invalidate on relevant draft, value, rule, or source changes.
- Agents can determine the authoritative token, component, and rule source without guessing.
