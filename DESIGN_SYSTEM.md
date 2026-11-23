# BYOL Design System

This is the binding interface system for BYOL. `byol.design-system.json` identifies its sources; `TASTE.md` defines qualitative judgment; `GRID.md` defines measurable layout rules. Agents must read all four before changing product UI.

## Namespace boundary

The tokens and components here govern BYOL chrome: the gallery, specimen shell, canvas, navigation, repository setup, issue review, dialogs, and controls. They never style a connected component preview. Connected repository tokens and rules govern only that isolated preview and never style BYOL chrome.

## Tokens

`src/index.css` is the only internal token source. Use semantic Tailwind names backed by its `@theme` variables rather than literal CSS values.

| Category | Contract |
| --- | --- |
| Color | Semantic surface, content, action, feedback, border, and focus tokens in both themes |
| Typography | Inter for interface text; Geist Mono only for code and measured data; documented size and weight roles |
| Spacing and size | The 8px grid and 4px in-control half-step from `GRID.md`; named control, dialog, picker, and issue-rail geometry |
| Radius | Base radius plus derived control radii; nested radius follows outer minus inset |
| Elevation | `hairline`, `raised`, `raised-hover`, `floating`, `window`, and `inset` |
| Motion | Named product durations and easings; product motion remains under 300ms and respects reduced motion |
| Layer | Named stacking roles; component-local stacking may use the documented Tailwind scale |
| Icons | Lucide, using the component's named size and inherited stroke |

Hardcoded visual values require a design-system issue and owner approval. Structural CSS values and computed runtime geometry are allowed when they do not encode a visual decision. Unknown behavioral values create non-blocking notices when no system rule exists.

## Components

All reusable product controls live in `src/components/ui`. Use an existing component before introducing another implementation.

| Component | Variants and sizes | Required states and accessibility |
| --- | --- | --- |
| Badge | default, secondary, destructive, outline, ghost, link | focus and invalid when interactive; semantic text remains visible |
| Button | default, outline, secondary, ghost, destructive, link; xs, sm, default, lg and icon sizes | hover, active, focus, disabled, invalid; native button or Slot semantics |
| Dropdown menu | item, checkbox, radio, sub-menu and destructive item | roving keyboard focus, checked state, disabled state, Escape dismissal |
| Dialog | modal content with overlay, title, description and close control | focus trap, labelled title, Escape dismissal, focus return |
| Input | native input types | placeholder, focus, disabled, invalid; always receives an accessible label at use site |
| Kbd | key and key group | supplementary text only; never the sole control label |
| Separator | horizontal and vertical | decorative by default; semantic separator when requested |
| Slider | horizontal and vertical, single or multiple thumb | keyboard adjustment, focus, disabled, accessible name at use site |
| Switch | small and default | checked, unchecked, focus, disabled, invalid; accessible name at use site |
| Toggle | default, outline, segmented; sm, default, lg | pressed, hover, focus, disabled, invalid |
| Toggle group | single or multiple selection, horizontal or vertical | group label, pressed state and keyboard navigation |
| Tooltip | delayed or immediate | supplements a named trigger; never contains required interactive content |

## Contribution contract

1. Extend an existing component when the interaction and semantics match.
2. Add a shadcn/Radix primitive directly to `src/components/ui` when a genuinely new semantic control is required.
3. Consume tokens from `src/index.css`; do not create feature-local palettes, spacing scales, radii, shadows, or motion constants.
4. Define variants, sizes, default/hover/active/focus/disabled/error states, keyboard behavior, and screen-reader naming.
5. Test the real component and inspect light and dark themes.
6. Record a new system rule here, in `TASTE.md`, or in `GRID.md` according to whether it is an API contract, qualitative preference, or measurable constraint.

Owner-approved draft deviations do not alter this system. Adding or changing a token or component is a separate design-system change with its own review.
