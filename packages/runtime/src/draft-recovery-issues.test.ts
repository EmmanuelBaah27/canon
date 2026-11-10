import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Issue } from '@byol/core';
import { DraftService } from './drafts';
import { manifest, tokenIndex } from './test-fixtures';
let projectRoot: string, service: DraftService;
beforeEach(async () => { projectRoot = await mkdtemp(join(tmpdir(), 'byol-issue-recovery-')); service = await DraftService.open({ projectRoot, sessionId: 'recovery', tokenIndex }); });
afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });
const reopen = () => DraftService.open({ projectRoot, sessionId: 'recovery', tokenIndex });
function failure(draftId: string, draftRevision: number): Issue { return { id: 'verification:approval', draftId, draftRevision, type: 'validation', severity: 'blocker', target: { kind: 'draft', id: draftId }, message: 'Native checks failed', resolutionActions: ['retry-verification'], createdAt: '2026-11-10T00:00:00.000Z' }; }
it('recovers revision-scoped verification blockers without changing the candidate revision and persists successful retry resolution', async () => {
  const draft = await service.createDraft(manifest), issue = failure(draft.id, draft.revision);
  await service.recordRevisionIssue(issue);
  const recovered = await reopen();
  expect(recovered.getDraft(draft.id)).toEqual(draft);
  expect(recovered.issues.list()).toContainEqual(issue);
  expect(recovered.isIntegrationReady(draft.id)).toBe(false);
  // A retry temporarily lifts the in-memory blocker; interruption retains its durable copy.
  recovered.issues.resolve(issue.id);
  expect((await reopen()).issues.list()).toContainEqual(issue);
  await recovered.resolveRevisionIssue(issue.id);
  expect((await reopen()).issues.list()).toEqual([]);
});
it('removes recovered blockers only after a new candidate revision is saved', async () => {
  const draft = await service.createDraft(manifest);
  await service.recordRevisionIssue(failure(draft.id, draft.revision));
  await service.setPreviewValue(draft.id, 'checked', true);
  expect((await reopen()).issues.list()).toEqual([]);
});
it('deletes durable verification blockers with their closed temporary draft', async () => {
  const draft = await service.createDraft(manifest);
  await service.recordRevisionIssue(failure(draft.id, draft.revision));
  await service.closeDraft(draft.id);
  expect((await reopen()).issues.list()).toEqual([]);
});
it('rejects unscoped or stale verification issue persistence', async () => {
  const draft = await service.createDraft(manifest);
  await expect(service.recordRevisionIssue({ ...failure(draft.id, draft.revision), draftRevision: undefined })).rejects.toThrow(/revision|scope/i);
  await expect(service.recordRevisionIssue(failure(draft.id, draft.revision + 1))).rejects.toThrow(/revision|stale/i);
  expect((await reopen()).issues.list()).toEqual([]);
});
it.each(['draftId', 'draftRevision'] as const)('rejects recovery issue records associated with a foreign %s', async (field) => {
  const draft = await service.createDraft(manifest), path = join(projectRoot, '.byol/cache/sessions/recovery', `${draft.id}.json`);
  const record = JSON.parse(await readFile(path, 'utf8'));
  record.savedIssues = [{ ...failure(draft.id, draft.revision), [field]: field === 'draftId' ? 'foreign' : 100 }];
  await writeFile(path, JSON.stringify(record));
  await expect(reopen()).rejects.toThrow(/association|scope|revision/i);
});
