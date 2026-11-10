import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectRepository, discoverComponents, buildComponentManifest } from '../../repository/src/index';
import { DraftService } from '../../runtime/src/index';
import { IntegrationApprovalSchema } from '@byol/core';
import { IntegrationService, approveIntegration, verifyInIsolatedWorktree, writeApprovedBranch, detectVerificationCommands, assertApprovedTree } from './index';
import { git as isolatedGit, isolatedWorktree, publishBranch, runCommand } from './worktree';
let root: string, repository: string, project: string, drafts: DraftService, service: IntegrationService, draftId: string;
const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', repository, ...args], { encoding: 'utf8' }).trim();
const original = `import { tokens } from './tokens';\nexport const Checkbox = () => <input type="checkbox" style={{ color: tokens.color.border, width: tokens.size.control }} />;\n`;
async function snapshot() { return { head: git('rev-parse', 'HEAD'), refs: git('show-ref'), status: git('status', '--porcelain=v1'), index: git('ls-files', '--stage'), objects: git('count-objects', '-v'), source: await readFile(join(repository, 'Checkbox.tsx'), 'utf8') }; }
async function prepare(branchName?: string) { return service.prepareIntegration(draftId, { branchName }); }
async function approve(branchName?: string) { return approveIntegration(service, (await prepare(branchName)).id, 'Approve integration'); }
async function replace() { const override = await drafts.applyOverride(draftId, { target: 'color', category: 'color', value: '#abc' }); await drafts.resolveOverride(draftId, override.id, { action: 'replace-with-existing-token', token: 'tokens.color.accent' }); }
async function reload() { const connection = await connectRepository({ kind: 'local', path: repository }); const component = (await discoverComponents(connection))[0]; const manifest = await buildComponentManifest(component.id); draftId = (await drafts.createDraft(manifest)).id; service = await IntegrationService.open({ projectRoot: project, drafts, connection }); }
async function scripts(values: Record<string, string>) { await writeFile(join(repository, 'package.json'), JSON.stringify({ name: 'fixture', scripts: values })); git('add', '.'); git('commit', '-m', 'commands'); await reload(); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'byol-integration-')); repository = join(root, 'source with spaces'); project = join(root, 'project'); await mkdir(repository); await mkdir(project);
  git('init', '-b', 'main'); git('config', 'user.email', 'fixture@example.com'); git('config', 'user.name', 'Fixture');
  await writeFile(join(repository, 'Checkbox.tsx'), original); await writeFile(join(repository, 'tokens.ts'), "export const tokens = { color: { border: '#000', accent: '#fff' }, size: { control: 16 } };\n");
  await writeFile(join(repository, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {} })); git('add', '.'); git('commit', '-m', 'baseline');
  drafts = await DraftService.open({ projectRoot: project, sessionId: 'integration', tokenIndex: [{ category: 'color', token: 'tokens.color.border' }, { category: 'color', token: 'tokens.color.accent' }, { category: 'size', token: 'tokens.size.control' }] }); await reload();
});
afterEach(async () => { vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
describe('auditable approval boundary', () => {
  it('shows exact source/revision/destination before explicit approval and persists core approval', async () => {
    const before = await snapshot(), proposal = await prepare(); expect(proposal).toMatchObject({ draftId, draftRevision: 0, sourceCommit: before.head, baseCommit: before.head, destinationRepositoryId: drafts.getSourceManifest(draftId).repositoryId }); expect(proposal.branchName).toMatch(/^codex\/byol-/);
    await expect(approveIntegration(service, proposal.id, 'yes' as 'Approve integration')).rejects.toThrow(/Approve integration/); expect(await service.listApprovals()).toEqual([]);
    const approval = await approveIntegration(service, proposal.id, 'Approve integration'); expect(IntegrationApprovalSchema.parse(approval)).toMatchObject({ draftId, sourceCommit: before.head, draftRevision: 0, destinationRepositoryId: proposal.destinationRepositoryId });
    const reopened = await IntegrationService.open({ projectRoot: project, drafts, connection: service.connection }); expect(await reopened.listApprovals()).toEqual([approval]); expect(await snapshot()).toEqual(before);
  });
  it.each(['information', 'warning', 'blocker'] as const)('requires every active %s issue resolved', async (severity) => {
    drafts.issues.add({ id: 'active', type: 'information', severity, target: { kind: 'repository', id: 'source' }, message: 'Resolve me', resolutionActions: [], createdAt: new Date().toISOString() }); const before = await snapshot(); await expect(prepare()).rejects.toThrow(/issues/i); expect(await snapshot()).toEqual(before);
  });
  it('checks unresolved overrides independently of dismissed issues', async () => { const override = await drafts.applyOverride(draftId, { target: 'color', category: 'color', value: 'red' }); drafts.issues.resolve(`override:${override.id}`); await expect(prepare()).rejects.toThrow(/override|ready/i); });
  it('invalidates approval on draft revision change', async () => { const approval = await approve(); await drafts.setPreviewValue(draftId, 'checked', true); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/revision|stale/i); expect(await snapshot()).toEqual(before); });
  it('rejects changed persisted approval', async () => { const approval = await approve(), path = service.approvalPath(approval.id); const record = JSON.parse(await readFile(path, 'utf8')); record.approval.draftRevision = 99; await writeFile(path, JSON.stringify(record)); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/approval|stale|revision/i); expect(await snapshot()).toEqual(before); });
});
describe('isolated source branches', () => {
  it('writes only canonical exact tokens while preserving dirty staged and untracked source files', async () => {
    await replace(); const approval = await approve('byol/checkbox'); await writeFile(join(repository, 'Checkbox.tsx'), original + '// unsaved\n'); git('add', 'Checkbox.tsx'); await writeFile(join(repository, 'notes.txt'), 'local'); const before = await snapshot();
    const result = await writeApprovedBranch(service, approval.id); expect(result.branchName).toBe('byol/checkbox'); expect(git('show', 'byol/checkbox:Checkbox.tsx')).toBe(original.replace('tokens.color.border', 'tokens.color.accent').trim()); expect(git('diff', 'main', 'byol/checkbox', '--name-only')).toBe('Checkbox.tsx'); const after = await snapshot(); expect({ ...after, refs: before.refs, objects: before.objects }).toEqual(before); expect(git('rev-parse', 'byol/checkbox^')).toBe(before.head); expect(result.verification.notices).toHaveLength(4); expect(result.notices.join(' ')).toMatch(/pull.request|remote/i);
  });
  it('creates a branch for unchanged drafts without invented changes', async () => { const before = await snapshot(); const result = await writeApprovedBranch(service, (await approve()).id); expect(git('rev-parse', result.branchName)).toBe(before.head); expect(git('diff', 'main', result.branchName)).toBe(''); });
  it.each(['HEAD', 'base'] as const)('rejects %s drift without source mutation', async (kind) => {
    if (kind === 'base') { git('branch', 'feature'); git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'); git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'main')); git('switch', 'feature'); await reload(); }
    const approval = await approve(); if (kind === 'base') git('update-ref', 'refs/heads/main', git('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'upstream')); else { await writeFile(join(repository, 'new.txt'), 'upstream'); git('add', '.'); git('commit', '-m', 'upstream'); }
    const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/drift|stale|commit/i); expect(await snapshot()).toEqual(before);
  });
  it('rejects post-approval collision and never moves the existing ref', async () => { const approval = await approve('byol/collision'); git('branch', 'byol/collision'); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/exist|collision/i); expect(await snapshot()).toEqual(before); });
  it.each(['-bad', '../escape', 'main', 'byol/a;touch marker', 'refs/heads/bad', 'byol/../x'])('rejects unsafe or colliding branch %s', async (branchName) => { const before = await snapshot(); await expect(prepare(branchName)).rejects.toThrow(); expect(await snapshot()).toEqual(before); });
  it('blocks approval reuse', async () => { const approval = await approve(); await writeApprovedBranch(service, approval.id); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/exist|used|completed|collision/i); expect(await snapshot()).toEqual(before); });
  it('rejects storage symlink escape', async () => { await rm(join(project, '.byol/integration'), { recursive: true, force: true }); await symlink(repository, join(project, '.byol/integration')); const before = await snapshot(); await expect(prepare()).rejects.toThrow(/symlink|contain|directory/i); expect(await snapshot()).toEqual(before); });
});
describe('native verification gates', () => {
  it('runs detected build/typecheck/test/a11y in isolation without lifecycle hooks', async () => {
    await scripts({ build: 'node -e "require(\'fs\').writeFileSync(\'built.txt\', \'yes\')"', typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"', a11y: 'node -e "process.exit(0)"', prebuild: 'node -e "process.exit(1)"' }); const approval = await approve(), before = await snapshot(); const report = await verifyInIsolatedWorktree(service, approval.id); expect(report.passed).toBe(true); expect(report.commands.map((command) => command.kind)).toEqual(['build', 'typecheck', 'test', 'a11y']); expect(report.commands.every((command) => command.passed)).toBe(true); expect(report.notices).toEqual([]); expect(await snapshot()).toEqual(before); await expect(readFile(join(repository, 'built.txt'))).rejects.toThrow();
  });
  it('reports absent commands without harness generation', async () => { const before = await snapshot(), report = await verifyInIsolatedWorktree(service, (await approve()).id); expect(report.passed).toBe(true); expect(report.commands).toEqual([]); expect(report.notices).toHaveLength(4); expect(await snapshot()).toEqual(before); });
  it('leaves source refs/index/HEAD/files untouched when verification fails', async () => { await scripts({ test: 'node -e "process.exit(1)"' }); const approval = await approve(), before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/verification/i); expect(await snapshot()).toEqual(before); });
  it('times out verification without source mutation', async () => { await scripts({ test: 'node -e "setInterval(() => {}, 1000)"' }); const approval = await approve(), before = await snapshot(); const report = await verifyInIsolatedWorktree(service, approval.id, { timeoutMs: 150 }); expect(report.passed).toBe(false); expect(report.commands[0]).toMatchObject({ passed: false, timedOut: true }); expect(await snapshot()).toEqual(before); });
  it('rejects altered proposal content despite previous passing verification', async () => { await replace(); const approval = await approve(); await verifyInIsolatedWorktree(service, approval.id); const path = service.approvalPath(approval.id), record = JSON.parse(await readFile(path, 'utf8')); record.proposal.changes[0].after += '\n// injected'; await writeFile(path, JSON.stringify(record)); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/proposal|approval|integrity|change/i); expect(await snapshot()).toEqual(before); });
});


