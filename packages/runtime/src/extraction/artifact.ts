import { createHash } from "node:crypto";
import type {
  ExtractionArtifact,
  ExtractionArtifactIdentity,
} from "./types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) freezeDeep(entry);
  }
  return value;
}

export function artifactKey(identity: ExtractionArtifactIdentity): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(identity)))
    .digest("hex");
}

export function createExtractionArtifact(
  input: ExtractionArtifact,
): Readonly<ExtractionArtifact> {
  for (const branch of input.publicContract.branches) {
    const ids = new Set<string>();
    for (const property of branch.properties) {
      if (ids.has(property.id)) {
        throw new Error(
          `Duplicate property ID ${property.id} in branch ${branch.id}`,
        );
      }
      ids.add(property.id);
    }
  }

  return freezeDeep(structuredClone(input));
}
