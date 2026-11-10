import { z } from 'zod';

const Timestamp = z.iso.datetime({ offset: true });
const RepositoryPath = z.string().trim().min(1).refine((path) => {
  if (path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  return !path.split('/').some((segment) => segment === '..' || segment === '');
}, 'Must be a normalized repository-relative path');

const uniquePaths = z.array(RepositoryPath).refine(
  (paths) => new Set(paths).size === paths.length,
  'Paths must not be duplicated',
);

const ValidationMode = z.enum(['approval', 'notice', 'ignore']);

export const DesignSystemManifestSchema = z.strictObject({
  $schema: z.literal('https://byol.dev/schemas/design-system.v1.json'),
  version: z.literal(1),
  tokens: uniquePaths,
  components: uniquePaths,
  rules: uniquePaths,
  themes: z.array(z.string().trim().min(1)).refine(
    (themes) => new Set(themes).size === themes.length,
    'Themes must not be duplicated',
  ),
  validation: z.strictObject({
    hardcodedVisualValues: ValidationMode,
    sharedComponentBypass: ValidationMode,
    unknownBehavioralValues: ValidationMode,
  }),
}).superRefine((manifest, context) => {
  const evidence = [...manifest.tokens, ...manifest.components, ...manifest.rules];
  if (new Set(evidence).size !== evidence.length) {
    context.addIssue({
      code: 'custom',
      message: 'A source path may have only one design-system role',
    });
  }
});

export type DesignSystemManifest = z.infer<typeof DesignSystemManifestSchema>;

export const DesignSystemCandidateSchema = z.strictObject({
  path: RepositoryPath,
  role: z.enum(['tokens', 'components', 'rules']),
  confidence: z.enum(['explicit', 'high', 'medium', 'low']),
  evidence: z.array(z.string().trim().min(1)).min(1),
});

export const DesignSystemAmbiguitySchema = z.strictObject({
  path: RepositoryPath,
  roles: z.array(z.enum(['tokens', 'components', 'rules'])).min(2),
  evidence: z.array(z.string().trim().min(1)).min(1),
});

export const DesignSystemProposalSchema = z.strictObject({
  repositoryId: z.string().trim().min(1),
  sourceCommit: z.string().regex(/^[a-f0-9]{40,64}$/),
  origin: z.enum(['manifest', 'inferred']),
  manifest: DesignSystemManifestSchema,
  candidates: z.array(DesignSystemCandidateSchema),
  ambiguities: z.array(DesignSystemAmbiguitySchema),
});

export const ApprovedDesignSystemSchema = z.strictObject({
  repositoryId: z.string().trim().min(1),
  sourceCommit: z.string().regex(/^[a-f0-9]{40,64}$/),
  manifest: DesignSystemManifestSchema,
  approvedAt: Timestamp,
});

export type DesignSystemCandidate = z.infer<typeof DesignSystemCandidateSchema>;
export type DesignSystemAmbiguity = z.infer<typeof DesignSystemAmbiguitySchema>;
export type DesignSystemProposal = z.infer<typeof DesignSystemProposalSchema>;
export type ApprovedDesignSystem = z.infer<typeof ApprovedDesignSystemSchema>;

const RequiredString = z.string().refine((value) => value.trim().length > 0, 'Must not be empty');
const RepositoryUrl = z.url().refine((value) => {
  const url = URL.parse(value);
  return url !== null && !url.username && !url.password && !url.search && !url.hash;
}, 'Repository URLs must not contain credentials, queries, or fragments');
const repositoryMetadata = {
  id: RequiredString,
  name: RequiredString,
  defaultBranch: RequiredString,
  createdAt: Timestamp,
};

export const RepositoryConnectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...repositoryMetadata,
    kind: z.literal('local'),
    path: RequiredString,
  }),
  z.strictObject({
    ...repositoryMetadata,
    kind: z.literal('github'),
    url: RepositoryUrl,
    owner: RequiredString,
    repository: RequiredString,
  }),
]);

export type RepositoryConnection = z.infer<typeof RepositoryConnectionSchema>;

const TokenBindingSchema = z.strictObject({
  property: RequiredString,
  category: RequiredString,
  token: RequiredString,
});

const ComponentStateSchema = z.strictObject({
  name: RequiredString,
  evidence: z.array(RequiredString),
});

const DependencyRefSchema = z.strictObject({
  specifier: RequiredString,
  path: RequiredString.optional(),
});

const AssetRefSchema = z.strictObject({
  path: RequiredString,
  type: RequiredString,
});

export const ComponentManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: RequiredString,
  repositoryId: RequiredString,
  name: RequiredString,
  source: z.strictObject({
    path: RequiredString,
    commit: RequiredString,
    exportName: RequiredString,
  }),
  tokens: z.array(TokenBindingSchema),
  states: z.array(ComponentStateSchema),
  dependencies: z.array(DependencyRefSchema),
  assets: z.array(AssetRefSchema),
});

export type ComponentManifest = z.infer<typeof ComponentManifestSchema>;

const Revision = z.number().int().nonnegative();

export const DraftSchema = z.strictObject({
  id: RequiredString,
  componentManifestId: RequiredString,
  sourceCommit: RequiredString,
  status: z.enum(['temporary', 'kept']),
  revision: Revision,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

export const PreviewOverrideSchema = z.strictObject({
  id: RequiredString,
  draftId: RequiredString,
  target: RequiredString,
  category: RequiredString,
  sourceToken: RequiredString.optional(),
  value: z.unknown(),
  createdAt: Timestamp,
});

export type Draft = z.infer<typeof DraftSchema>;
export type PreviewOverride = z.infer<typeof PreviewOverrideSchema>;

export const IssueSchema = z.strictObject({
  id: RequiredString,
  draftId: RequiredString.optional(),
  draftRevision: Revision.optional(),
  type: z.enum([
    'override',
    'token-gap',
    'source-conflict',
    'validation',
    'dependency',
    'source-update',
    'information',
  ]),
  severity: z.enum(['information', 'warning', 'blocker']),
  target: z.strictObject({
    kind: RequiredString,
    id: RequiredString,
    state: RequiredString.optional(),
  }),
  message: RequiredString,
  resolutionActions: z.array(RequiredString),
  createdAt: Timestamp,
}).refine((issue) => issue.draftRevision === undefined || issue.draftId !== undefined, { message: 'Revision-scoped issues require a draft identity' });

export const IntegrationApprovalSchema = z.strictObject({
  id: RequiredString,
  draftId: RequiredString,
  draftRevision: Revision,
  sourceCommit: RequiredString,
  destinationRepositoryId: RequiredString,
  approvedAt: Timestamp,
});

export type Issue = z.infer<typeof IssueSchema>;
export type IntegrationApproval = z.infer<typeof IntegrationApprovalSchema>;