describe('security and exact-source regressions', () => {
  it('binds deterministic commit author and committer dates to the approval event', async () => {
    await replace(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2020-01-02T03:04:05.000Z'));
    const approval = await approve(); vi.useRealTimers(); const result = await writeApprovedBranch(service, approval.id);
    expect(git('show', '-s', '--format=%aI %cI', result.commit).split(' ').map((date) => new Date(date).toISOString())).toEqual(['2020-01-02T03:04:05.000Z', '2020-01-02T03:04:05.000Z']);
  });
  it('rejects a default base with incompatible committed dependencies', async () => {
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'); git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'main')); git('switch', '-c', 'feature');
    await writeFile(join(repository, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { incompatible: '2.0.0' } })); git('add', '.'); git('commit', '-m', 'dependency change'); await reload();
    const before = await snapshot(); await expect(prepare()).rejects.toThrow(/base|conflict|dependenc/i); expect(await snapshot()).toEqual(before);
  });
  it('rejects committed symlinks before repository scripts execute', async () => {
    await symlink(project, join(repository, 'escape')); git('add', '.'); git('commit', '-m', 'symlink'); await reload(); const before = await snapshot();
    await expect(prepare()).rejects.toThrow(/symlink|submodule/i); expect(await snapshot()).toEqual(before);
  });
  it('never runs Git checkout/commit hooks or repository-configured filters', async () => {
    const hook = join(repository, '.git/hooks/post-checkout'); await writeFile(hook, '#!/bin/sh\ntouch "' + join(repository, 'hook-trap') + '"\n', { mode: 0o755 });
    await writeFile(join(repository, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    git('config', 'filter.trap.smudge', 'touch "' + join(repository, 'filter-trap') + '"');
    await writeFile(join(repository, '.gitattributes'), '*.tsx filter=trap\n'); git('add', '.'); git('commit', '-m', 'attributes'); await reload(); await replace();
    await writeApprovedBranch(service, (await approve()).id);
    await expect(readFile(join(repository, 'hook-trap'))).rejects.toThrow(); await expect(readFile(join(repository, 'filter-trap'))).rejects.toThrow();
  });
  it('rejects an active repository switch after approval', async () => {
    const approval = await approve(); const other = join(root, 'other'); await mkdir(other); execFileSync('git', ['init', '-b', 'main', other]);
    execFileSync('git', ['-C', other, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '--allow-empty', '-m', 'other']); await connectRepository({ kind: 'local', path: other });
    const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/active|connect/i); expect(await snapshot()).toEqual(before);
  });
  it('rejects malformed command definitions before approval or execution', async () => {
    await writeFile(join(repository, 'package.json'), '{"scripts":{"test":42}}'); git('add', '.'); git('commit', '-m', 'malformed scripts'); await reload();
    const before = await snapshot(); await expect(prepare()).rejects.toThrow(/command|script/i); expect(await snapshot()).toEqual(before);
  });
  it('fails verification when a script changes tracked candidate files', async () => {
    await scripts({ test: 'node -e "require(\'fs\').appendFileSync(\'Checkbox.tsx\', \'// mutation\')"' }); await replace(); const approval = await approve(), before = await snapshot();
    await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/verification/i); expect(await snapshot()).toEqual(before);
  });
  it('preserves the exact CSS composite expression and unrelated bytes', async () => {
    await writeFile(join(repository, 'Checkbox.tsx'), "import './styles.css';\n" + original);
    const css = '.checkbox { border: 1px solid var(--border, #000); color: var(--text); }\n';
    await writeFile(join(repository, 'styles.css'), css); git('add', '.'); git('commit', '-m', 'css source');
    const connection = await connectRepository({ kind: 'local', path: repository }), component = (await discoverComponents(connection))[0], manifest = await buildComponentManifest(component.id);
    drafts = await DraftService.open({ projectRoot: project, sessionId: 'css', tokenIndex: [...manifest.tokens, { category: 'border', token: '2px solid var(--accent-border, #fff)' }] }); draftId = (await drafts.createDraft(manifest)).id; service = await IntegrationService.open({ projectRoot: project, drafts, connection });
    const override = await drafts.applyOverride(draftId, { target: 'border', category: 'border', value: '3px dashed red' }); await drafts.resolveOverride(draftId, override.id, { action: 'replace-with-existing-token', token: '2px solid var(--accent-border, #fff)' });
    const result = await writeApprovedBranch(service, (await approve()).id); expect(git('show', result.branchName + ':styles.css')).toBe('.checkbox { border: 2px solid var(--accent-border, #fff); color: var(--text); }'); expect(git('diff', 'main', result.branchName, '--name-only')).toBe('styles.css');
  });
  it('blocks ambiguous repeated bindings instead of changing a different occurrence', async () => {
    await writeFile(join(repository, 'Checkbox.tsx'), original + 'const other = { color: tokens.color.border };\n'); git('add', '.'); git('commit', '-m', 'duplicate'); await reload();
    const override = await drafts.applyOverride(draftId, { target: 'token-binding:0', category: 'color', value: '#abc' }); await drafts.resolveOverride(draftId, override.id, { action: 'replace-with-existing-token', token: 'tokens.color.accent' }); const before = await snapshot(); await expect(prepare()).rejects.toThrow(/ambiguous/i); expect(await snapshot()).toEqual(before);
  });
});


