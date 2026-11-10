import { describe, expect, it } from 'vitest';
import {
  ComponentManifestSchema,
  ApprovedDesignSystemSchema,
  DesignSystemProposalSchema,
  DraftSchema,
  IntegrationApprovalSchema,
  IssueSchema,
  PreviewOverrideSchema,
  RepositoryConnectionSchema,
  type ComponentManifest,
  type Draft,
  type IntegrationApproval,
  type Issue,
  type PreviewOverride,
  type RepositoryConnection,
} from './index';

const designSystemManifest = {
  $schema: 'https://byol.dev/schemas/design-system.v1.json' as const,
  version: 1 as const,
  tokens: ['src/tokens.css'], components: ['src/components'], rules: ['DESIGN_SYSTEM.md'], themes: ['light'],
  validation: { hardcodedVisualValues: 'approval' as const, sharedComponentBypass: 'approval' as const, unknownBehavioralValues: 'notice' as const },
};

describe('connected design-system contracts', () => {
  it('binds proposals and approvals to repository identity and source commit', () => {
    const proposal = {
      repositoryId: 'mande', sourceCommit: 'a'.repeat(40), origin: 'manifest' as const,
      manifest: designSystemManifest,
      candidates: [{ path: 'src/tokens.css', role: 'tokens' as const, confidence: 'explicit' as const, evidence: ['declared by manifest'] }],
      ambiguities: [],
    };
    expect(DesignSystemProposalSchema.parse(proposal)).toEqual(proposal);
    expect(ApprovedDesignSystemSchema.parse({
      repositoryId: proposal.repositoryId, sourceCommit: proposal.sourceCommit, manifest: designSystemManifest, approvedAt: '2026-11-10T05:00:00.000Z',
    }).sourceCommit).toBe(proposal.sourceCommit);
  });

  it('rejects proposals with pathless evidence or unbound commits', () => {
    const proposal = {
      repositoryId: 'mande', sourceCommit: 'not-a-commit', origin: 'inferred', manifest: designSystemManifest,
      candidates: [{ path: 'src/tokens.css', role: 'tokens', confidence: 'high', evidence: [] }], ambiguities: [],
    };
    expect(DesignSystemProposalSchema.safeParse(proposal).success).toBe(false);
  });
});

const createdAt = '2026-11-10T05:00:00.000Z';
const localRepository: RepositoryConnection = {
  id: 'mande',
  name: 'Mande',
  kind: 'local',
  defaultBranch: 'main',
  createdAt,
  path: '/workspace/mande',
};

describe('repository connection contract', () => {
  it('accepts a local connection with its source path and identity metadata', () => {
    expect(RepositoryConnectionSchema.parse(localRepository)).toEqual(localRepository);
  });
});

const githubRepository: RepositoryConnection = {
  id: 'mande-github',
  name: 'Mande',
  kind: 'github',
  defaultBranch: 'main',
  createdAt,
  url: 'https://github.com/example/mande',
  owner: 'example',
  repository: 'mande',
};

