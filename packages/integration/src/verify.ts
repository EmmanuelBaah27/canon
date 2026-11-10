import { readFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { IntegrationService, IntegrationProposal } from './approval';
import { git, tree, isolatedWorktree, runCommand } from './worktree';
export type VerificationKind = 'build' | 'typecheck' | 'test' | 'a11y';
export interface VerificationCommand { kind: VerificationKind; script: string; command: string }
export interface VerificationCommandResult extends VerificationCommand { passed: boolean; timedOut: boolean; exitCode: number | null }
export interface VerificationReport { passed: boolean; commands: VerificationCommandResult[]; notices: string[] }
export interface VerificationOptions { timeoutMs?: number }
export function detectVerificationCommands(packageText?: string): { commands: VerificationCommand[]; notices: string[] } {
  const commands: VerificationCommand[] = [], notices: string[] = [];
  const aliases: Record<VerificationKind, string[]> = { build: ['build'], typecheck: ['typecheck', 'type-check', 'check:types'], test: ['test', 'test:unit'], a11y: ['a11y', 'test:a11y', 'test:accessibility', 'accessibility'] };
  const parsed: unknown = packageText === undefined ? {} : JSON.parse(packageText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid verification package manifest');
  const scripts = (parsed as { scripts?: unknown }).scripts ?? {};
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) throw new Error('Invalid verification scripts');
  for (const kind of ['build', 'typecheck', 'test', 'a11y'] as const) {
    const script = aliases[kind].find((name) => Object.hasOwn(scripts, name));
    if (!script) { notices.push(`No existing ${kind} command; v1 does not generate verification harnesses.`); continue; }
    const command = (scripts as Record<string, unknown>)[script];
    if (typeof command !== 'string' || !command.trim()) throw new Error(`Invalid ${kind} verification command`);
    commands.push({ kind, script, command });
  }
  return { commands, notices };
}
export function verificationTimeout(options: VerificationOptions): number {
  const timeout = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 300_000) throw new Error('Verification timeout must be an integer between 1 and 300000 ms');
  return timeout;
}
function contentHash(bytes: Buffer, sampleHash: string): string {
  return createHash(sampleHash.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
async function expectedTree(root: string, proposal: IntegrationProposal) {
  const expected = await tree(root, proposal.baseCommit);
  for (const change of proposal.changes) {
    const entry = expected.get(change.path);
    if (!entry) throw new Error('Approved path missing from source tree');
    expected.set(change.path, { mode: entry.mode, hash: contentHash(Buffer.from(change.after, 'utf8'), entry.hash) });
  }
  return expected;
}
export async function assertApprovedTree(root: string, proposal: IntegrationProposal, revision: string): Promise<void> {
  const expected = await expectedTree(root, proposal), actual = await tree(root, revision);
  if (JSON.stringify([...actual]) !== JSON.stringify([...expected])) throw new Error('Candidate tree contains unapproved path, mode, type or content changes');
}
export async function assertApprovedFiles(root: string, proposal: IntegrationProposal): Promise<void> {
  const expected = await expectedTree(root, proposal);
  for (const [path, entry] of expected) {
    const destination = join(root, path), stat = await lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(destination) !== destination
      || ((stat.mode & 0o100) ? '100755' : '100644') !== entry.mode
      || contentHash(await readFile(destination), entry.hash) !== entry.hash) throw new Error('Verification altered approved path, mode, type or content');
  }
  if ((await git(root, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', '-z'])).length !== 0) throw new Error('Verification altered the approved index');
  if ((await git(root, ['rev-parse', 'HEAD'])).trim() !== proposal.baseCommit) throw new Error('Verification changed isolated HEAD');
}
export async function verifyCheckout(root: string, proposal: IntegrationProposal, options: VerificationOptions = {}): Promise<VerificationReport> {
  const timeout = verificationTimeout(options), results: VerificationCommandResult[] = [];
  // Commands come from the immutable, visible proposal, not a possibly modified checkout.
  for (const command of proposal.verification.commands) {
    const result = await runCommand(root, 'npm', ['--ignore-scripts', 'run', command.script, '--'], timeout);
    results.push({ ...command, ...result }); if (!result.passed) break;
  }
  let passed = results.every((result) => result.passed);
  try { await assertApprovedFiles(root, proposal); } catch { passed = false; }
  return { passed, commands: results, notices: [...proposal.verification.notices] };
}
export async function verifyInIsolatedWorktree(service: IntegrationService, approvalId: string, options: VerificationOptions = {}): Promise<VerificationReport> {
  verificationTimeout(options); const { proposal } = await service.assertCurrent(approvalId);
  return isolatedWorktree(await service.sourceRoot(), proposal, async (root) => {
    const report = await verifyCheckout(root, proposal, options); await service.assertCurrent(approvalId); return report;
  });
}
