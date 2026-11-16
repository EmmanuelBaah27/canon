# BYOL

BYOL connects a design system to a local component workbench so components can be inspected, configured, and revised from committed source.

## Component extraction

**Public Contract**:
Every safely resolved public property of a selected component, whether or not the property is exposed as an interactive preview control.
_Avoid_: Dialkit properties, extracted controls

**Property Evidence**:
The recorded type, origin, default, provenance, applicability, and confidence for one property in a public contract.
_Avoid_: Prop metadata, inferred control

**Evidence State**:
The confidence assigned to property evidence: verified, partial, or unresolved.
_Avoid_: Validity, extraction status

**Applicability Condition**:
A verified condition under which a property belongs to a component's active public contract.
_Avoid_: Visibility rule, UI condition

**Extraction Discrepancy**:
Unresolved or conflicting evidence for part of a public contract that does not invalidate independently verified sibling properties.
_Avoid_: Extraction failure, component failure

**Extraction Service**:
The single bounded process that resolves a component's public contract and property evidence from approved immutable sources.
_Avoid_: Prop parser, Dialkit extractor

**Declaration Closure**:
The smallest transitive set of approved type declarations required to resolve a selected component's public contract.
_Avoid_: Installed dependencies, repository types

**Extraction Artifact**:
An immutable, versioned record containing a public contract, discrepancies, control selection, provenance, and the complete identity of the evidence and software that produced them.
_Avoid_: Controls cache, parsed props

## Preview configuration

**Control Selection**:
The deterministic decision that turns eligible property evidence into an interactive preview control.
_Avoid_: Property extraction, control inference

**Control Domain**:
A stable user-facing grouping for preview controls: Content, State, Appearance, Layout, or Behavior.
_Avoid_: Properties, Advanced

**Platform Profile**:
A versioned framework-adapter policy that prioritizes useful inherited properties for a known platform primitive without changing its public contract.
_Avoid_: Component heuristic, native prop list

**Interaction Observation**:
A bounded record of an event emitted while a user interacts with the real preview; it is not a configurable property value.
_Avoid_: Event control, callback value
