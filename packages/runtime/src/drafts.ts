import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { ComponentManifestSchema, DraftApprovalSchema, DraftSchema, IssueSchema, PreviewOverrideSchema, type ComponentManifest, type DesignFinding, type Draft, type DraftApproval, type Issue, type PreviewOverride } from '@byol/core';
import { ApprovalService, approvalResolves } from './approvals';
import { IssueService } from './issues';
import { auditTokens, type SystemToken } from './token-audit';

export interface DraftServiceOptions {
  projectRoot: string;
  sessionId: string;
  tokenIndex?: readonly SystemToken[];
}

export interface OverrideInput {
  /** Use tokenBindingTarget(index) for a binding; property names must match uniquely. */
  target: string;
  category: string;
  value: unknown;
}

export type OverrideResolution =
  | { action: 'revert' }
  | { action: 'replace-with-existing-token'; token: string }
  | { action: 'propose-token' };

interface StoredDraft {
  draft: Draft;
  sourceManifest: ComponentManifest;
  canonicalManifest: ComponentManifest;
  overrides: PreviewOverride[];
  proposals: string[];
  previewValues?: Record<string, unknown>;
  savedIssues?: Issue[];
  approvals?: DraftApproval[];
}

/** Binding order is stable for a draft; canonical resolutions only edit or append bindings. */
export function tokenBindingTarget(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid token binding index');
  return `token-binding:${index}`;
}

function selectBinding(manifest: ComponentManifest, target: string, category: string) {
  if (target.startsWith('token-binding:')) {
    const match = /^token-binding:(0|[1-9]\d*)$/.exec(target);
    const index = match ? Number(match[1]) : -1;
    const binding = manifest.tokens[index];
    if (!Number.isSafeInteger(index) || !binding || binding.category !== category) {
      throw new Error('Unknown token binding selector or mismatched category');
    }
    return { target, binding };
  }
  const matches = manifest.tokens.flatMap((binding, index) =>
    binding.property === target && binding.category === category ? [{ binding, index }] : []);
  if (matches.length > 1) throw new Error('Ambiguous token target; use tokenBindingTarget(index)');
  return matches[0]
    ? { target: tokenBindingTarget(matches[0].index), binding: matches[0].binding }
    : { target, binding: undefined };
}

/** Restrict preview values to data that JSON preserves without coercion or omission. */
function assertJsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return;
  if (typeof value !== 'object' || value === null) throw new Error('Override value must be JSON-safe');
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
    throw new Error('Override JSON values must use plain objects and arrays');
  }
  if (ancestors.has(value)) throw new Error('Override JSON values must not contain cycles');
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) throw new Error('Override JSON arrays must be dense without extra properties');
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
      throw new Error('Override JSON values must not contain symbol keys or extra array properties');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Override JSON values must use enumerable data properties');
    }
    assertJsonValue(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

function captureOverrideInput(input: OverrideInput): OverrideInput {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const fields = ['target', 'category', 'value'];
  if (Reflect.ownKeys(descriptors).length !== fields.length
    || Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !fields.includes(key))) {
    throw new Error('Override input requires only target, category, and value data properties');
  }
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Override input must use enumerable data properties, without accessors');
    }
  }
  const captured = { target: descriptors.target.value, category: descriptors.category.value, value: descriptors.value.value };
  if (typeof captured.target !== 'string' || typeof captured.category !== 'string') {
    throw new Error('Override target and category must be strings');
  }
  assertJsonValue(captured.value);
  return structuredClone({ target: captured.target, category: captured.category, value: captured.value });
}

/** Single local-session writer. Temporary state is recovery data, never kept storage. */
export class DraftService {
  readonly issues = new IssueService();
  private readonly entries = new Map<string, StoredDraft>();
  private readonly generatedIssues = new Map<string, Set<string>>();
  private closed = false;
  private pending: Promise<unknown> = Promise.resolve();
  private readonly keptRoot: string;
  private readonly sessionRoot: string;
  private readonly tokenIndex?: readonly SystemToken[];
  private readonly projectRoot: string;

