import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DraftSchema, PreviewOverrideSchema, type DesignFinding } from '@byol/core';
import { DraftService, createDraft, keepDraft, closeDraft, applyOverride, resolveOverride, tokenBindingTarget } from './drafts';
import { manifest, tokenIndex } from './test-fixtures';

let projectRoot: string;
let service: DraftService;
beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'byol-runtime-'));
  service = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
});
afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

describe('draft lifetime', () => {
  it('creates a schema-valid temporary draft with a detached immutable baseline', async () => {
    const input = structuredClone(manifest);
    const draft = await createDraft(service, input);
    expect(DraftSchema.parse(draft)).toMatchObject({ status: 'temporary', revision: 0, sourceCommit: 'source-commit', componentManifestId: 'mande-checkbox' });
    input.tokens[0].token = 'mutated';
    const source = service.getSourceManifest(draft.id);
    source.tokens.length = 0;
    draft.status = 'kept';
    expect(service.getDraft(draft.id).status).toBe('temporary');
    expect(service.getSourceManifest(draft.id).tokens).toEqual(manifest.tokens);
    expect(await readdir(join(projectRoot, '.byol/drafts'))).toEqual([]);
  });

  it('recovers temporary drafts and preview config only for the same still-open session', async () => {
    const draft = await createDraft(service, manifest);
    await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: '#123456' });
    const recovered = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
    expect(recovered.getDraft(draft.id).status).toBe('temporary');
    expect(recovered.getOverrides(draft.id)[0].value).toBe('#123456');
    expect(recovered.issues.count()).toBe(1);
    const other = await DraftService.open({ projectRoot, sessionId: 'other-session', tokenIndex });
    expect(() => other.getDraft(draft.id)).toThrow(/unknown/i);
  });

  it('deletes an unkept draft, overrides and issues immediately on close without recovery residue', async () => {
    const draft = await createDraft(service, manifest);
    await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: '#123456' });
    await closeDraft(service, draft.id);
    expect(() => service.getDraft(draft.id)).toThrow(/unknown/i);
    expect(service.issues.count()).toBe(0);
    const recovered = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
    expect(() => recovered.getDraft(draft.id)).toThrow(/unknown/i);
    expect(await readdir(join(projectRoot, '.byol/drafts'))).toEqual([]);
    expect(await readdir(join(projectRoot, '.byol/cache/sessions/open-session'))).toEqual([]);
  });

  it('persists only explicitly kept drafts and their revisions across preview and session close', async () => {
    const kept = await createDraft(service, manifest);
    const temporary = await createDraft(service, manifest);
    await keepDraft(service, kept.id);
    await applyOverride(service, kept.id, { target: 'width', category: 'size', value: 24 });
    await closeDraft(service, kept.id);
    await service.closeSession();
    const reopened = await DraftService.open({ projectRoot, sessionId: 'next-session', tokenIndex });
    expect(reopened.getDraft(kept.id)).toMatchObject({ status: 'kept', revision: 2 });
    expect(reopened.getOverrides(kept.id)).toHaveLength(1);
    expect(() => reopened.getDraft(temporary.id)).toThrow(/unknown/i);
    expect(await readdir(join(projectRoot, '.byol/drafts', kept.id))).toHaveLength(2);
    const oldSession = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
    expect(() => oldSession.getDraft(temporary.id)).toThrow(/unknown/i);
    await expect(createDraft(service, manifest)).rejects.toThrow(/closed/i);
  });

  it('rejects session path traversal and storage symlinks before writing outside the project', async () => {
    await expect(DraftService.open({ projectRoot, sessionId: '../outside' })).rejects.toThrow(/session/i);
    const outside = await mkdtemp(join(tmpdir(), 'byol-outside-'));
    try {
      const nested = join(projectRoot, 'nested');
      await mkdir(nested);
      await symlink(outside, join(nested, '.byol'));
      await expect(DraftService.open({ projectRoot: nested, sessionId: 'safe' })).rejects.toThrow(/symlink|outside|escape/i);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('serializes simultaneous mutations without losing overrides or duplicate revisions', async () => {
    const draft = await createDraft(service, manifest);
    await keepDraft(service, draft.id);
    await Promise.all([
      applyOverride(service, draft.id, { target: 'width', category: 'size', value: 30 }),
      applyOverride(service, draft.id, { target: 'color', category: 'color', value: 'red' }),
    ]);
    expect(service.getDraft(draft.id).revision).toBe(3);
    expect(service.getOverrides(draft.id)).toHaveLength(2);
    expect(await readdir(join(projectRoot, '.byol/drafts', draft.id))).toHaveLength(3);
  });

  it('rejects recovery records that move canonical source metadata away from the immutable baseline', async () => {
    const draft = await createDraft(service, manifest);
    await keepDraft(service, draft.id);
    const path = join(projectRoot, '.byol/drafts', draft.id, '1.json');
    const stored = JSON.parse(await readFile(path, 'utf8'));
    stored.canonicalManifest.source.path = 'another-component.tsx';
    await writeFile(path, JSON.stringify(stored));
    await expect(DraftService.open({ projectRoot, sessionId: 'recovery', tokenIndex })).rejects.toThrow(/baseline|association/i);
  });

  it('clears crash leftovers on clean session close while retaining a completed keep', async () => {
    const draft = await createDraft(service, manifest);
    const directory = join(projectRoot, '.byol/cache/sessions/open-session');
    const recovery = await readFile(join(directory, `${draft.id}.json`), 'utf8');
    await keepDraft(service, draft.id);
    // Simulate interruption after the kept revision was written but before recovery cleanup.
    await writeFile(join(directory, `${draft.id}.json`), recovery);
    await writeFile(join(directory, '.interrupted.tmp'), 'unfinished atomic write');
    const recovered = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
    expect(recovered.getDraft(draft.id).status).toBe('kept');
    await recovered.closeSession();
    expect(await readdir(directory)).toEqual([]);
    const reopened = await DraftService.open({ projectRoot, sessionId: 'next', tokenIndex });
    expect(reopened.getDraft(draft.id).status).toBe('kept');
  });
});

describe('preview isolation and resolution', () => {
  it('rejects ambiguous property targets without changing repeated source bindings', async () => {
    const repeated = { ...manifest, tokens: [
      { property: 'color', category: 'color', token: 'tokens.color.border' },
      { property: 'color', category: 'color', token: 'tokens.color.accent' },
    ] };
    const draft = await createDraft(service, repeated);
    await expect(applyOverride(service, draft.id, { target: 'color', category: 'color', value: 'red' })).rejects.toThrow(/ambiguous/i);
    expect(service.getDraft(draft.id).revision).toBe(0);
    expect(service.getOverrides(draft.id)).toEqual([]);
    expect(service.getSourceManifest(draft.id)).toEqual(repeated);
    const recovered = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
    expect(recovered.getCanonicalManifest(draft.id)).toEqual(repeated);
  });

  it('independently overrides, supersedes, recovers and replaces repeated property/category bindings', async () => {
    const repeated = { ...manifest, tokens: [
      { property: 'color', category: 'color', token: 'tokens.color.border' },
      { property: 'color', category: 'color', token: 'tokens.color.border' },
    ] };
    const draft = await createDraft(service, repeated);
    const first = await applyOverride(service, draft.id, { target: tokenBindingTarget(0), category: 'color', value: 'red' });
    const second = await applyOverride(service, draft.id, { target: tokenBindingTarget(1), category: 'color', value: 'blue' });
    const superseding = await applyOverride(service, draft.id, { target: tokenBindingTarget(1), category: 'color', value: 'green' });
    expect(service.getOverrides(draft.id).map((override) => override.id)).toEqual([first.id, superseding.id]);
    await expect(resolveOverride(service, draft.id, second.id, { action: 'revert' })).rejects.toThrow(/unknown/i);
    await keepDraft(service, draft.id);
    const recovered = await DraftService.open({ projectRoot, sessionId: 'another', tokenIndex });
    await resolveOverride(recovered, draft.id, superseding.id, { action: 'replace-with-existing-token', token: 'tokens.color.accent' });
    expect(recovered.getCanonicalManifest(draft.id).tokens).toEqual([
      { property: 'color', category: 'color', token: 'tokens.color.border' },
      { property: 'color', category: 'color', token: 'tokens.color.accent' },
    ]);
    expect(recovered.getOverrides(draft.id)).toEqual([first]);
    await resolveOverride(recovered, draft.id, first.id, { action: 'revert' });
    expect(recovered.getSourceManifest(draft.id)).toEqual(repeated);
    const reopened = await DraftService.open({ projectRoot, sessionId: 'yet-another', tokenIndex });
    expect(reopened.getCanonicalManifest(draft.id).tokens.map((binding) => binding.token)).toEqual(['tokens.color.border', 'tokens.color.accent']);
    expect(reopened.getSourceManifest(draft.id)).toEqual(repeated);
  });

  it('normalizes legacy unique property targets and explicit selectors to the same override identity', async () => {
    const draft = await createDraft(service, manifest);
    await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: 'red' });
    const selected = await applyOverride(service, draft.id, { target: tokenBindingTarget(0), category: 'color', value: 'blue' });
    expect(service.getOverrides(draft.id)).toEqual([selected]);
    expect(service.issues.count()).toBe(1);
    await expect(applyOverride(service, draft.id, { target: tokenBindingTarget(0), category: 'size', value: 20 })).rejects.toThrow(/binding|category/i);
    await expect(applyOverride(service, draft.id, { target: tokenBindingTarget(100), category: 'color', value: 'red' })).rejects.toThrow(/binding/i);
  });

  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const invalidValues: [string, unknown][] = [
    ['undefined', undefined], ['NaN', NaN], ['Infinity', Infinity], ['negative Infinity', -Infinity],
    ['nested undefined', { nested: { missing: undefined } }], ['nested NaN', [0, { number: NaN }]],
    ['function', () => 1], ['symbol', Symbol('value')], ['bigint', 1n], ['cycle', cycle],
    ['date', new Date('2026-11-10T00:00:00.000Z')], ['map', new Map([['key', 1]])],
    ['sparse array', new Array(2)], ['negative zero', -0],
    ['symbol key', { [Symbol('key')]: 'lost' }],
    ['non-enumerable key', Object.defineProperty({}, 'hidden', { value: 1 })],
    ['accessor', Object.defineProperty({}, 'value', { enumerable: true, get: () => 1 })],
    ['array property', Object.assign([1], { extra: true })],
  ];

  describe.each(['temporary', 'kept'] as const)('%s JSON persistence', (status) => {
    it('rejects a changing outer value getter without changing durable state or recovery', async () => {
      const draft = await createDraft(service, manifest);
      if (status === 'kept') await keepDraft(service, draft.id);
      const original = await applyOverride(service, draft.id, { target: 'width', category: 'size', value: 20 });
      const before = service.getDraft(draft.id);
      const path = status === 'kept'
        ? join(projectRoot, '.byol/drafts', draft.id, `${before.revision}.json`)
        : join(projectRoot, '.byol/cache/sessions/open-session', `${draft.id}.json`);
      const beforeFile = await readFile(path, 'utf8');
      let getterReads = 0;
      const input = {
        target: 'width', category: 'size',
        get value() { return ++getterReads === 1 ? 24 : NaN; },
      };
      await expect(applyOverride(service, draft.id, input)).rejects.toThrow(/accessor|data propert/i);
      expect(getterReads).toBe(0);
      expect(await readFile(path, 'utf8')).toBe(beforeFile);
      expect(service.getDraft(draft.id)).toEqual(before);
      expect(service.getOverrides(draft.id)).toEqual([original]);
      const reopened = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
      expect(reopened.getDraft(draft.id)).toEqual(before);
      expect(reopened.getOverrides(draft.id)).toEqual([original]);
      if (status === 'kept') expect(await readdir(join(projectRoot, '.byol/drafts', draft.id))).toHaveLength(before.revision);
    });

    it.each(invalidValues)('rejects %s without changing durable state or breaking recovery', async (_name, value) => {
      const draft = await createDraft(service, manifest);
      if (status === 'kept') await keepDraft(service, draft.id);
      const original = await applyOverride(service, draft.id, { target: 'width', category: 'size', value: 24 });
      const before = service.getDraft(draft.id);
      const path = status === 'kept'
        ? join(projectRoot, '.byol/drafts', draft.id, `${before.revision}.json`)
        : join(projectRoot, '.byol/cache/sessions/open-session', `${draft.id}.json`);
      const beforeFile = await readFile(path, 'utf8');
      await expect(async () => applyOverride(service, draft.id, { target: 'width', category: 'size', value })).rejects.toThrow(/JSON/i);
      expect(await readFile(path, 'utf8')).toBe(beforeFile);
      expect(service.getDraft(draft.id)).toEqual(before);
      expect(service.getOverrides(draft.id)).toEqual([original]);
      const reopened = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
      expect(reopened.getDraft(draft.id)).toEqual(before);
      expect(reopened.getOverrides(draft.id)).toEqual([original]);
      if (status === 'kept') expect(await readdir(join(projectRoot, '.byol/drafts', draft.id))).toHaveLength(before.revision);
    });

    it('reopens nested JSON values with false, zero, empty strings and null intact', async () => {
      const draft = await createDraft(service, manifest);
      if (status === 'kept') await keepDraft(service, draft.id);
      const value = { values: [false, 0, '', null, { count: 1.25, nested: [] }], empty: {} };
      await applyOverride(service, draft.id, { target: 'width', category: 'size', value });
      const reopened = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
      expect(reopened.getOverrides(draft.id)[0].value).toEqual(value);
    });
  });

  it('blocks unknown canonical tokens even when a caller dismisses the displayed issue', async () => {
    const draft = await createDraft(service, { ...manifest, tokens: [{ property: 'duration', category: 'motion', token: 'tokens.motion.missing' }] });
    expect(service.issues.list()).toMatchObject([{ severity: 'blocker', type: 'token-gap' }]);
    for (const issue of service.issues.list()) service.issues.resolve(issue.id);
    expect(service.isIntegrationReady(draft.id)).toBe(false);
  });
  it('keeps preview literals out of canonical output and persisted source evidence', async () => {
    const draft = await createDraft(service, manifest);
    const override = await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: '#123456' });
    expect(PreviewOverrideSchema.parse(override)).toMatchObject({ draftId: draft.id, sourceToken: 'tokens.color.border', value: '#123456' });
    override.value = 'mutated';
    expect(service.getOverrides(draft.id)[0].value).toBe('#123456');
    expect(service.getSourceManifest(draft.id)).toEqual(manifest);
    expect(service.getCanonicalManifest(draft.id)).toEqual(manifest);
    expect(service.issues.list()).toMatchObject([{ type: 'override', severity: 'warning' }]);
    expect(service.isIntegrationReady(draft.id)).toBe(false);
    await resolveOverride(service, draft.id, override.id, { action: 'revert' });
    expect(service.getOverrides(draft.id)).toEqual([]);
    expect(service.getCanonicalManifest(draft.id)).toEqual(manifest);
    expect(service.issues.count()).toBe(0);
    expect(service.isIntegrationReady(draft.id)).toBe(true);
  });

  it('allows only explicit exact existing-token replacement to change canonical output', async () => {
    const draft = await createDraft(service, manifest);
    const override = await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: '#123456' });
    await expect(resolveOverride(service, draft.id, override.id, { action: 'replace-with-existing-token', token: '#123456' })).rejects.toThrow(/existing|approved/i);
    await expect(resolveOverride(service, draft.id, override.id, { action: 'replace-with-existing-token', token: 'tokens.size.control' })).rejects.toThrow(/existing|approved/i);
    expect(service.getOverrides(draft.id)).toHaveLength(1);
    await resolveOverride(service, draft.id, override.id, { action: 'replace-with-existing-token', token: 'tokens.color.accent' });
    expect(service.getCanonicalManifest(draft.id).tokens[0].token).toBe('tokens.color.accent');
    expect(service.getSourceManifest(draft.id)).toEqual(manifest);
    expect(service.getDraft(draft.id).revision).toBe(2);
    expect(service.isIntegrationReady(draft.id)).toBe(true);
    await keepDraft(service, draft.id);
    const reopened = await DraftService.open({ projectRoot, sessionId: 'another', tokenIndex });
    expect(reopened.getCanonicalManifest(draft.id).tokens[0].token).toBe('tokens.color.accent');
    expect(JSON.parse(await readFile(join(projectRoot, '.byol/drafts', draft.id, '3.json'), 'utf8')).sourceManifest).toEqual(manifest);
  });

  it('keeps proposed tokens noncanonical and blocking until repository approval exists', async () => {
    const draft = await createDraft(service, manifest);
    const override = await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: '#123456' });
    await resolveOverride(service, draft.id, override.id, { action: 'propose-token' });
    expect(service.getCanonicalManifest(draft.id)).toEqual(manifest);
    expect(service.issues.list()).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'token-gap', severity: 'blocker' })]));
    expect(service.isIntegrationReady(draft.id)).toBe(false);
    await resolveOverride(service, draft.id, override.id, { action: 'revert' });
    expect(service.issues.count()).toBe(0);
  });

  it('replaces active overrides for the same target instead of leaving stale values or issues', async () => {
    const draft = await createDraft(service, manifest);
    const first = await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: 'red' });
    const second = await applyOverride(service, draft.id, { target: 'borderColor', category: 'color', value: 'blue' });
    expect(service.getOverrides(draft.id)).toMatchObject([{ id: second.id, value: 'blue' }]);
    expect(service.issues.count()).toBe(1);
    await expect(resolveOverride(service, draft.id, first.id, { action: 'revert' })).rejects.toThrow(/unknown/i);
  });
});

