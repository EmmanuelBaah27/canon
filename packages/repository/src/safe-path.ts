import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function assertContained(root: string, candidate: string): void {
  const path = relative(root, candidate);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error('Path escapes outside the repository');
  }
}

/** Resolve existing paths only; both lexical and canonical containment are required. */
export async function resolveRepositoryPath(root: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.includes('\0')) throw new Error('Expected a repository-relative path');
  const canonicalRoot = await realpath(root);
  const candidate = resolve(canonicalRoot, path);
  assertContained(canonicalRoot, candidate);
  const canonicalPath = await realpath(candidate);
  assertContained(canonicalRoot, canonicalPath);
  return canonicalPath;
}

/** Create one segment at a time, validating ancestors before any writes. */
export async function ensureContainedDirectory(root: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.includes('\0')) throw new Error('Expected a repository-relative path');
  const canonicalRoot = await realpath(root);
  const destination = resolve(canonicalRoot, path);
  assertContained(canonicalRoot, destination);
  let current = canonicalRoot;
  for (const segment of relative(canonicalRoot, destination).split(sep).filter(Boolean)) {
    const candidate = resolve(current, segment);
    try {
      current = await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(candidate);
      current = await realpath(candidate);
    }
    assertContained(canonicalRoot, current);
    if (!(await stat(current)).isDirectory()) throw new Error('Cache ancestor must be a directory');
  }
  return current;
}
