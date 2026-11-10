import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, lstat, realpath, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import type { IntegrationProposal } from './approval';
const execute = promisify(execFile);

/** Ignore ambient Git redirection/configuration and repository hooks, filters and monitors. */
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('GIT_')) delete env[name];
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false' };
}
const gitArguments = (root: string, args: string[]) => ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', '-c', 'protocol.ext.allow=never', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'commit.gpgSign=false', '-c', 'core.autocrlf=false', '-C', root, ...args];
export async function git(root: string, args: string[], commitDate?: string): Promise<string> {
  try {
    return (await execute('git', gitArguments(root, args), { encoding: 'utf8', env: { ...gitEnvironment(), ...(commitDate ? { GIT_COMMITTER_DATE: commitDate } : {}) }, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })).stdout;
  } catch { throw new Error(`Integration Git operation failed: ${args[0]}`); }
}
export interface PublicationLease { assertCurrent(): void; release(): void }
/** Lock and verify all approved refs before importing any objects into the source. */
export async function publishBranch(source: string, isolated: string, proposal: IntegrationProposal, commit: string, preImport?: () => Promise<PublicationLease | void>): Promise<void> {
  const checks = new Map([[proposal.sourceRef, proposal.sourceCommit], [proposal.baseRef, proposal.baseCommit]]);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', gitArguments(source, ['update-ref', '--stdin']), { env: { ...gitEnvironment(), GIT_ALTERNATE_OBJECT_DIRECTORIES: join(isolated, '.git/objects') }, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', importing = false, failure: Error | undefined;
    let importTask: Promise<void> | undefined, lease: PublicationLease | void;
    const timer = setTimeout(() => { failure = new Error('Branch publication timed out'); child.kill('SIGKILL'); }, 60_000);
    child.stderr.resume(); child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (!importing && output.includes('prepare: ok')) {
        importing = true;
        importTask = (async () => {
          try {
            lease = await preImport?.();
            lease?.assertCurrent();
            if (proposal.changes.length) await git(source, ['fetch', '--no-write-fetch-head', '--no-tags', '--no-recurse-submodules', '--', isolated, commit]);
            child.stdin.end('commit\n');
          } catch (error) { failure = error instanceof Error ? error : new Error('Branch object import failed'); child.stdin.end('abort\n'); }
        })();
      }
    });
    child.on('error', () => { failure = new Error('Branch publication process failed'); });
    child.on('close', async (code) => { clearTimeout(timer); await importTask; lease?.release(); if (failure || code !== 0 || !output.includes('commit: ok')) reject(failure ?? new Error('Branch collision or source/base commit drift at publication')); else resolve(); });
    child.stdin.write('start\n' + [...checks].map(([ref, hash]) => `verify ${ref} ${hash}\n`).join('') + `create refs/heads/${proposal.branchName} ${commit}\nprepare\n`);
  });
}
export function assertTreePath(path: string): void {
  if (!path || path.includes('\0') || path.includes('\\') || posix.isAbsolute(path) || path.split('/').some((part) => part === '..' || part === '.' || !part) || path.split('/').some((part) => part.toLowerCase() === '.git')) throw new Error('Unsafe repository path or containment escape');
}
export async function tree(root: string, commit: string): Promise<Map<string, { mode: string; hash: string }>> {
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('Expected full source commit');
  const entries = new Map<string, { mode: string; hash: string }>();
  for (const record of (await git(root, ['ls-tree', '-r', '-z', commit])).split('\0').filter(Boolean)) {
    const match = /^(\d+) (?:blob|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Invalid source tree');
    const [, mode, hash, path] = match; assertTreePath(path);
    if (mode !== '100644' && mode !== '100755') throw new Error('Symlink or submodule source tree is unsupported for integration');
    entries.set(path, { mode, hash });
  }
  return entries;
}
export async function blob(root: string, entries: Awaited<ReturnType<typeof tree>>, path: string): Promise<string> {
  assertTreePath(path); const entry = entries.get(path); if (!entry) throw new Error(`Missing committed source: ${path}`);
  const bytes = await blobBytes(root, entry.hash);
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error(`Unsupported source encoding: expected valid UTF-8 in ${path}`); }
}
export async function blobBytes(root: string, hash: string): Promise<Buffer> {
  if (!/^[0-9a-f]{40,64}$/.test(hash)) throw new Error('Invalid source blob hash');
  try { return (await execute('git', gitArguments(root, ['cat-file', 'blob', hash]), { encoding: 'buffer', env: gitEnvironment(), timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })).stdout; }
  catch { throw new Error('Integration Git blob read failed'); }
}
/** An independent Git worktree avoids even transient writes to source .git/worktrees. */
export async function isolatedWorktree<T>(sourceRoot: string, proposal: IntegrationProposal, operation: (root: string) => Promise<T>): Promise<T> {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'byol-verification-')));
  const root = join(temporary, 'repository');
  try {
    await git(temporary, ['clone', '--no-checkout', '--no-local', '--no-hardlinks', '--no-recurse-submodules', '--template=', '--', sourceRoot, root]);
    await git(root, ['checkout', '--detach', proposal.baseCommit]);
    for (const change of proposal.changes) {
      assertTreePath(change.path); const destination = join(root, change.path), stat = await lstat(destination);
      if (!stat.isFile() || stat.isSymbolicLink() || await realpath(destination) !== destination || await readFile(destination, 'utf8') !== change.before) throw new Error('Isolated source file drift or containment failure');
      await writeFile(destination, change.after, 'utf8');
    }
    return await operation(root);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export interface CommandResult { passed: boolean; timedOut: boolean; exitCode: number | null }
/** Kill the process group on timeout/output overflow, including npm's script children. */
export async function runCommand(root: string, executable: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd: root, env: { ...gitEnvironment(), npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' }, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false, overflow = false, bytes = 0, finished = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const kill = () => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Process group already exited. */ } };
    const finish = (exitCode: number | null) => {
      if (finished) return;
      finished = true; clearTimeout(timer); if (grace) clearTimeout(grace); kill();
      // Escaped sessions may retain inherited pipes forever. Never wait on them.
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolve({ passed: exitCode === 0 && !timedOut && !overflow, timedOut, exitCode });
    };
    const stop = () => { kill(); grace ??= setTimeout(() => { kill(); finish(null); }, 100); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const count = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) { overflow = true; stop(); } };
    child.stdout.on('data', count); child.stderr.on('data', count);
    child.on('error', () => finish(null)); child.on('close', finish);
  });
}