describe('last-boundary state guarantees', () => {
  it.each(['collision', 'drift'] as const)('rejects concurrent %s before importing even loose source objects', async (kind) => {
    await replace(); const approval = await approve('byol/atomic'), { proposal } = await service.assertCurrent(approval.id);
    await isolatedWorktree(await service.sourceRoot(), proposal, async (isolated) => {
      await isolatedGit(isolated, ['add', '--', 'Checkbox.tsx']); await isolatedGit(isolated, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'candidate']); const commit = (await isolatedGit(isolated, ['rev-parse', 'HEAD'])).trim();
      if (kind === 'collision') git('branch', 'byol/atomic'); else git('commit', '--allow-empty', '-m', 'concurrent source update');
      const before = await snapshot(); await expect(publishBranch(await service.sourceRoot(), isolated, proposal, commit)).rejects.toThrow(/collision|drift/i); expect(await snapshot()).toEqual(before);
    });
  });
  it('cleans the entire isolated worktree after an operation fails', async () => {
    const approval = await approve(), { proposal } = await service.assertCurrent(approval.id); let isolated = '';
    const before = await snapshot(); await expect(isolatedWorktree(await service.sourceRoot(), proposal, async (path) => { isolated = path; throw new Error('fixture failure'); })).rejects.toThrow('fixture failure'); await expect(readFile(join(isolated, 'Checkbox.tsx'))).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  });
  it('requires a recorded approval before commands or repository writes', async () => {
    const before = await snapshot(); await expect(writeApprovedBranch(service, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  });
  it('refuses approval after new issues or revision changes without persisting authorization', async () => {
    const proposal = await prepare(); await drafts.setPreviewValue(draftId, 'checked', true); const before = await snapshot(); await expect(approveIntegration(service, proposal.id, 'Approve integration')).rejects.toThrow(/stale|revision/i); expect(await service.listApprovals()).toEqual([]); expect(await snapshot()).toEqual(before);
  });
  it('rechecks every issue after approval', async () => {
    const approval = await approve(); drafts.issues.add({ id: 'late', type: 'information', severity: 'information', target: { kind: 'repository', id: 'source' }, message: 'Late issue', resolutionActions: [], createdAt: new Date().toISOString() }); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/issues/i); expect(await snapshot()).toEqual(before);
  });
  it.each([0, -1, 1.5, NaN, 300001])('rejects invalid timeout %s before source mutation', async (timeoutMs) => {
    const approval = await approve(), before = await snapshot(); await expect(verifyInIsolatedWorktree(service, approval.id, { timeoutMs })).rejects.toThrow(/timeout/i); expect(await snapshot()).toEqual(before);
  });
  it.each([
    { scripts: { 'type-check': 'tsc', 'test:unit': 'vitest', 'test:a11y': 'axe' }, expected: ['typecheck', 'test', 'a11y'] },
    { scripts: { 'check:types': 'tsc', 'test:accessibility': 'axe' }, expected: ['typecheck', 'a11y'] },
    { scripts: { accessibility: 'axe' }, expected: ['a11y'] },
  ])('detects repository command aliases $expected', ({ scripts, expected }) => {
    expect(detectVerificationCommands(JSON.stringify({ scripts })).commands.map((command) => command.kind)).toEqual(expected);
  });
});