describe('repository metadata boundaries', () => {
  it('accepts the GitHub metadata without local path fields', () => {
    expect(RepositoryConnectionSchema.parse(githubRepository)).toEqual(githubRepository);
  });

  it.each(['id', 'name', 'defaultBranch', 'createdAt', 'path'])('requires local %s', (field) => {
    const input: Record<string, unknown> = { ...localRepository };
    delete input[field];
    expect(RepositoryConnectionSchema.safeParse(input).success).toBe(false);
  });

  it.each(['url', 'owner', 'repository'])('requires GitHub %s', (field) => {
    const input: Record<string, unknown> = { ...githubRepository };
    delete input[field];
    expect(RepositoryConnectionSchema.safeParse(input).success).toBe(false);
  });

  it.each(['token', 'password', 'sshKey', 'credentials', 'accessToken'])('rejects a %s field rather than stripping it', (field) => {
    for (const connection of [localRepository, githubRepository]) {
      expect(RepositoryConnectionSchema.safeParse({ ...connection, [field]: 'secret' }).success).toBe(false);
    }
  });

  it('rejects cross-kind connection fields', () => {
    expect(RepositoryConnectionSchema.safeParse({ ...localRepository, url: githubRepository.url }).success).toBe(false);
    expect(RepositoryConnectionSchema.safeParse({ ...githubRepository, path: localRepository.path }).success).toBe(false);
  });

  it('preserves an exact local path instead of normalizing it', () => {
    const input = { ...localRepository, path: '/workspace/mande ' };
    expect(RepositoryConnectionSchema.parse(input)).toMatchObject({ path: '/workspace/mande ' });
  });

  it.each(['', '   '])('rejects empty identity and paths (%j)', (value) => {
    expect(RepositoryConnectionSchema.safeParse({ ...localRepository, id: value }).success).toBe(false);
    expect(RepositoryConnectionSchema.safeParse({ ...localRepository, path: value }).success).toBe(false);
  });

  it('requires an ISO datetime', () => {
    expect(RepositoryConnectionSchema.safeParse({ ...localRepository, createdAt: 'yesterday' }).success).toBe(false);
  });

  it.each([
    'https://secret@github.com/example/mande',
    'https://user:secret@github.com/example/mande',
  ])('rejects credential-bearing URL %s', (url) => {
    expect(RepositoryConnectionSchema.safeParse({ ...githubRepository, url }).success).toBe(false);
  });
});

it.each(['not a URL', 'https://github.com/example/mande?access_token=secret', 'https://github.com/example/mande#secret'])('rejects malformed or noncanonical repository URL %s without throwing', (url) => {
  expect(RepositoryConnectionSchema.safeParse({ ...githubRepository, url }).success).toBe(false);
});

const componentManifest: ComponentManifest = {
  schemaVersion: 1,
  id: 'mande-checkbox',
  repositoryId: 'mande',
  name: 'Checkbox',
  source: {
    path: 'src/components/Checkbox.tsx',
    commit: '9a97eb24a9d4c74c082a3f8ba452a1ba77281a00',
    exportName: 'Checkbox',
  },
  tokens: [{ property: 'color', category: 'color', token: 'var(--mande-color-text)' }],
  states: [{ name: 'disabled', evidence: ['src/components/Checkbox.test.tsx'] }],
  dependencies: [{ specifier: './Label', path: 'src/components/Label.tsx' }, { specifier: 'react' }],
  assets: [{ path: 'src/icons/check.svg', type: 'image/svg+xml' }],
};

describe('component source contract', () => {
  it('retains the pinned source and exact token and state evidence', () => {
    expect(ComponentManifestSchema.parse(componentManifest)).toEqual(componentManifest);
  });

  it.each(['path', 'commit', 'exportName'])('requires source %s', (field) => {
    const source: Record<string, unknown> = { ...componentManifest.source };
    delete source[field];
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, source }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, source: { ...source, [field]: '' } }).success).toBe(false);
  });

  it.each(['property', 'category', 'token'])('requires token %s', (field) => {
    const binding: Record<string, unknown> = { ...componentManifest.tokens[0] };
    delete binding[field];
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, tokens: [binding] }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, tokens: [{ ...binding, [field]: '' }] }).success).toBe(false);
  });

  it.each(['name', 'evidence'])('requires state %s', (field) => {
    const state: Record<string, unknown> = { ...componentManifest.states[0] };
    delete state[field];
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, states: [state] }).success).toBe(false);
  });

  it('rejects blank state names and evidence paths', () => {
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, states: [{ name: '', evidence: ['test.tsx'] }] }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, states: [{ name: 'focus', evidence: [''] }] }).success).toBe(false);
  });

  it.each(['tokens', 'states', 'dependencies', 'assets'])('requires the %s collection even when empty', (field) => {
    const input: Record<string, unknown> = { ...componentManifest };
    delete input[field];
    expect(ComponentManifestSchema.safeParse(input).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, [field]: [] }).success).toBe(true);
  });

  it('requires the current schema version', () => {
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, schemaVersion: 2 }).success).toBe(false);
  });

  it('rejects credential fields in source and nested metadata', () => {
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, source: { ...componentManifest.source, token: 'secret' } }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, tokens: [{ ...componentManifest.tokens[0], password: 'secret' }] }).success).toBe(false);
  });

  it('requires dependency specifiers and asset paths and types', () => {
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, dependencies: [{}] }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, dependencies: [{ specifier: 'react', path: '' }] }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, assets: [{ path: 'check.svg' }] }).success).toBe(false);
    expect(ComponentManifestSchema.safeParse({ ...componentManifest, assets: [{ path: '', type: 'svg' }] }).success).toBe(false);
  });
});