it("deletes draft-owned preview controls with an unkept draft", async () => {
  const service = await DraftService.open({
    projectRoot,
    sessionId: "controls",
  });
  const draft = await service.createDraft(manifest);
  await service.setPreviewValue(draft.id, "checked", true);
  expect(service.getPreviewValues(draft.id)).toEqual({ checked: true });
  await service.closeDraft(draft.id);
  expect(() => service.getPreviewValues(draft.id)).toThrow();
  await service.closeSession();
});

it('preserves kept preview controls across runtime sessions', async () => {
  const draft = await service.createDraft(manifest);
  await service.setPreviewValue(draft.id, 'checked', true);
  await service.keepDraft(draft.id);
  await service.closeSession();
  const reopened = await DraftService.open({ projectRoot, sessionId: 'preview-reopen', tokenIndex });
  expect(reopened.getPreviewValues(draft.id)).toEqual({ checked: true });
  await reopened.closeSession();
});
it('retires superseded revision issues after successful save while preserving unrelated blockers', async () => {
  const first = await service.createDraft(manifest), second = await service.createDraft(manifest);
  const issue = { type: 'validation' as const, severity: 'blocker' as const, message: 'Failed candidate', resolutionActions: ['retry-verification'], createdAt: new Date().toISOString() };
  service.issues.add({ ...issue, id: 'failed-first', draftId: first.id, draftRevision: first.revision, target: { kind: 'draft', id: first.id } });
  service.issues.add({ ...issue, id: 'source-first', draftId: first.id, target: { kind: 'draft', id: first.id } });
  service.issues.add({ ...issue, id: 'failed-second', draftId: second.id, draftRevision: second.revision, target: { kind: 'draft', id: second.id } });
  await service.setPreviewValue(first.id, 'checked', true);
  expect(service.issues.list().map((entry) => entry.id).sort()).toEqual(['failed-second', 'source-first']);
});