it('recognizes configured remotes even before remote tracking refs exist', async () => {
  git('remote', 'add', 'origin', 'https://github.com/example/design-system.git'); const result = await writeApprovedBranch(service, (await approve()).id); expect(result.notices.join(' ')).not.toMatch(/no .*remote.*configured/i);
});

it('revalidates source branch selection even if its commit has not changed', async () => {
  const approval = await approve(); git('switch', '-c', 'other-checkout'); const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/stale/i); expect(await snapshot()).toEqual(before);
});

it('checks draft revision again at the locked pre-import publication boundary', async () => {
  await replace(); const approval = await approve(), { proposal } = await service.assertCurrent(approval.id);
  await isolatedWorktree(await service.sourceRoot(), proposal, async (isolated) => {
    await isolatedGit(isolated, ['add', '--', 'Checkbox.tsx']); await isolatedGit(isolated, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'candidate']); const commit = (await isolatedGit(isolated, ['rev-parse', 'HEAD'])).trim(), before = await snapshot();
    await expect(publishBranch(await service.sourceRoot(), isolated, proposal, commit, async () => { await drafts.setPreviewValue(draftId, 'checked', true); await service.assertCurrent(approval.id); })).rejects.toThrow(/stale|revision/i); expect(await snapshot()).toEqual(before);
  });
});