  private constructor(options: DraftServiceOptions) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.sessionId)) throw new Error('Invalid session ID');
    this.projectRoot = options.projectRoot;
    this.keptRoot = join(options.projectRoot, '.byol/drafts');
    this.sessionRoot = join(options.projectRoot, '.byol/cache/sessions', options.sessionId);
    this.tokenIndex = options.tokenIndex === undefined ? undefined : structuredClone(options.tokenIndex);
  }

  static async open(options: DraftServiceOptions): Promise<DraftService> {
    const service = new DraftService({ ...options, projectRoot: await realpath(options.projectRoot) });
    await service.ensureDirectory(service.keptRoot);
    await service.ensureDirectory(service.sessionRoot);
    for (const id of await readdir(service.keptRoot)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
      await service.ensureDirectory(join(service.keptRoot, id));
      const revisions = (await readdir(join(service.keptRoot, id)))
        .filter((name) => /^\d+\.json$/.test(name))
        .sort((a, b) => Number.parseInt(b) - Number.parseInt(a));
      if (revisions[0]) await service.load(join(service.keptRoot, id, revisions[0]), 'kept', id);
    }
    for (const file of await readdir(service.sessionRoot)) {
      if (!/^[a-zA-Z0-9_-]+\.json$/.test(file)) continue;
      const id = file.slice(0, -5);
      // An interrupted keep may leave recovery data; kept state always wins.
      if (!service.entries.has(id)) await service.load(join(service.sessionRoot, file), 'temporary', id);
    }
    return service;
  }

  getDraft(id: string): Draft { return structuredClone(this.entry(id).draft); }
  getSourceManifest(id: string): ComponentManifest { return structuredClone(this.entry(id).sourceManifest); }
  getCanonicalManifest(id: string): ComponentManifest { return structuredClone(this.entry(id).canonicalManifest); }
  getOverrides(id: string): PreviewOverride[] { return structuredClone(this.entry(id).overrides); }
  getApprovals(id: string): DraftApproval[] { return structuredClone(this.entry(id).approvals ?? []); }
  approveFinding(id: string, finding: DesignFinding, approver: string, rationale: string): Promise<DraftApproval> {
    return this.run(async () => {
      const entry = structuredClone(this.entry(id));
      if (finding.draftId !== id || finding.draftRevision !== entry.draft.revision) throw new Error('Finding is stale for this draft revision');
      const service = new ApprovalService();
      const approval = service.approve({ finding, approver, rationale });
      entry.approvals = [...(entry.approvals ?? []).filter((item) => item.id !== approval.id), approval];
      await this.save(entry);
      return structuredClone(approval);
    });
  }
  isFindingApproved(id: string, finding: DesignFinding): boolean {
    return (this.entry(id).approvals ?? []).some((approval) => approvalResolves(approval, finding));
  }
  getPreviewValues(id: string): Record<string, unknown> {
    return structuredClone(this.entry(id).previewValues ?? {});
  }
  setPreviewValue(id: string, target: string, value: unknown): Promise<void> {
    if (!target || ["__proto__", "constructor", "prototype"].includes(target))
      throw new Error("Invalid preview target");
    assertJsonValue(value);
    const captured = structuredClone(value);
    return this.run(async () => {
      const entry = structuredClone(this.entry(id));
      entry.previewValues = { ...entry.previewValues, [target]: captured };
      this.revise(entry);
      await this.save(entry);
    });
  }
  listDrafts(): Draft[] { return [...this.entries.values()].map((entry) => structuredClone(entry.draft)); }

  isIntegrationReady(id: string): boolean {
    const entry = this.entry(id);
    return entry.overrides.length === 0
      && auditTokens(entry.canonicalManifest, this.approvedTokens(entry)).length === 0
      && this.issues.list({ draftId: id, severity: 'blocker' }).length === 0;
  }

  /** Durable failures belong to an exact candidate; transient source checks are rederived. */
  async recordRevisionIssue(input: Issue): Promise<void> {
    const issue = IssueSchema.parse(structuredClone(input));
    return this.run(async () => {
      if (!issue.draftId || issue.draftRevision === undefined) throw new Error('Durable issues require an exact draft revision scope');
      const entry = structuredClone(this.entry(issue.draftId));
      if (entry.draft.revision !== issue.draftRevision) throw new Error('Stale issue draft revision');
      entry.savedIssues = [...(entry.savedIssues ?? []).filter((previous) => previous.id !== issue.id), issue];
      await this.save(entry);
    });
  }

  resolveRevisionIssue(id: string): Promise<void> {
    return this.run(async () => {
      const current = [...this.entries.values()].find((entry) => entry.savedIssues?.some((issue) => issue.id === id));
      if (!current) { this.issues.resolve(id); return; }
      const entry = structuredClone(current);
      entry.savedIssues = entry.savedIssues!.filter((issue) => issue.id !== id);
      await this.save(entry);
    });
  }

  createDraft(manifest: ComponentManifest): Promise<Draft> {
    // Parse before awaiting so caller mutations cannot change the requested baseline.
    const sourceManifest = ComponentManifestSchema.parse(manifest);
    return this.run(async () => {
      const now = new Date().toISOString();
      const entry: StoredDraft = {
        draft: DraftSchema.parse({ id: randomUUID(), componentManifestId: sourceManifest.id, sourceCommit: sourceManifest.source.commit,
          status: 'temporary', revision: 0, createdAt: now, updatedAt: now }),
        sourceManifest, canonicalManifest: structuredClone(sourceManifest), overrides: [], proposals: [],
        approvals: [],
      };
      await this.save(entry);
      return this.getDraft(entry.draft.id);
    });
  }

  keepDraft(id: string): Promise<Draft> {
    return this.run(async () => {
      const entry = structuredClone(this.entry(id));
      if (entry.draft.status === 'kept') return this.getDraft(id);
      this.revise(entry);
      entry.draft.status = 'kept';
      await this.save(entry);
      await this.deleteTemporary(id);
      return this.getDraft(id);
    });
  }

  closeDraft(id: string): Promise<void> {
    return this.run(async () => {
      if (this.entry(id).draft.status === 'kept') return;
      await this.deleteTemporary(id);
      this.entries.delete(id);
      for (const issue of this.issues.list({ draftId: id })) this.issues.resolve(issue.id);
      this.generatedIssues.delete(id);
    });
  }

  async applyOverride(id: string, input: OverrideInput): Promise<PreviewOverride> {
    const detached = captureOverrideInput(input);
    return this.run(async () => {
      const entry = structuredClone(this.entry(id));
      const { binding, target } = selectBinding(entry.canonicalManifest, detached.target, detached.category);
      const override = PreviewOverrideSchema.parse({
        ...detached, target, id: randomUUID(), draftId: id, createdAt: new Date().toISOString(),
        ...(binding ? { sourceToken: binding.token } : {}),
      });
      const superseded = entry.overrides.filter((existing) => existing.target === override.target && existing.category === override.category);
      entry.overrides = entry.overrides.filter((existing) => !superseded.includes(existing));
      entry.proposals = entry.proposals.filter((proposal) => !superseded.some((existing) => existing.id === proposal));
      entry.overrides.push(override);
      this.revise(entry);
      await this.save(entry);
      return structuredClone(override);
    });
  }

  resolveOverride(id: string, overrideId: string, resolution: OverrideResolution): Promise<Draft> {
    const detached = structuredClone(resolution);
    return this.run(async () => {
      const entry = structuredClone(this.entry(id));
      const override = entry.overrides.find((candidate) => candidate.id === overrideId);
      if (!override) throw new Error(`Unknown override: ${overrideId}`);
      if (detached.action === 'replace-with-existing-token') {
        if (!this.approvedTokens(entry).some((token) => token.category === override.category && token.token === detached.token)) {
          throw new Error('Replacement must be an exact existing approved token in the same category');
        }
        const { binding } = selectBinding(entry.canonicalManifest, override.target, override.category);
        if (binding) binding.token = detached.token;
        else entry.canonicalManifest.tokens.push({ property: override.target, category: override.category, token: detached.token });
      } else if (detached.action === 'propose-token') {
        if (!entry.proposals.includes(overrideId)) entry.proposals.push(overrideId);
      } else if (detached.action !== 'revert') {
        throw new Error('Unknown override resolution');
      }
      if (detached.action !== 'propose-token') {
        entry.overrides = entry.overrides.filter((candidate) => candidate.id !== overrideId);
        entry.proposals = entry.proposals.filter((proposal) => proposal !== overrideId);
      }
      this.revise(entry);
      await this.save(entry);
      return this.getDraft(id);
    });
  }

  closeSession(): Promise<void> {
    return this.run(async () => {
      for (const [id, entry] of this.entries) {
        if (entry.draft.status !== 'temporary') continue;
        await this.deleteTemporary(id);
        this.entries.delete(id);
        for (const issue of this.issues.list({ draftId: id })) this.issues.resolve(issue.id);
        this.generatedIssues.delete(id);
      }
      await this.ensureDirectory(this.sessionRoot);
      for (const file of await readdir(this.sessionRoot)) {
        const path = join(this.sessionRoot, file);
        await this.checkFile(path);
        await rm(path, { force: true });
      }
      this.closed = true;
    });
  }

  private entry(id: string): StoredDraft {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown draft: ${id}`);
    return entry;
  }

  /** Reserve this revision and shared issue readiness only for the short publish operation. */
  acquireIntegrationLease(id: string, revision: number): Promise<() => void> {
    return this.run(async () => {
      if (this.entry(id).draft.revision !== revision) throw new Error('Stale draft revision at publication');
      if (this.issues.count() !== 0 || !this.isIntegrationReady(id)) throw new Error('Draft issues/readiness changed before publication');
      return this.issues.acquireMutationLease();
    });
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(() => {
      if (this.closed) throw new Error('Session is closed');
      this.issues.assertMutable();
      return operation();
    });
    this.pending = result.catch(() => {});
    return result;
  }

  private temporaryPath(id: string): string { return join(this.sessionRoot, `${id}.json`); }

  private async deleteTemporary(id: string): Promise<void> {
    const path = this.temporaryPath(id);
    await this.checkFile(path);
    await rm(path, { force: true });
  }

  /** Reject pre-existing storage symlinks before following them for reads or writes. */
  private async ensureDirectory(path: string): Promise<void> {
    const subpath = relative(this.projectRoot, path);
    if (isAbsolute(subpath) || subpath === '..' || subpath.startsWith(`..${sep}`)) throw new Error('Storage path escapes project');
    let current = this.projectRoot;
    for (const part of subpath.split(sep).filter(Boolean)) {
      current = join(current, part);
      try { await mkdir(current); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Storage directory must not be a symlink or non-directory');
    }
  }

  private async checkFile(path: string): Promise<void> {
    await this.ensureDirectory(dirname(path));
    try {
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Storage file must not be a symlink or non-file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  private revise(entry: StoredDraft): void {
    entry.draft.revision += 1;
    entry.draft.updatedAt = new Date().toISOString();
  }

  private approvedTokens(entry: StoredDraft): readonly SystemToken[] {
    return this.tokenIndex ?? entry.sourceManifest.tokens;
  }

  private async save(entry: StoredDraft): Promise<void> {
    const previousIssues = this.entries.get(entry.draft.id)?.savedIssues ?? [];
    entry.savedIssues = (entry.savedIssues ?? []).filter((issue) => issue.draftId === entry.draft.id && issue.draftRevision === entry.draft.revision);
    const directory = entry.draft.status === 'kept' ? join(this.keptRoot, entry.draft.id) : this.sessionRoot;
    await this.ensureDirectory(directory);
    const destination = entry.draft.status === 'kept'
      ? join(directory, `${entry.draft.revision}.json`) : this.temporaryPath(entry.draft.id);
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    await this.checkFile(destination);
    try {
      await writeFile(temporary, JSON.stringify(entry), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
    this.entries.set(entry.draft.id, entry);
    // A failure describes one saved candidate, not every future revision.
    for (const issue of this.issues.list({ draftId: entry.draft.id }))
      if (issue.draftRevision !== undefined && issue.draftRevision !== entry.draft.revision)
        this.issues.resolve(issue.id);
    for (const previous of previousIssues)
      if (!entry.savedIssues.some((issue) => issue.id === previous.id)) this.issues.resolve(previous.id);
    for (const issue of entry.savedIssues) this.issues.add(issue);
    this.refreshIssues(entry);
  }

  private async load(path: string, status: Draft['status'], id: string): Promise<void> {
    await this.checkFile(path);
    const input = JSON.parse(await readFile(path, 'utf8')) as StoredDraft;
    const entry: StoredDraft = {
      draft: DraftSchema.parse(input.draft),
      sourceManifest: ComponentManifestSchema.parse(input.sourceManifest),
      canonicalManifest: ComponentManifestSchema.parse(input.canonicalManifest),
      overrides: input.overrides.map((override) => PreviewOverrideSchema.parse(override)),
      proposals: input.proposals,
      previewValues: input.previewValues,
      savedIssues: (input.savedIssues ?? []).map((issue) => IssueSchema.parse(issue)),
      approvals: (input.approvals ?? []).map((approval) => DraftApprovalSchema.parse(approval)),
    };
    const { tokens: _sourceTokens, ...sourceMetadata } = entry.sourceManifest;
    const { tokens: _canonicalTokens, ...canonicalMetadata } = entry.canonicalManifest;
    if (entry.draft.status !== status || entry.draft.id !== id
      || entry.sourceManifest.id !== entry.draft.componentManifestId
      || entry.sourceManifest.source.commit !== entry.draft.sourceCommit
      || JSON.stringify(sourceMetadata) !== JSON.stringify(canonicalMetadata)
      || entry.overrides.some((override) => override.draftId !== id)
      || entry.savedIssues!.some((issue) => issue.draftId !== id || issue.draftRevision !== entry.draft.revision)
      || entry.approvals!.some((approval) => approval.draftId !== id)
      || !Array.isArray(entry.proposals) || entry.proposals.some((proposal) => !entry.overrides.some((override) => override.id === proposal))) {
      throw new Error('Invalid stored draft associations');
    }
    // Upgrade old unique property targets in memory; ambiguous recovery records fail closed.
    for (const override of entry.overrides) {
      override.target = selectBinding(entry.canonicalManifest, override.target, override.category).target;
    }
    this.entries.set(id, entry);
    for (const issue of entry.savedIssues!) this.issues.add(issue);
    this.refreshIssues(entry);
  }

  private refreshIssues(entry: StoredDraft): void {
    const draftId = entry.draft.id;
    const active: Issue[] = auditTokens(entry.canonicalManifest, this.approvedTokens(entry), { draftId });
    for (const override of entry.overrides) {
      active.push({ id: `override:${override.id}`, draftId, type: 'override', severity: 'warning',
        target: { kind: 'token', id: override.target }, message: `Preview override for ${override.target} requires explicit resolution.`,
        resolutionActions: ['revert', 'replace-with-existing-token', 'propose-token'], createdAt: override.createdAt });
      if (entry.proposals.includes(override.id)) active.push({ id: `proposal:${override.id}`, draftId, type: 'token-gap', severity: 'blocker',
        target: { kind: 'token', id: override.target }, message: 'Proposed token requires repository approval before it becomes canonical.',
        resolutionActions: ['revert', 'replace-with-existing-token'], createdAt: override.createdAt });
    }
    const ids = new Set(active.map((issue) => issue.id));
    for (const id of this.generatedIssues.get(draftId) ?? []) if (!ids.has(id)) this.issues.resolve(id);
    for (const issue of active) this.issues.add(issue);
    this.generatedIssues.set(draftId, ids);
  }
}

export const createDraft = (service: DraftService, manifest: ComponentManifest): Promise<Draft> => service.createDraft(manifest);
export const keepDraft = (service: DraftService, draftId: string): Promise<Draft> => service.keepDraft(draftId);
export const closeDraft = (service: DraftService, draftId: string): Promise<void> => service.closeDraft(draftId);
export const applyOverride = (service: DraftService, draftId: string, override: OverrideInput): Promise<PreviewOverride> => service.applyOverride(draftId, override);
export const resolveOverride = (service: DraftService, draftId: string, overrideId: string, resolution: OverrideResolution): Promise<Draft> => service.resolveOverride(draftId, overrideId, resolution);