it('persists approvals as draft metadata and invalidates them when the revision changes', async () => {
  const draft = await service.createDraft(manifest);
  const finding: DesignFinding = {
    id: 'visual-radius', category: 'visual-value', severity: 'blocker', repositoryId: 'repo',
    sourceCommit: draft.sourceCommit, draftId: draft.id, draftRevision: draft.revision, componentId: manifest.id,
    ruleId: 'hardcodedVisualValues', property: 'borderRadius', currentValue: 12,
    location: { path: manifest.source.path, line: 1, column: 1 }, evidence: 'borderRadius:12',
    applicableRule: 'Use a token.', alternatives: ['tokens.radius.control'],
    integrationImpact: 'Requires approval.', actions: ['approve'],
  };
  await service.approveFinding(draft.id, finding, 'owner', 'Source parity');
  expect(service.isFindingApproved(draft.id, finding)).toBe(true);
  const recovered = await DraftService.open({ projectRoot, sessionId: 'open-session', tokenIndex });
  expect(recovered.getApprovals(draft.id)).toHaveLength(1);
  expect(recovered.isFindingApproved(draft.id, finding)).toBe(true);
  await recovered.setPreviewValue(draft.id, 'checked', true);
  expect(recovered.getApprovals(draft.id)).toHaveLength(1);
  expect(recovered.isFindingApproved(draft.id, { ...finding, draftRevision: 1 })).toBe(false);
});