describe('review regressions', () => {
  it('rejects a blocker inserted by a microtask after async approval derivation', async () => {
    await replace(); const approval = await approve(), originalAssert = service.assertCurrent.bind(service); let calls = 0;
    vi.spyOn(service, 'assertCurrent').mockImplementation(async (id) => {
      const record = await originalAssert(id);
      if (++calls === 3) queueMicrotask(() => drafts.issues.add({ id: 'microtask-blocker', type: 'validation', severity: 'blocker', target: { kind: 'draft', id: draftId }, message: 'Late blocker', resolutionActions: [], createdAt: new Date().toISOString() }));
      return record;
    });
    const before = await snapshot(); await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/issue|ready|stale/i); expect(await snapshot()).toEqual(before);
  });
  it('rejects chmod by an otherwise passing verification script before importing any objects', async () => {
    await scripts({ test: 'node -e "require(\'fs\').chmodSync(\'Checkbox.tsx\', 0o755)"' }); await replace(); const approval = await approve(), before = await snapshot();
    await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/verification|mode|tree/i); expect(await snapshot()).toEqual(before);
  });
  it.each([Buffer.from([0xe9]), Buffer.from([0xc3, 0x28]), Buffer.from([0xff, 0xfe])])('fails closed on non-UTF-8 source bytes %j before approval or verification', async (bytes) => {
    const beforeBytes = Buffer.concat([Buffer.from(original), Buffer.from('// unrelated: '), bytes, Buffer.from('\n')]);
    await writeFile(join(repository, 'Checkbox.tsx'), beforeBytes); git('add', '.'); git('commit', '-m', 'encoded source'); await reload(); await replace(); const before = await snapshot();
    await expect(prepare()).rejects.toThrow(/encoding|UTF-8/i); expect(await service.listApprovals()).toEqual([]); expect(await readFile(join(repository, 'Checkbox.tsx'))).toEqual(beforeBytes); expect(await snapshot()).toEqual(before);
  });
  it('preserves unrelated valid multibyte UTF-8 and BOM bytes exactly', async () => {
    const beforeBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('// é 漢字 🪷\r\n' + original)]);
    await writeFile(join(repository, 'Checkbox.tsx'), beforeBytes); git('add', '.'); git('commit', '-m', 'utf8 source'); await reload(); await replace(); const result = await writeApprovedBranch(service, (await approve()).id);
    const actual = execFileSync('git', ['-C', repository, 'show', result.branchName + ':Checkbox.tsx']); expect(actual).toEqual(Buffer.from(beforeBytes.toString('utf8').replace('tokens.color.border', 'tokens.color.accent')));
  });
  it.each(['finite', 'indefinite'] as const)('bounds timeout even when a detached %s descendant inherits output pipes', async (kind) => {
    const approval = await approve(), { proposal } = await service.assertCurrent(approval.id), pidPath = join(project, 'escaped-pid'); let checkout = '', pid = 0;
    const killEscaped = async () => { try { pid ||= Number(await readFile(pidPath, 'utf8')); process.kill(-pid, 'SIGKILL'); } catch {} };
    const safety = setTimeout(() => { void killEscaped(); }, 2200);
    try {
      const result = await isolatedWorktree(await service.sourceRoot(), proposal, async (path) => {
        checkout = path;
        const descendant = kind === 'finite' ? 'setTimeout(() => {}, 1800)' : 'setInterval(() => {}, 1000)';
        const script = `const child=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:['ignore',process.stdout,process.stderr]});require('fs').writeFileSync(${JSON.stringify(pidPath)},String(child.pid));child.unref();`;
        const start = performance.now(), report = await runCommand(path, process.execPath, ['-e', script], 150); expect(performance.now() - start).toBeLessThan(1000); return report;
      });
      expect(result).toMatchObject({ passed: false, timedOut: true }); await expect(readFile(join(checkout, 'Checkbox.tsx'))).rejects.toThrow();
    } finally { clearTimeout(safety); await killEscaped(); }
  }, 6000);
});

