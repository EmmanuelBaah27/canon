import { describe, expect, it } from 'vitest';
import { artifactKey, createExtractionArtifact } from './artifact';
import type { ExtractionArtifact, ExtractionArtifactIdentity } from './types';

const identity: ExtractionArtifactIdentity = {
  repository: 'repo', commit: 'commit', export: 'Input', sourceGraph: 'source',
  declarationClosure: 'closure', lockfile: 'lock', connectedRules: 'rules',
  compiler: 'compiler', adapter: 'adapter', platformProfile: 'platform', extractor: 'extractor',
};
const artifact: ExtractionArtifact = {
  identity,
  publicContract: { branches: [{ id: 'root', properties: [{ id: 'value', name: 'value', type: 'string', origin: 'source', declarations: [{ path: 'src/input.tsx', name: 'value', line: 4, column: 3 }], evidence: 'verified', required: false, transformations: ['Omit'] }] }] },
  controlSelection: { controls: [], observations: [], exclusions: [], fixtureRequirements: [], stateConstraints: [] },
};

describe('extraction artifacts', () => {
  it('hashes equivalent identities independent of key insertion order', () => {
    const reversed = Object.fromEntries(Object.entries(identity).reverse()) as unknown as ExtractionArtifactIdentity;
    expect(artifactKey(reversed)).toBe(artifactKey(identity));
    expect(artifactKey(identity)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('changes the key for every semantic identity input', () => {
    for (const key of Object.keys(identity) as (keyof ExtractionArtifactIdentity)[]) {
      expect(artifactKey({ ...identity, [key]: `${identity[key]}-changed` })).not.toBe(artifactKey(identity));
    }
  });
  it('snapshots property provenance without retaining mutable input references', () => {
    const result = createExtractionArtifact(artifact);
    expect(result.publicContract.branches[0].properties[0].declarations).toEqual([{ path: 'src/input.tsx', name: 'value', line: 4, column: 3 }]);
    expect(result.publicContract.branches[0].properties[0].transformations).toEqual(['Omit']);
    expect(result.publicContract.branches[0].properties[0]).not.toBe(artifact.publicContract.branches[0].properties[0]);
    expect(Object.isFrozen(result.publicContract.branches[0].properties[0].declarations)).toBe(true);
  });
  it('rejects duplicate property IDs within a branch while allowing them across branches', () => {
    const branch = artifact.publicContract.branches[0];
    expect(() => createExtractionArtifact({ ...artifact, publicContract: { branches: [{ ...branch, properties: [branch.properties[0], branch.properties[0]] }] } })).toThrow(/duplicate.*value/i);
    expect(() => createExtractionArtifact({ ...artifact, publicContract: { branches: [branch, { ...branch, id: 'other' }] } })).not.toThrow();
  });
});
