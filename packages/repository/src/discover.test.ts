import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentManifestSchema, RepositoryConnectionSchema } from '@byol/core';
import { connectRepository } from './connect';
import { discoverComponents, buildComponentManifest } from './discover';
import { resolveRepositoryPath } from './safe-path';

const fixture = fileURLToPath(new URL('../test/fixtures/mande-system', import.meta.url));
let sandbox: string;
let repository: string;
function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', repository, ...args], { encoding: 'utf8' }).trim();
}
async function commit(): Promise<void> {
  git('add', '.');
  git('commit', '-m', 'fixture');
}
async function checkbox() {
  const connection = await connectRepository({ kind: 'local', path: repository });
  const components = await discoverComponents(connection);
  const component = components.find((entry) => entry.name === 'Checkbox');
  expect(component).toBeDefined();
  return { connection, components, component: component! };
}
beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'byol-repository-'));
  repository = join(sandbox, 'mande-system');
  await cp(fixture, repository, { recursive: true });
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  await commit();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(sandbox, { recursive: true, force: true });
});

describe('safe repository connections', () => {
  it('returns schema-valid canonical metadata and stable local identity', async () => {
    const alias = join(sandbox, 'alias');
    await symlink(repository, alias);
    const connection = await connectRepository({ kind: 'local', path: alias });
    expect(RepositoryConnectionSchema.parse(connection)).toEqual(connection);
    expect(connection).toMatchObject({ kind: 'local', name: 'mande-system', path: await realpath(repository), defaultBranch: 'main' });
    expect((await connectRepository({ kind: 'local', path: repository })).id).toBe(connection.id);
  });

  it('clones GitHub through the same non-interactive adapter into a managed cache without checkout', async () => {
    // Host Git rewrite supplies a deterministic local remote without network/auth.
    const config = join(sandbox, 'gitconfig');
    await writeFile(config, `[url "file://${repository}"]\n  insteadOf = https://github.com/mande/system.git\n`);
    vi.stubEnv('GIT_CONFIG_GLOBAL', config);
    const projectRoot = join(sandbox, 'project');
    await mkdir(projectRoot);
    const connection = await connectRepository({ kind: 'github', url: 'https://github.com/mande/system.git' }, { projectRoot });
    expect(RepositoryConnectionSchema.parse(connection)).toEqual(connection);
    expect(connection).toMatchObject({ kind: 'github', owner: 'mande', repository: 'system', url: 'https://github.com/mande/system.git', defaultBranch: 'main' });
    expect(connection).not.toHaveProperty('path');
    const components = await discoverComponents(connection);
    expect(components.map((entry) => entry.name)).toContain('Checkbox');
    const cache = join(projectRoot, '.byol/cache/repositories', connection.id);
    await expect(readFile(join(cache, 'src/components/Checkbox.tsx'))).rejects.toThrow();
    expect((await buildComponentManifest(components.find((entry) => entry.name === 'Checkbox')!.id)).source.commit).toBe(git('rev-parse', 'HEAD'));
    expect((await connectRepository({ kind: 'github', url: connection.kind === 'github' ? connection.url : '' }, { projectRoot })).id).toBe(connection.id);
    expect((await connectRepository({ kind: 'github', url: 'https://github.com/Mande/System' }, { projectRoot })).id).toBe(connection.id);
  });

  it.each([
    'https://user:secret@github.com/mande/system',
    'https://github.com/mande/system?token=secret',
    'https://github.com/mande/system#secret',
    'https://example.com/mande/system',
    'file:///tmp/repo',
    'https://github.com/mande/system/extra',
  ])('rejects unsafe or non-GitHub URL %s', async (url) => {
    await expect(connectRepository({ kind: 'github', url }, { projectRoot: sandbox })).rejects.toThrow();
  });

  it('switches the single active repository and rejects discovery or manifest access through the old connection', async () => {
    const first = await checkbox();
    const other = join(sandbox, 'another-system');
    await cp(repository, other, { recursive: true });
    const secondConnection = await connectRepository({ kind: 'local', path: other });
    expect(secondConnection.id).not.toBe(first.connection.id);
    await expect(discoverComponents(first.connection)).rejects.toThrow(/active|connect/i);
    await expect(buildComponentManifest(first.component.id)).rejects.toThrow(/active|connect/i);
    const secondComponents = await discoverComponents(secondConnection);
    expect(secondComponents.every((component) => component.repositoryId === secondConnection.id)).toBe(true);
    expect((await buildComponentManifest(secondComponents.find((component) => component.name === 'Checkbox')!.id)).repositoryId).toBe(secondConnection.id);

    const reconnected = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(secondConnection)).rejects.toThrow(/active|connect/i);
    expect((await discoverComponents(reconnected)).map((component) => component.name)).toContain('Checkbox');
  });

  it('keeps the active repository when a replacement connection fails validation', async () => {
    const { connection } = await checkbox();
    await expect(connectRepository({ kind: 'local', path: join(sandbox, 'missing') })).rejects.toThrow();
    expect((await discoverComponents(connection)).map((component) => component.name)).toContain('Checkbox');
  });

  it('rejects credential fields instead of persisting them', async () => {
    await expect(connectRepository({ kind: 'local', path: repository, token: 'secret' } as never)).rejects.toThrow();
  });

  it('rejects a subdirectory masquerading as a repository root', async () => {
    await expect(connectRepository({ kind: 'local', path: join(repository, 'src') })).rejects.toThrow();
  });

  it('rejects an escaping cache symlink before cloning or creating directories outside the project', async () => {
    const projectRoot = join(sandbox, 'project');
    const outside = join(sandbox, 'outside');
    await mkdir(projectRoot);
    await mkdir(outside);
    await symlink(outside, join(projectRoot, '.byol'));
    await expect(connectRepository({ kind: 'github', url: 'https://github.com/mande/system' }, { projectRoot })).rejects.toThrow(/outside|escape|contain/i);
    await expect(readFile(join(outside, 'cache/repositories'))).rejects.toThrow();
  });
});