it.each(['success', 'failure'] as const)('releases the selected draft and shared-issue publication lease after %s', async (outcome) => {
  const revision = drafts.getDraft(draftId).revision, issue = { id: 'lease-issue', type: 'validation' as const, severity: 'blocker' as const, target: { kind: 'draft', id: draftId }, message: 'New issue', resolutionActions: [], createdAt: new Date().toISOString() };
  const release = await drafts.acquireIntegrationLease(draftId, revision);
  let caught: unknown;
  try {
    await expect(drafts.setPreviewValue(draftId, 'checked', true)).rejects.toThrow(/integration|publication/i); expect(() => drafts.issues.add(issue)).toThrow(/integration|publication/i);
    if (outcome === 'failure') throw new Error('fixture abort');
  } catch (error) { caught = error; }
  finally { release(); }
  if (outcome === 'failure') expect(caught).toMatchObject({ message: 'fixture abort' }); else expect(caught).toBeUndefined();
  await drafts.setPreviewValue(draftId, 'checked', true); expect(drafts.getDraft(draftId).revision).toBe(revision + 1); drafts.issues.add(issue); expect(drafts.issues.count()).toBe(1); drafts.issues.resolve(issue.id); expect(drafts.issues.count()).toBe(0);
});
it.each(['mode', 'path', 'type', 'content'] as const)('rejects unapproved staged candidate %s changes', async (kind) => {
  await replace(); const approval = await approve(), { proposal } = await service.assertCurrent(approval.id), before = await snapshot();
  await isolatedWorktree(await service.sourceRoot(), proposal, async (isolated) => {
    const path = join(isolated, 'Checkbox.tsx');
    if (kind === 'mode') await chmod(path, 0o755);
    if (kind === 'path') await writeFile(join(isolated, 'unexpected.ts'), 'export const unexpected = true;');
    if (kind === 'type') { await rm(path); await symlink('tokens.ts', path); }
    if (kind === 'content') await writeFile(path, proposal.changes[0].after + '// unexpected');
    await isolatedGit(isolated, ['add', '--all']); const staged = (await isolatedGit(isolated, ['write-tree'])).trim(); await expect(assertApprovedTree(isolated, proposal, staged)).rejects.toThrow(/tree|mode|type|symlink|path|content/i);
  });
  expect(await snapshot()).toEqual(before);
});

