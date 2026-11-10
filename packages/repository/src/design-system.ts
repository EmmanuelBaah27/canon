import {
  ApprovedDesignSystemSchema,
  DesignSystemManifestSchema,
  DesignSystemProposalSchema,
  type ApprovedDesignSystem,
  type DesignSystemCandidate,
  type DesignSystemManifest,
  type DesignSystemProposal,
  type RepositoryConnection,
} from '@byol/core';
import { getRepositorySource, readGit } from './connect';

type Role = DesignSystemCandidate['role'];
interface TreeEntry { mode: string; type: string; path: string }

const approvals = new Map<string, ApprovedDesignSystem>();
const defaultValidation = {
  hardcodedVisualValues: 'approval',
  sharedComponentBypass: 'approval',
  unknownBehavioralValues: 'notice',
} as const;

async function committedTree(root: string, commit: string): Promise<TreeEntry[]> {
  const output = await readGit(root, ['ls-tree', '-r', '-z', commit]);
  return output.split('\0').filter(Boolean).map((record) => {
    const match = /^(\d+) (blob|commit) [a-f0-9]+\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Invalid repository tree while discovering the design system');
    return { mode: match[1], type: match[2], path: match[3] };
  });
}

function regularBlobs(entries: TreeEntry[]): TreeEntry[] {
  return entries.filter((entry) => entry.type === 'blob' && entry.mode === '100644');
}

function roleEvidence(path: string): { roles: Role[]; evidence: string[] } {
  const lower = path.toLowerCase();
  const roles: Role[] = [];
  const evidence: string[] = [];
  if (/(^|\/)(tokens?|variables?|theme)([./_-]|$)/.test(lower) || /\.tokens?\.(css|[cm]?[jt]s)$/.test(lower)) {
    roles.push('tokens'); evidence.push('path name identifies design tokens or theme variables');
  }
  if (/(^|\/)components?\//.test(lower) && /\.[cm]?[jt]sx?$/.test(lower)) {
    roles.push('components'); evidence.push('typed UI source is located in a components directory');
  } else if (/component/.test(lower) && /\.[cm]?[jt]sx?$/.test(lower)) {
    roles.push('components'); evidence.push('source path identifies a component candidate');
  }
  if (/(^|\/)(design[_-]?system|contributing|styleguide|agents)\.md$/.test(lower) || /(^|\/)rules?\//.test(lower)) {
    roles.push('rules'); evidence.push('committed documentation path identifies design-system rules');
  }
  return { roles: [...new Set(roles)], evidence };
}

function pathExistsAsRegularSource(path: string, entries: TreeEntry[]): boolean {
  return entries.some((entry) => entry.path === path || entry.path.startsWith(`${path}/`));
}

function explicitCandidates(manifest: DesignSystemManifest): DesignSystemCandidate[] {
  return (['tokens', 'components', 'rules'] as const).flatMap((role) => manifest[role].map((path) => ({
    path, role, confidence: 'explicit' as const, evidence: ['declared in committed root byol.design-system.json'],
  })));
}

export async function discoverDesignSystem(connection: RepositoryConnection): Promise<DesignSystemProposal> {
  const source = await getRepositorySource(connection);
  const entries = await committedTree(source.root, source.commit);
  const blobs = regularBlobs(entries);
  const rootManifest = blobs.find((entry) => entry.path === 'byol.design-system.json');
  if (rootManifest) {
    let manifest: DesignSystemManifest;
    try {
      const text = await readGit(source.root, ['show', `${source.commit}:byol.design-system.json`]);
      manifest = DesignSystemManifestSchema.parse(JSON.parse(text));
    } catch {
      throw new Error('Committed design-system manifest is invalid');
    }
    const candidates = explicitCandidates(manifest);
    for (const candidate of candidates) {
      if (!pathExistsAsRegularSource(candidate.path, blobs)) {
        throw new Error(`Manifest path is not committed regular source: ${candidate.path}`);
      }
    }
    return DesignSystemProposalSchema.parse({
      repositoryId: connection.id, sourceCommit: source.commit, origin: 'manifest', manifest, candidates, ambiguities: [],
    });
  }

  const candidates: DesignSystemCandidate[] = [];
  const ambiguities: DesignSystemProposal['ambiguities'] = [];
  for (const entry of blobs) {
    const classification = roleEvidence(entry.path);
    if (classification.roles.length > 1) {
      ambiguities.push({ path: entry.path, roles: classification.roles, evidence: classification.evidence });
    } else if (classification.roles.length === 1) {
      candidates.push({
        path: entry.path,
        role: classification.roles[0],
        confidence: classification.roles[0] === 'components' ? 'high' : 'medium',
        evidence: classification.evidence,
      });
    }
  }
  const forRole = (role: Role) => candidates.filter((candidate) => candidate.role === role).map((candidate) => candidate.path);
  const manifest = DesignSystemManifestSchema.parse({
    $schema: 'https://byol.dev/schemas/design-system.v1.json', version: 1,
    tokens: forRole('tokens'), components: forRole('components'), rules: forRole('rules'), themes: [], validation: defaultValidation,
  });
  return DesignSystemProposalSchema.parse({
    repositoryId: connection.id, sourceCommit: source.commit, origin: 'inferred', manifest, candidates, ambiguities,
  });
}

export interface ApproveDesignSystemProposalInput {
  connection: RepositoryConnection;
  proposal: DesignSystemProposal;
  manifest: DesignSystemManifest;
}

export async function approveDesignSystemProposal(input: ApproveDesignSystemProposalInput): Promise<ApprovedDesignSystem> {
  const proposal = DesignSystemProposalSchema.parse(input.proposal);
  if (proposal.repositoryId !== input.connection.id) throw new Error('Proposal belongs to another repository');
  const source = await getRepositorySource(input.connection);
  const liveCommit = (await readGit(source.root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
  if (source.commit !== proposal.sourceCommit || liveCommit !== proposal.sourceCommit) {
    throw new Error('Design-system proposal is stale because the source commit changed');
  }
  const manifest = DesignSystemManifestSchema.parse(input.manifest);
  const entries = regularBlobs(await committedTree(source.root, proposal.sourceCommit));
  for (const path of [...manifest.tokens, ...manifest.components, ...manifest.rules]) {
    if (!pathExistsAsRegularSource(path, entries)) throw new Error(`Approved manifest path is not committed regular source: ${path}`);
  }
  const finalCommit = (await readGit(source.root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
  if (finalCommit !== proposal.sourceCommit) throw new Error('Design-system proposal became stale during approval');
  const approved = ApprovedDesignSystemSchema.parse({
    repositoryId: input.connection.id,
    sourceCommit: proposal.sourceCommit,
    manifest,
    approvedAt: new Date().toISOString(),
  });
  approvals.set(approved.repositoryId, approved);
  return ApprovedDesignSystemSchema.parse(approved);
}

export function getApprovedDesignSystem(repositoryId: string): ApprovedDesignSystem | undefined {
  const approved = approvals.get(repositoryId);
  return approved ? ApprovedDesignSystemSchema.parse(approved) : undefined;
}