describe('canonical containment', () => {
  it('accepts a contained canonical path', async () => {
    expect(await resolveRepositoryPath(repository, 'src/components/../components/Checkbox.tsx')).toBe(join(await realpath(repository), 'src/components/Checkbox.tsx'));
  });
  it.each(['../mande-system-other/secret.ts', '../secret.ts', '/etc/passwd'])('rejects path escape %s', async (path) => {
    await expect(resolveRepositoryPath(repository, path)).rejects.toThrow(/outside|escape|relative/i);
  });
  it('rejects a symlink escape before reading its target', async () => {
    await writeFile(join(sandbox, 'secret.ts'), 'secret');
    await symlink(join(sandbox, 'secret.ts'), join(repository, 'src/escape.ts'));
    await expect(resolveRepositoryPath(repository, 'src/escape.ts')).rejects.toThrow(/outside|escape|contain/i);
  });
});

describe('static committed-source discovery', () => {
  it('discovers the exported Checkbox once and excludes stories, tests and helpers', async () => {
    const { components } = await checkbox();
    expect(components.filter((entry) => entry.name === 'Checkbox')).toHaveLength(1);
    expect(components.map((entry) => entry.name)).not.toContain('Disabled');
    expect(components.map((entry) => entry.name)).not.toContain('cn');
  });

  it('builds the reviewed manifest shape pinned to its source commit', async () => {
    const { connection, component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(ComponentManifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifest).toMatchObject({ schemaVersion: 1, id: component.id, repositoryId: connection.id, name: 'Checkbox', source: { path: 'src/components/Checkbox.tsx', commit: git('rev-parse', 'HEAD'), exportName: 'Checkbox' } });
  });

  it('retains exact source token references and only evidenced states', async () => {
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.tokens).toEqual(expect.arrayContaining([
      { property: 'borderColor', category: 'color', token: 'tokens.color.border' },
      { property: 'width', category: 'size', token: 'tokens.size.control' },
      { property: 'background', category: 'color', token: 'var(--mande-color-surface)' },
    ]));
    expect(manifest.states).toEqual(expect.arrayContaining([
      { name: 'disabled', evidence: expect.arrayContaining(['src/components/Checkbox.tsx', 'src/components/Checkbox.stories.tsx', 'src/components/Checkbox.test.tsx']) },
      { name: 'checked', evidence: expect.arrayContaining(['src/components/Checkbox.tsx', 'src/components/Checkbox.stories.tsx']) },
    ]));
    expect(manifest.states.map((state) => state.name)).not.toContain('loading');
  });

  it('collects source, stories/tests, shared primitives, assets and cycle-safe transitive dependencies', async () => {
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.dependencies).toEqual(expect.arrayContaining([
      { specifier: 'react' },
      { specifier: '@radix-ui/react-checkbox' },
      { specifier: './BaseControl', path: 'src/components/BaseControl.tsx' },
      { specifier: '../tokens', path: 'src/tokens/index.ts' },
      { specifier: '../utils/cn', path: 'src/utils/cn.ts' },
      { specifier: './cycle', path: 'src/utils/cycle.ts' },
      { specifier: './Checkbox.stories.tsx', path: 'src/components/Checkbox.stories.tsx' },
      { specifier: './Checkbox.test.tsx', path: 'src/components/Checkbox.test.tsx' },
    ]));
    expect(manifest.assets).toContainEqual({ path: 'src/assets/check.svg', type: 'image/svg+xml' });
    expect(manifest.dependencies.filter((dep) => dep.path === 'src/utils/cn.ts')).toHaveLength(1);
  });

  it('never executes component code, package scripts, hooks, or Git fsmonitor', async () => {
    const sentinel = join(sandbox, 'executed');
    const script = join(repository, 'trap.sh');
    await writeFile(script, `#!/bin/sh\nprintf executed >> '${sentinel}'\n`);
    await chmod(script, 0o755);
    await writeFile(join(repository, '.git/hooks/post-checkout'), await readFile(script));
    await chmod(join(repository, '.git/hooks/post-checkout'), 0o755);
    git('config', 'core.fsmonitor', script);
    await writeFile(join(repository, 'package.json'), JSON.stringify({ scripts: { prepare: script, preinstall: script, postinstall: script, build: script, test: script }, dependencies: { react: '19.0.0' } }));
    await commit();
    const before = git('status', '--porcelain');
    const { component } = await checkbox();
    await buildComponentManifest(component.id);
    expect(git('status', '--porcelain')).toBe(before);
    await expect(readFile(sentinel)).rejects.toThrow();
  });

  it('reads the committed snapshot instead of attributing dirty source to HEAD', async () => {
    const { component } = await checkbox();
    await writeFile(join(repository, 'src/components/Checkbox.tsx'), 'throw new Error("uncommitted module must not run");');
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.source.commit).toBe(git('rev-parse', 'HEAD'));
    expect(manifest.tokens).toContainEqual({ property: 'width', category: 'size', token: 'tokens.size.control' });
  });

  it('rejects a tracked symlink dependency without reading outside the repository', async () => {
    await writeFile(join(sandbox, 'secret.ts'), 'export const secret = "outside";');
    await symlink(join(sandbox, 'secret.ts'), join(repository, 'src/escape.ts'));
    await writeFile(join(repository, 'src/components/Checkbox.tsx'), "import { secret } from '../escape'; export const Checkbox = () => <input value={secret} />;");
    await commit();
    const connection = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(connection)).rejects.toThrow(/symlink|escape|outside/i);
  });

  it('discovers local named exports and named default exports through a barrel without duplicates', async () => {
    await writeFile(join(repository, 'src/components/Checkbox.tsx'), `
      const Checkbox = () => <input type="checkbox" />;
      export { Checkbox };
    `);
    await writeFile(join(repository, 'src/components/Button.tsx'), 'export default function Button() { return <button />; }');
    await writeFile(join(repository, 'src/index.ts'), "export { Checkbox } from './components/Checkbox'; export { default as Button } from './components/Button';");
    await commit();
    const { components } = await checkbox();
    expect(components.filter((entry) => entry.name === 'Checkbox')).toHaveLength(1);
    const button = components.find((entry) => entry.name === 'Button')!;
    expect(button).toBeDefined();
    expect((await buildComponentManifest(button.id)).source.exportName).toBe('default');
  });

  it('collects package imports and CommonJS/dynamic imports without evaluating package metadata or modules', async () => {
    await writeFile(join(repository, 'src/components/Checkbox.tsx'), `
      import React from 'react';
      const utility = require('../utils/cn');
      const lazy = import('../components/BaseControl');
      export const Checkbox = () => <input />;
    `);
    await commit();
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.dependencies).toEqual(expect.arrayContaining([
      { specifier: 'react' },
      { specifier: '../utils/cn', path: 'src/utils/cn.ts' },
      { specifier: '../components/BaseControl', path: 'src/components/BaseControl.tsx' },
    ]));
  });

  it('collects relative CSS assets and rejects CSS asset traversal', async () => {
    await writeFile(join(repository, 'src/assets/pattern.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(repository, 'src/components/Checkbox.css'), '.checkbox { background-image: url("../assets/pattern.svg"); }');
    await commit();
    const { component } = await checkbox();
    expect((await buildComponentManifest(component.id)).assets).toContainEqual({ path: 'src/assets/pattern.svg', type: 'image/svg+xml' });
    await writeFile(join(repository, 'src/components/Checkbox.css'), '.checkbox { background-image: url("../../../outside.svg"); }');
    await commit();
    const connection = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(connection)).rejects.toThrow(/outside|escape|unresolved/i);
  });

  it('recursively collects CSS string/url imports and their transitive assets without looping on cycles', async () => {
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.dependencies).toEqual(expect.arrayContaining([
      { specifier: './Checkbox.theme.css', path: 'src/components/Checkbox.theme.css' },
      { specifier: './Checkbox.shared.css', path: 'src/components/Checkbox.shared.css' },
    ]));
    expect(manifest.dependencies.filter((dependency) => dependency.path === 'src/components/Checkbox.theme.css')).toHaveLength(1);
    expect(manifest.assets).toContainEqual({ path: 'src/assets/focus.svg', type: 'image/svg+xml' });
    expect(manifest.tokens).toContainEqual({ property: 'outline-color', category: 'color', token: 'var(--mande-color-focus)' });
  });

  it.each(['"', "'"])('resolves minified CSS string imports using %s quotes and their transitive dependencies', async (quote) => {
    await writeFile(join(repository, 'src/components/Checkbox.css'), `@import${quote}./Checkbox.theme.css${quote};`);
    await commit();
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.dependencies).toEqual(expect.arrayContaining([
      { specifier: './Checkbox.theme.css', path: 'src/components/Checkbox.theme.css' },
      { specifier: './Checkbox.shared.css', path: 'src/components/Checkbox.shared.css' },
    ]));
    expect(manifest.assets).toContainEqual({ path: 'src/assets/focus.svg', type: 'image/svg+xml' });
    expect(manifest.tokens).toContainEqual({ property: 'outline-color', category: 'color', token: 'var(--mande-color-focus)' });
  });

  it('records bare CSS package imports as external dependencies', async () => {
    await writeFile(join(repository, 'src/components/Checkbox.css'), `
      @import "tailwindcss";
      @import "@mande/ui/tokens";
      @import "./Checkbox.theme.css";
    `);
    await commit();
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.dependencies).toEqual(expect.arrayContaining([
      { specifier: 'tailwindcss' },
      { specifier: '@mande/ui/tokens' },
      { specifier: './Checkbox.theme.css', path: 'src/components/Checkbox.theme.css' },
    ]));
  });

  it('resolves CSS web-root assets from the nearest public directory', async () => {
    await mkdir(join(repository, 'public/fonts'), { recursive: true });
    await writeFile(join(repository, 'public/fonts/InterVariable.ttf'), 'font');
    await writeFile(join(repository, 'src/components/Checkbox.css'), `
      @font-face { src: url("/fonts/InterVariable.ttf") format("truetype"); }
    `);
    await commit();
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.dependencies).toContainEqual({
      specifier: '/fonts/InterVariable.ttf',
      path: 'public/fonts/InterVariable.ttf',
    });
    expect(manifest.assets).toContainEqual({ path: 'public/fonts/InterVariable.ttf', type: 'font/ttf' });
  });

  it('rejects CSS import traversal instead of publishing an incomplete manifest', async () => {
    await writeFile(join(repository, 'src/components/Checkbox.css'), '@import "../../../outside.css";');
    await commit();
    const connection = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(connection)).rejects.toThrow(/outside|escape|unresolved/i);
  });

  it('rejects an imported CSS symlink without following its target', async () => {
    await writeFile(join(sandbox, 'outside.css'), '.outside { color: red; }');
    await symlink(join(sandbox, 'outside.css'), join(repository, 'src/components/escape.css'));
    await writeFile(join(repository, 'src/components/Checkbox.css'), '@import "./escape.css";');
    await commit();
    const connection = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(connection)).rejects.toThrow(/symlink|outside|escape/i);
  });

  it('fails explicitly for a local CSS import whose format is unsupported', async () => {
    await writeFile(join(repository, 'src/components/theme.scss'), '.checkbox { color: var(--source-token); }');
    await writeFile(join(repository, 'src/components/Checkbox.css'), '@import "./theme.scss";');
    await commit();
    const connection = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(connection)).rejects.toThrow(/unsupported.*CSS|CSS.*unsupported/i);
  });

  it('preserves exact fallback and composite CSS token expressions', async () => {
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.tokens).toEqual(expect.arrayContaining([
      { property: 'color', category: 'color', token: 'var(--mande-color-text, #000)' },
      { property: 'border', category: 'border', token: '1px solid var(--mande-border)' },
    ]));
  });

  it('retains nested and multiple token references across full CSS declaration values', async () => {
    await writeFile(join(repository, 'src/components/Checkbox.css'), `
      /* color: var(--comment-only); */
      .checkbox {
        content: "var(--string-only); still text";
        padding: calc(var(--mande-space, var(--fallback-space)) * 2) var(--mande-space-inline);
        color: var(--mande-color-text, rgb(0, 0, 0));
      }
    `);
    await commit();
    const { component } = await checkbox();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.tokens).toEqual(expect.arrayContaining([
      { property: 'padding', category: 'spacing', token: 'calc(var(--mande-space, var(--fallback-space)) * 2) var(--mande-space-inline)' },
      { property: 'color', category: 'color', token: 'var(--mande-color-text, rgb(0, 0, 0))' },
    ]));
    expect(manifest.tokens.some((token) => /comment-only|string-only/.test(token.token))).toBe(false);
  });

  it('rejects absolute source imports instead of treating them as packages', async () => {
    await writeFile(join(repository, 'src/components/Checkbox.tsx'), "import '/etc/passwd'; export const Checkbox = () => <input />;");
    await commit();
    const connection = await connectRepository({ kind: 'local', path: repository });
    await expect(discoverComponents(connection)).rejects.toThrow(/absolute|outside|escape/i);
  });

  it('keeps discovered manifests pinned across later commits and protects stored evidence from mutation', async () => {
    const { component } = await checkbox();
    const first = await buildComponentManifest(component.id);
    const originalCommit = first.source.commit;
    first.tokens.length = 0;
    first.source.path = 'modified';
    await writeFile(join(repository, 'new-file.txt'), 'new commit');
    await commit();
    const manifest = await buildComponentManifest(component.id);
    expect(manifest.source).toMatchObject({ commit: originalCommit, path: 'src/components/Checkbox.tsx' });
    expect(manifest.source.commit).not.toBe(git('rev-parse', 'HEAD'));
    expect(manifest.tokens.length).toBeGreaterThan(0);
  });

  it('ignores inherited Git directory overrides while reading the selected repository', async () => {
    vi.stubEnv('GIT_DIR', join(sandbox, 'not-the-selected-repository'));
    vi.stubEnv('GIT_WORK_TREE', sandbox);
    const { component } = await checkbox();
    expect((await buildComponentManifest(component.id)).source.path).toBe('src/components/Checkbox.tsx');
  });

  it('rejects caller mutations of connection metadata', async () => {
    const connection = await connectRepository({ kind: 'local', path: repository });
    if (connection.kind === 'local') connection.path = sandbox;
    await expect(discoverComponents(connection)).rejects.toThrow(/connect|metadata/i);
  });

  it('rejects unknown component IDs', async () => {
    await expect(buildComponentManifest('unknown')).rejects.toThrow(/unknown|discover/i);
  });
});