it.each(['success', 'failure'] as const)('releases publication readiness after actual branch %s', async (outcome) => {
  await replace(); const approval = await approve(), before = await snapshot(), acquire = drafts.acquireIntegrationLease.bind(drafts), assertLive = service.assertLiveCurrent.bind(service); let acquired = false;
  vi.spyOn(drafts, 'acquireIntegrationLease').mockImplementation(async (id, revision) => { const release = await acquire(id, revision); acquired = true; return release; });
  vi.spyOn(service, 'assertLiveCurrent').mockImplementation((proposal) => { assertLive(proposal); if (acquired && outcome === 'failure') throw new Error('fixture publication rejection'); });
  if (outcome === 'failure') { await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow('fixture publication rejection'); expect(await snapshot()).toEqual(before); }
  else await writeApprovedBranch(service, approval.id);
  expect(acquired).toBe(true); await drafts.setPreviewValue(draftId, 'checked', true);
  drafts.issues.add({ id: 'post-publication', type: 'validation', severity: 'blocker', target: { kind: 'draft', id: draftId }, message: 'Resumed issue mutations', resolutionActions: [], createdAt: new Date().toISOString() }); expect(drafts.issues.count()).toBe(1); drafts.issues.resolve('post-publication');
});
it('checks the final staged content after a verification script configures a clean filter', async () => {
  await writeFile(join(repository, '.gitattributes'), '*.tsx filter=trap\n');
  await writeFile(join(repository, 'clean-filter.cjs'), "process.stdout.write(require('fs').readFileSync(0,'utf8').replace('tokens.color.accent','tokens.color.border'));\n");
  await scripts({ test: "git config filter.trap.clean 'node clean-filter.cjs'" }); await replace(); const approval = await approve(), before = await snapshot();
  await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/tree|content/i); expect(await snapshot()).toEqual(before);
});
it('terminates descendants that remain in the managed process group', async () => {
  const pidPath = join(project, 'managed-pid');
  const script = `const child=require('child_process').spawn(process.execPath,['-e','setInterval(() => {}, 1000)'],{stdio:'inherit'});require('fs').writeFileSync(${JSON.stringify(pidPath)},String(child.pid));setInterval(() => {},1000);`;
  const result = await runCommand(project, process.execPath, ['-e', script], 150); expect(result).toMatchObject({ passed: false, timedOut: true });
  const pid = Number(await readFile(pidPath, 'utf8')); let alive = true;
  for (let i = 0; i < 20 && alive; i++) { try { process.kill(pid, 0); await new Promise((resolve) => setTimeout(resolve, 20)); } catch { alive = false; } }
  expect(alive).toBe(false);
});

