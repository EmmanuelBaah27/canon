export type EvidenceState = "verified" | "partial" | "unresolved";

export interface DeclarationEvidence {
  path: string;
  name: string;
  line: number;
  column: number;
}

export interface ApplicabilityCondition {
  property: string;
  operator: "equals" | "not-equals" | "includes" | "exists";
  value?: unknown;
}

export interface PropertyEvidenceV2 {
  id: string;
  name: string;
  type: string;
  origin: string;
  declarations: readonly DeclarationEvidence[];
  evidence: EvidenceState;
  required: boolean;
  defaultValue?: unknown;
  applicability?: readonly ApplicabilityCondition[];
  transformations?: readonly string[];
  discrepancies?: readonly string[];
}

export interface ContractBranch {
  id: string;
  label?: string;
  conditions?: readonly ApplicabilityCondition[];
  properties: readonly PropertyEvidenceV2[];
}

export interface PublicContract {
  branches: readonly ContractBranch[];
  discrepancies?: readonly string[];
}

export type ControlDomain =
  | "Content"
  | "State"
  | "Appearance"
  | "Layout"
  | "Behavior";

export interface SelectedControl {
  id: string;
  propertyId: string;
  domain: ControlDomain;
  kind: string;
  label?: string;
  order?: number;
}

export interface InteractionObservation {
  id: string;
  propertyId: string;
  event: string;
}

export interface ControlExclusion {
  propertyId: string;
  reason: string;
}

export interface FixtureRequirement {
  propertyId: string;
  required: boolean;
  reason: string;
}

export interface StateConstraint {
  id: string;
  conditions: readonly ApplicabilityCondition[];
}

export interface ControlSelection {
  controls: readonly SelectedControl[];
  observations: readonly InteractionObservation[];
  exclusions: readonly ControlExclusion[];
  fixtureRequirements: readonly FixtureRequirement[];
  stateConstraints: readonly StateConstraint[];
}

export interface ExtractionArtifactIdentity {
  repository: string;
  commit: string;
  export: string;
  sourceGraph: string;
  declarationClosure: string;
  lockfile: string;
  connectedRules: string;
  compiler: string;
  adapter: string;
  platformProfile: string;
  extractor: string;
}

export interface ExtractionArtifact {
  identity: ExtractionArtifactIdentity;
  publicContract: PublicContract;
  controlSelection: ControlSelection;
}
