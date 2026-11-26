# Visual value controls: grill notes

Status: in progress (paused at rung 5). Input for the spec at
`docs/superpowers/specs/2026-11-23-visual-value-controls-design.md`, which is not written yet.

The feature turns the hardcoded visual values in a component's source (padding, gap, radius,
shadow, color, type, motion) into controls that snap to the design system's tokens. You tune
the component on the canvas, then copy the result as parameters or as a code diff.

## Goals (§G)

- **G1. It works with any connected design system.** Token scales are read from that system's
  own `@theme` CSS. No Canon or Mande token names are hardcoded in the extractor.
- **G2. The MVP proves it on Canon, with one draft.** A draft made with `pnpm lab new` composes
  three things, and together they exercise the whole pipeline:
  - **Canon `Button`** (`src/components/ui/button.tsx`): `cva` variants and sizes,
    `hover:` / `active:` states, and the arbitrary `scale-[0.96]`.
  - **Canon `Input`** (`src/components/ui/input.tsx`): plain `cn()` with no `cva`, the
    `md:text-sm` breakpoint, and the `focus-visible:` / `disabled:` / `aria-invalid:` states.
  - **A Card that lives only in the draft**: local parts (Card, Header, Content, Footer) in the
    draft file. It covers the Layers tree, nested radius (inner = outer − inset) and elevation.
    No new Card component goes in `src/components/ui`.
  - Done means:
    1. Select a layer at any depth, switch its state, and change spacing, color and motion
       tokens.
    2. The canvas preview matches, and the render check confirms every edit.
    3. Copy code produces a diff that applies cleanly and passes `pnpm lab grid`.
    4. No copied output contains a raw value.

## Constraints (§C)

- **C1. Preview scope.** An edit previews only on the canvas, which loads a separate module
  copy (`<file>?visual`). The lab's own interface always renders the original source.
- **C2. Arbitrary values that already exist in the source:**
  - An arbitrary value stays exactly as it is until you touch its control. On the first touch
    it rounds to the nearest token on that design system's scale (`scale-[0.96]` becomes
    `scale-95`).
  - An arbitrary value that already references a theme token converts exactly to that token's
    class (`[font-size:var(--text-compact)]` becomes `text-compact`).
  - Unlocking a control keeps the exact value and records it as a proposed token (name,
    category, value), for example `--scale-press: 0.96`.
  - A value with no scale (`bg-(image:--primary-raised)`) can't be adjusted. It is listed in
    Issues and never becomes a control.
- **C3. Edit target.** An edit goes to the file where the value is defined. A Button padding
  edit changes `button.tsx` for the whole system; a Card padding edit changes the draft. Each
  control labels its target file. There are no instance overrides (no `className` overrides
  added to one instance).
- **C4. Tokens only.** No raw value reaches a component. An unlocked value previews as an
  inline style labelled "not a token". It never appears in the patch or in Copy code, and it
  appears in Copy parameters only as a proposed token.
- **C5. Output.** Two buttons, Copy parameters and Copy code. Write-back to the source repo is
  a later phase.
- **C6. Controls panel.** Shows controls only, with no explanatory copy.
  - Controls are grouped as Layout, Appearance and Behavior, and scoped to the active variant.
  - Each control has a changed dot, Reset, and lock/unlock.
- **C7. Left panel.** Two tabs, Layers and Issues.
  - Issues replaces the floating `IssuesRail` and covers render mismatches, values that aren't
    tokens, values that can't be adjusted, and design findings.
- **C8. States.** A state dropdown appears in the top bar only when the selected layer's source
  defines states: prefixes, state props or `cva` state variants. The options come from the
  source, not a fixed list.
- **C9. Determinism.** Films keep using baked constants. `useDialKit` stays for tuning that
  isn't about visual values.

## Pipeline (agreed before the grill)

The pipeline uses approach C: static TypeScript extraction is the source of truth, and an
in-page render check confirms each edit.

Units live in `packages/runtime/src/visual/`:

| Unit | Job |
| --- | --- |
| `extract` | Find the visual values in the source |
| `tailwind-map` | Map Tailwind classes to properties and tokens |
| `scales` | Read each token scale from the design system's CSS |
| `controls` | Turn the extracted values into controls |
| `patch` | Write a token change back into the source text |
| `preview` | Vite plugin: `load` hook plus the `/__lab/visual/edits` endpoint, edits kept in memory |
| `render-check` | Confirm each edit in the rendered page and list values the extractor missed |
| `copy` | Produce the Copy parameters text and the Copy code diff |

Each extracted value is a `VisualSlot`:

```ts
{ id, path, range, variant, state,
  kind: 'spacing' | 'size' | 'radius' | 'elevation' | 'color' | 'type' | 'motion',
  property, raw, value, token: string | null,
  form: 'tw-scale' | 'tw-arbitrary' | 'style' | 'css' | 'motion-ref' | 'motion-literal' }
```

## Later phases

- **Phase 2:** an exact renderer for connected repos (an isolated Vite server in a sandboxed
  iframe).
- **Phase 3:** two-gate write-back.
  - Gate 1 writes the approved tokens into the design system.
  - Gate 2 writes the token-only component patch through BYOL's approval and write-branch
    flow.
- **Canvas phase:** a state switch on each component on the canvas, the layout of
  subcomponents on the canvas, and zoom.

## Open (`?`)

- `? opacity`: rung 5, not yet answered. Canon uses opacity modifiers such as `bg-primary/90`,
  `bg-destructive/10` and `ring-ring/50`.
  - Recommendation: a color token picker plus an opacity stepper in steps of 5 (0, 5 … 100).
  - A value off that grid follows C2.
  - `dark:` variants show up as a Light/Dark switch at the top of the controls, not as
    duplicate controls.
  - Alternative: allow only whole color tokens, so `bg-primary/90` would become a new token.
