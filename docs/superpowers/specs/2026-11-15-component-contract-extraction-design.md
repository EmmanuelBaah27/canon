# Component Contract Extraction Design

## Purpose

BYOL must reconstruct a connected component's public contract from committed source, then expose a curated, immediate preview configuration without executing repository code. The current Mande Input result demonstrates the failure mode: local CVA variants are available, but inherited properties behind `Omit<React.InputHTMLAttributes<...>>` are lost because the active extractor manually walks types with `noLib: true`.

## Architecture

One Extraction Service produces an immutable Extraction Artifact for every connected-component workflow. TypeScript resolves semantics; framework adapters and static syntax analysis attach design meaning. Public Contract extraction is complete and property-granular. Control Selection is deterministic and selective.

The service consumes only the approved commit, its minimal exact locked Declaration Closure, the BYOL-owned pinned compiler and standard library, connected design-system rules, and versioned framework/platform policies. It never executes repository scripts, plugins, configuration, decorators, proxies, or schema generators.

## Public contract

Property Evidence records type, origin, declaration provenance, default, Evidence State, Applicability Conditions, and transformation history. Verified sibling properties survive partial or unresolved branches. A component is blocked only when BYOL cannot identify the root export or props contract, cannot preserve artifact integrity, or cannot execute the preview safely.

The semantic resolver supports aliases, interfaces, intersections, mapped and conditional utility types, generic substitution, discriminated unions, overloads, re-exports, workspace aliases, and known transparent wrappers. Unknown HOCs and runtime-generated APIs require committed metadata or reviewed fixtures.

Generics require reviewed bindings. Polymorphic components branch on the rendered element. Overloads and discriminated unions remain conditional branches rather than flattened lists. Compound component parts receive separate related contracts. Conflicts degrade per property and retain every contributing declaration.

## Control selection

A property becomes a control only when it is safely mutable, deterministically serializable, preview-supported, meaningfully observable, and representable by an approved control. Domains remain Content, State, Appearance, Layout, and Behavior. Connected metadata may rename, order, hide, promote, constrain, or condition verified properties, but source type safety always wins.

Events become Interaction Observations. Slots, children, render props, and complex objects use fixtures or purpose-built structured editors. Styling escape hatches remain excluded unless committed design-system metadata exposes a constrained token-backed control. Token controls require verified binding evidence, not property-name inference.

Conditional controls appear and disappear immediately. Inactive values remain preserved in the draft but are omitted from preview props. Required eligible properties without defaults require a fixture or a small configuration step before rendering. Valid source state combinations constrain the UI.

## Responsiveness

Verified local controls appear progressively while inherited declarations resolve. Existing control meaning never changes silently. Dialkit changes update the isolated preview within the next animation frame; persistence is asynchronous and rolls back with a plain-language issue on failure.

Targets are: cached artifact under 100 ms, local explicit controls under 500 ms, warm transitive resolution under 2 seconds, and cold declaration work progressive rather than blocking verified local controls.

## Artifacts, trust, and change

Artifact identity includes repository, commit, export, source graph, declaration closure, lockfile, connected rules, compiler, adapter, platform profile, and extractor versions. Drafts store the identity plus a compact immutable contract snapshot. Kept versions never mutate. Temporary drafts update only through an explicit property-level contract diff.

Repository trust authorizes fetching only exact locked declarations for the approved fingerprint. Changed lockfiles or declaration closures enter the source-change review flow. Extractor upgrades advertise improved extraction but do not silently refresh saved drafts.

## Limits and diagnostics

Independent limits cover files, bytes, declarations, type depth, union and overload branches, generic instantiations, wall time, and concurrent background jobs. Local exhaustion creates a branch discrepancy; compromised root integrity blocks extraction. Selected work outranks warming and stale jobs are cancelled.

User copy remains plain. Technical details may show bounded property paths, declarations, unresolved types, versions, fingerprints, and budget names, but never credentials, absolute machine paths, raw stack traces, or unbounded source.

## Initial scope and release gate

The first production slice supports TypeScript React and React Native through versioned adapters. Release requires curated Mande Input, Button, Checkbox, Chip, and InputWithLabel contracts; partial missing-declaration behavior; conditional and required props; deterministic cache/source updates; adversarial budget compliance; immediate Dialkit response; and proof that extraction executes no repository code.
