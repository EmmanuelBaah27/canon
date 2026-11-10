import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { RepositoryConnectionSchema, type RepositoryConnection } from '@byol/core';
import { ensureContainedDirectory, resolveRepositoryPath } from './safe-path';

const execute = promisify(execFile);
export type ConnectRepositoryInput =
  | { kind: 'local'; path: string }
  | { kind: 'github'; url: string };
export interface ConnectRepositoryOptions { projectRoot?: string }
export interface RepositorySource { root: string; commit: string; connection: RepositoryConnection }
let activeSource: RepositorySource | undefined;

/** No shell, no checkout, no hooks, no repository-controlled fsmonitor. */
export async function readGit(root: string, args: string[], timeout = 30_000): Promise<string> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+|TEMPLATE_DIR|EXTERNAL_DIFF|DIFF_OPTS)$/.test(key)) delete env[key];
  }
  Object.assign(env, { GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false' });
  try {
    const { stdout } = await execute('git', [
      '--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
      '-c', 'submodule.recurse=false', '-c', 'protocol.ext.allow=never', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0',
      '-C', root, ...args,
    ], { env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    // Avoid returning Git stderr that could contain host authentication details.
    throw new Error(`Repository Git operation failed: ${args[0]}`);
  }
}

function identity(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function githubAddress(value: string): { url: string; owner: string; repository: string } {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Expected a credential-free HTTPS GitHub repository URL');
  }
  const match = /^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
  if (!match || match[2] === '.' || match[2] === '..') throw new Error('Expected a GitHub owner/repository URL');
  const owner = match[1].toLowerCase();
  const repository = match[2].toLowerCase();
  return { url: `https://github.com/${owner}/${repository}.git`, owner, repository };
}

export async function connectRepository(input: ConnectRepositoryInput, options: ConnectRepositoryOptions = {}): Promise<RepositoryConnection> {
  if (!input || typeof input !== 'object') throw new Error('Invalid repository input');
  const allowed = input.kind === 'local' ? ['kind', 'path'] : ['kind', 'url'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('Unexpected repository input field');
  let root: string;
  let metadata: { kind: 'local'; path: string } | ({ kind: 'github' } & ReturnType<typeof githubAddress>);
  let id: string;
  if (input.kind === 'local') {
    if (typeof input.path !== 'string' || !input.path.trim()) throw new Error('Repository path is required');
    root = await realpath(input.path);
    id = identity(`local:${root}`);
    metadata = { kind: 'local', path: root };
  } else if (input.kind === 'github') {
    const address = githubAddress(input.url);
    id = identity(`github:${address.url.toLowerCase()}`);
    const projectRoot = await realpath(options.projectRoot ?? process.cwd());
    const parent = await ensureContainedDirectory(projectRoot, '.byol/cache/repositories');
    const cache = join(parent, id);
    let exists = false;
    try { await lstat(cache); exists = true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!exists) {
      await readGit(parent, ['clone', '--no-checkout', '--no-recurse-submodules', '--template=', '--', address.url, cache], 120_000);
    }
    root = await resolveRepositoryPath(projectRoot, `.byol/cache/repositories/${id}`);
    const remote = (await readGit(root, ['config', '--get', 'remote.origin.url'])).trim();
    if (remote !== address.url) throw new Error('Managed cache belongs to another repository');
    metadata = { kind: 'github', ...address };
  } else {
    throw new Error('Unsupported repository kind');
  }
  const topLevel = await realpath((await readGit(root, ['rev-parse', '--show-toplevel'])).trim());
  if (topLevel !== root) throw new Error('Path must be a repository root');
  const commit = (await readGit(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
  let defaultBranch: string;
  try { defaultBranch = (await readGit(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim().replace(/^origin\//, ''); }
  catch {
    try { defaultBranch = (await readGit(root, ['symbolic-ref', '--short', 'HEAD'])).trim(); }
    catch { defaultBranch = 'HEAD'; }
  }
  const connection = RepositoryConnectionSchema.parse({
    id, name: metadata.kind === 'local' ? basename(root) : metadata.repository,
    defaultBranch, createdAt: (activeSource?.connection.id === id ? activeSource.connection.createdAt : undefined) ?? new Date().toISOString(), ...metadata,
  });
  activeSource = { root, commit, connection: RepositoryConnectionSchema.parse(connection) };
  return connection;
}

export async function getRepositorySource(connection: RepositoryConnection): Promise<RepositorySource> {
  const parsed = RepositoryConnectionSchema.parse(connection);
  const source = activeSource;
  assertActiveRepository(parsed.id);
  if (!source || JSON.stringify(source.connection) !== JSON.stringify(parsed)) throw new Error('Connect the repository before discovery');
  if (await realpath(source.root) !== source.root) throw new Error('Repository root changed or escaped containment');
  if (activeSource !== source) throw new Error('Active repository changed during discovery');
  return source;
}

export function assertActiveRepository(repositoryId: string, canonicalRoot?: string): void {
  if (activeSource?.connection.id !== repositoryId) throw new Error('Repository is not active; connect it before discovery');
  if (canonicalRoot !== undefined) {
    if (activeSource.root !== canonicalRoot) throw new Error('Active repository canonical root changed');
    try { if (realpathSync(activeSource.root) !== canonicalRoot) throw new Error('Root changed'); }
    catch { throw new Error('Active repository root changed or escaped containment'); }
  }
}