it.each(['away', 'away-and-back'] as const)('revalidates the live active repository after lease acquisition: %s', async (direction) => {
  const other = join(root, 'other-active-source'); await mkdir(other);
  execFileSync('git', ['init', '-b', 'main', other]);
  execFileSync('git', ['-C', other, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '--allow-empty', '-m', 'other source']);
  const otherGit = (...args: string[]) => execFileSync('git', ['-C', other, ...args], { encoding: 'utf8' }).trim();
  const otherBefore = { head: otherGit('rev-parse', 'HEAD'), refs: otherGit('show-ref'), index: otherGit('ls-files', '--stage'), objects: otherGit('count-objects', '-v') };
  await replace(); const approval = await approve(), before = await snapshot(), acquire = drafts.acquireIntegrationLease.bind(drafts);
  vi.spyOn(drafts, 'acquireIntegrationLease').mockImplementation(async (id, revision) => {
    const release = await acquire(id, revision);
    try { await connectRepository({ kind: 'local', path: other }); if (direction === 'away-and-back') await connectRepository({ kind: 'local', path: repository }); return release; }
    catch (error) { release(); throw error; }
  });
  if (direction === 'away') {
    await expect(writeApprovedBranch(service, approval.id)).rejects.toThrow(/active|repository|source|root/i); expect(await snapshot()).toEqual(before);
  } else {
    const result = await writeApprovedBranch(service, approval.id); expect(git('show', result.branchName + ':Checkbox.tsx')).toBe(original.replace('tokens.color.border', 'tokens.color.accent').trim()); const after = await snapshot(); expect({ ...after, refs: before.refs, objects: before.objects }).toEqual(before);
  }
  expect({ head: otherGit('rev-parse', 'HEAD'), refs: otherGit('show-ref'), index: otherGit('ls-files', '--stage'), objects: otherGit('count-objects', '-v') }).toEqual(otherBefore);
  await drafts.setPreviewValue(draftId, 'checked', true);
  drafts.issues.add({ id: 'after-active-switch', type: 'validation', severity: 'blocker', target: { kind: 'draft', id: draftId }, message: 'Lease released after active repository switch', resolutionActions: [], createdAt: new Date().toISOString() }); expect(drafts.issues.count()).toBe(1); drafts.issues.resolve('after-active-switch');
});

it('checks the canonical active root in the synchronous publication guard', async () => {
  const proposal = await prepare(), before = await snapshot(), moved = join(root, 'moved-source'), replacement = join(root, 'replacement-root'); await mkdir(replacement);
  await rename(repository, moved); await symlink(replacement, repository);
  try { expect(() => service.assertLiveCurrent(proposal)).toThrow(/root|canonical|contain/i); }
  finally { await rm(repository); await rename(moved, repository); }
  expect(await snapshot()).toEqual(before);
});
