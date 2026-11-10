import type { ComponentManifest, Issue } from "@byol/core";
export interface PropertyEvidence {
  name: string;
  kind:
    | "boolean"
    | "enum"
    | "token"
    | "number"
    | "text"
    | "icon"
    | "slot"
    | "variant"
    | "state"
    | "breakpoint"
    | "motion"
    | "complex";
  options?: readonly string[];
  tokens?: readonly string[];
  category?: string;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
  internal?: boolean;
  derived?: boolean;
  invariant?: boolean;
  ambiguous?: boolean;
  structural?: boolean;
  advanced?: boolean;
}
export interface DerivedControl {
  id: string;
  label: string;
  control:
    | "switch"
    | "segmented"
    | "select"
    | "token"
    | "slider"
    | "number"
    | "text"
    | "icon"
    | "slot"
    | "variant"
    | "state"
    | "breakpoint";
  section: "properties" | "advanced";
  structural: boolean;
  options?: readonly string[];
  tokens?: readonly string[];
  category?: string;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
}
export function deriveControls(
  manifest: ComponentManifest,
  properties: readonly PropertyEvidence[] = [],
  visualBindings?: readonly { property: string; token: string }[],
  tokenIndex: readonly { category: string; token: string }[] = manifest.tokens,
) {
  const controls: DerivedControl[] = [];
  const issues: Issue[] = [];
  for (const property of properties) {
    if (
      property.internal ||
      property.derived ||
      property.invariant ||
      /^(ref|key|id|internalId|on[A-Z].*|aria.*)$/.test(property.name)
    )
      continue;
    if (property.ambiguous) {
      issues.push({
        id: `evidence:${manifest.id}:${property.name}`,
        type: "source-conflict",
        severity: "blocker",
        target: { kind: "property", id: property.name },
        message: `Ambiguous source evidence for ${property.name}; clarify the public contract before approval.`,
        resolutionActions: ["review-source"],
        createdAt: new Date().toISOString(),
      });
      continue;
    }
    let control: DerivedControl["control"] | undefined;
    if (property.tokens?.length) control = "token";
    else if (property.kind === "boolean") control = "switch";
    else if (property.kind === "enum" && property.options?.length)
      control = property.options.length <= 5 ? "segmented" : "select";
    else if (property.kind === "number")
      control =
        property.min !== undefined && property.max !== undefined
          ? "slider"
          : "number";
    else if (property.kind === "text") control = "text";
    else if (
      ["icon", "slot", "variant", "state", "breakpoint"].includes(
        property.kind,
      ) &&
      property.options?.length
    )
      control = property.kind as DerivedControl["control"];
    if (!control) continue;
    const structural = property.structural ?? property.kind === "slot";
    controls.push({
      id: property.name,
      label: property.name,
      control,
      section: structural || property.advanced ? "advanced" : "properties",
      structural,
      options: property.options,
      tokens: property.tokens,
      category: property.category,
      min: property.min,
      max: property.max,
      defaultValue:
        property.defaultValue ??
        (property.kind === "boolean" ? false : undefined),
    });
  }
  manifest.tokens.forEach((binding, index) => {
    if (
      visualBindings &&
      !visualBindings.some(
        (v) => v.property === binding.property && v.token === binding.token,
      )
    )
      return;
    controls.push({
      id: `token-binding:${index}`,
      label: binding.property,
      control: "token",
      section: binding.category === "motion" ? "advanced" : "properties",
      structural: false,
      tokens: [
        ...new Set(
          tokenIndex
            .filter((token) => token.category === binding.category)
            .map((token) => token.token),
        ),
      ],
      category: binding.category,
      defaultValue: binding.token,
    });
  });
  if (manifest.states.length)
    controls.push({
      id: "preview-state",
      label: "Preview state",
      control: "state",
      section: "properties",
      structural: false,
      options: ["default", ...manifest.states.map((s) => s.name)],
      defaultValue: "default",
    });
  return { controls, issues };
}
export { extractPublicProperties } from "./source-evidence";