const draft: Draft = {
  id: 'draft-checkbox',
  componentManifestId: 'mande-checkbox',
  sourceCommit: '9a97eb24a9d4c74c082a3f8ba452a1ba77281a00',
  status: 'temporary',
  revision: 1,
  createdAt,
  updatedAt: createdAt,
};

const previewOverride: PreviewOverride = {
  id: 'override-color',
  draftId: 'draft-checkbox',
  target: 'color',
  category: 'color',
  sourceToken: 'var(--mande-color-text)',
  value: '#123456',
  createdAt,
};

describe('draft and preview contracts', () => {
  it.each(['temporary', 'kept'])('accepts a %s draft pinned to a manifest and commit', (status) => {
    expect(DraftSchema.parse({ ...draft, status })).toEqual({ ...draft, status });
  });

  it.each(['id', 'componentManifestId', 'sourceCommit', 'status', 'revision', 'createdAt', 'updatedAt'])('requires draft %s', (field) => {
    const input: Record<string, unknown> = { ...draft };
    delete input[field];
    expect(DraftSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an unrecognized persistence state', () => {
    expect(DraftSchema.safeParse({ ...draft, status: 'integrated' }).success).toBe(false);
  });

  it.each([-1, 0.5, NaN, Infinity])('rejects invalid revision %s', (revision) => {
    expect(DraftSchema.safeParse({ ...draft, revision }).success).toBe(false);
  });

  it('allows a zero revision before the first change', () => {
    expect(DraftSchema.safeParse({ ...draft, revision: 0 }).success).toBe(true);
  });

  it('keeps preview values separate from the source token', () => {
    expect(PreviewOverrideSchema.parse(previewOverride)).toEqual(previewOverride);
  });

  it('allows a preview override without a source token for a system gap', () => {
    const { sourceToken: _, ...input } = previewOverride;
    expect(PreviewOverrideSchema.parse(input)).toEqual(input);
  });

  it.each([false, 0, '', null, { duration: 100, easing: 'linear' }, ['small', 'large']].map((value) => [value]))('retains a preview value of %j', (value) => {
    expect(PreviewOverrideSchema.parse({ ...previewOverride, value }).value).toEqual(value);
  });

  it.each(['id', 'draftId', 'target', 'category', 'value', 'createdAt'])('requires override %s', (field) => {
    const input: Record<string, unknown> = { ...previewOverride };
    delete input[field];
    expect(PreviewOverrideSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an empty optional source token', () => {
    expect(PreviewOverrideSchema.safeParse({ ...previewOverride, sourceToken: '' }).success).toBe(false);
  });

  it('rejects credential metadata on drafts and overrides', () => {
    expect(DraftSchema.safeParse({ ...draft, accessToken: 'secret' }).success).toBe(false);
    expect(PreviewOverrideSchema.safeParse({ ...previewOverride, password: 'secret' }).success).toBe(false);
  });
});

const issue: Issue = {
  id: 'issue-color',
  draftId: 'draft-checkbox',
  type: 'override',
  severity: 'warning',
  target: { kind: 'token', id: 'color', state: 'disabled' },
  message: 'Preview color differs from the source token.',
  resolutionActions: ['revert', 'replace-with-existing-token'],
  createdAt,
};

const approval: IntegrationApproval = {
  id: 'approval-checkbox',
  draftId: 'draft-checkbox',
  draftRevision: 1,
  sourceCommit: '9a97eb24a9d4c74c082a3f8ba452a1ba77281a00',
  destinationRepositoryId: 'mande',
  approvedAt: createdAt,
};

describe('unified issue contract', () => {
  it.each(['override', 'token-gap', 'source-conflict', 'validation', 'dependency', 'source-update', 'information'])('uses the same fields for %s issues', (type) => {
    expect(IssueSchema.parse({ ...issue, type })).toEqual({ ...issue, type });
  });

  it.each(['information', 'warning', 'blocker'])('retains %s severity independently of the issue type', (severity) => {
    expect(IssueSchema.parse({ ...issue, severity }).severity).toBe(severity);
  });

  it.each(['id', 'type', 'severity', 'target', 'message', 'resolutionActions', 'createdAt'])('requires issue %s', (field) => {
    const input: Record<string, unknown> = { ...issue };
    delete input[field];
    expect(IssueSchema.safeParse(input).success).toBe(false);
  });

  it.each(['kind', 'id'])('requires target %s', (field) => {
    const target: Record<string, unknown> = { ...issue.target };
    delete target[field];
    expect(IssueSchema.safeParse({ ...issue, target }).success).toBe(false);
  });

  it('allows repository information outside a draft and without a state or action', () => {
    const { draftId: _, ...repositoryIssue } = issue;
    const input = { ...repositoryIssue, type: 'information', target: { kind: 'repository', id: 'mande' }, resolutionActions: [] };
    expect(IssueSchema.parse(input)).toEqual(input);
  });

  it('rejects unknown categories and severities', () => {
    expect(IssueSchema.safeParse({ ...issue, type: 'other' }).success).toBe(false);
    expect(IssueSchema.safeParse({ ...issue, severity: 'critical' }).success).toBe(false);
  });

  it('rejects blank resolution actions or optional state metadata', () => {
    expect(IssueSchema.safeParse({ ...issue, resolutionActions: [''] }).success).toBe(false);
    expect(IssueSchema.safeParse({ ...issue, target: { ...issue.target, state: '' } }).success).toBe(false);
  });

  it('rejects unknown issue and target fields', () => {
    expect(IssueSchema.safeParse({ ...issue, password: 'secret' }).success).toBe(false);
    expect(IssueSchema.safeParse({ ...issue, target: { ...issue.target, token: 'secret' } }).success).toBe(false);
  });
});

describe('integration approval contract', () => {
  it('records the approved draft revision, source commit, destination and timestamp', () => {
    expect(IntegrationApprovalSchema.parse(approval)).toEqual(approval);
  });

  it.each(['id', 'draftId', 'draftRevision', 'sourceCommit', 'destinationRepositoryId', 'approvedAt'])('requires approval %s', (field) => {
    const input: Record<string, unknown> = { ...approval };
    delete input[field];
    expect(IntegrationApprovalSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid approval revisions and empty source commits or destinations', () => {
    expect(IntegrationApprovalSchema.safeParse({ ...approval, draftRevision: -1 }).success).toBe(false);
    expect(IntegrationApprovalSchema.safeParse({ ...approval, draftRevision: 0.5 }).success).toBe(false);
    expect(IntegrationApprovalSchema.safeParse({ ...approval, sourceCommit: '' }).success).toBe(false);
    expect(IntegrationApprovalSchema.safeParse({ ...approval, destinationRepositoryId: '' }).success).toBe(false);
  });

  it('requires an ISO approval time', () => {
    expect(IntegrationApprovalSchema.safeParse({ ...approval, approvedAt: 'today' }).success).toBe(false);
  });

  it('rejects stored credentials alongside approval metadata', () => {
    expect(IntegrationApprovalSchema.safeParse({ ...approval, credentials: { token: 'secret' } }).success).toBe(false);
  });
});
it('accepts candidate-scoped issues only with a draft identity and a valid revision', () => {
  const issue = { id: 'verification:candidate', draftId: 'draft', draftRevision: 2, type: 'validation', severity: 'blocker', target: { kind: 'draft', id: 'draft' }, message: 'Candidate failed', resolutionActions: ['retry-verification'], createdAt };
  expect(IssueSchema.parse(issue)).toEqual(issue);
  const { draftId: _draftId, ...missingDraft } = issue;
  expect(IssueSchema.safeParse(missingDraft).success).toBe(false);
  expect(IssueSchema.safeParse({ ...issue, draftRevision: -1 }).success).toBe(false);
});
