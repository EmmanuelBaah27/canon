import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import ts from 'typescript';
import { ComponentManifestSchema, type ComponentManifest, type RepositoryConnection } from '@byol/core';
import { assertActiveRepository, getRepositorySource, readGit, type RepositorySource } from './connect';
import { cssDependencies, hasCssTokenReference, parseCssSource } from './css-source';

export interface DiscoveredComponent {
  id: string;
  repositoryId: string;
  name: string;
  source: ComponentManifest['source'];
}
interface Entry { mode: string; hash: string }
interface Snapshot {
  source: RepositorySource;
  entries: Map<string, Entry>;
  text: Map<string, string>;
}
const manifests = new Map<string, ComponentManifest>();
const codePattern = /\.[cm]?[jt]sx?$/;
const evidencePattern = /\.(stories|story|test|spec)\.[cm]?[jt]sx?$/;
const assetTypes: Record<string, string> = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

function assertTreePath(path: string): void {
  if (!path || path.includes('\0') || path.includes('\\') || posix.isAbsolute(path) || path.split('/').includes('..')) {
    throw new Error('Source path escapes outside the repository');
  }
}
async function snapshot(source: RepositorySource): Promise<Snapshot> {
  const entries = new Map<string, Entry>();
  const tree = await readGit(source.root, ['ls-tree', '-r', '-z', source.commit]);
  for (const record of tree.split('\0').filter(Boolean)) {
    const match = /^(\d+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Invalid repository tree');
    const [, mode, , hash, path] = match;
    assertTreePath(path);
    entries.set(path, { mode, hash });
  }
  return { source, entries, text: new Map() };
}
async function readSource(snapshot: Snapshot, path: string): Promise<string> {
  assertTreePath(path);
  const entry = snapshot.entries.get(path);
  if (!entry) throw new Error(`Missing committed dependency: ${path}`);
  if (entry.mode !== '100644' && entry.mode !== '100755') throw new Error(`Symlink or submodule dependency is not supported: ${path}`);
  let text = snapshot.text.get(path);
  if (text === undefined) {
    // Blob hashes bypass working-tree filters, modules and symlink targets entirely.
    text = await readGit(snapshot.source.root, ['cat-file', 'blob', entry.hash]);
    snapshot.text.set(path, text);
  }
  return text;
}
function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, /x$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function imports(source: ts.SourceFile): string[] {
  const result = new Set<string>();
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) result.add(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) result.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...result];
}
function resolveImport(snapshot: Snapshot, from: string, specifier: string): string | undefined {
  if (posix.isAbsolute(specifier) || /^[A-Za-z]:[\\\/]/.test(specifier) || specifier.startsWith('file:')) throw new Error('Absolute dependency escapes repository containment');
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  assertTreePath(base);
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '/index.ts', '/index.tsx', '/index.js'];
  // TypeScript's ESM source may use .js specifiers for .ts files.
  const bases = /\.jsx?$/.test(base) ? [base, base.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx')] : [base];
  for (const candidateBase of bases) {
    for (const extension of extensions) {
      const candidate = candidateBase + extension;
      const entry = snapshot.entries.get(candidate);
      if (!entry) continue;
      if (entry.mode !== '100644' && entry.mode !== '100755') throw new Error(`Symlink or submodule dependency: ${candidate}`);
      return candidate;
    }
  }
  throw new Error(`Unresolved relative dependency ${specifier} in ${from}`);
}
function resolveCssDependency(snapshot: Snapshot, from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('/')) return resolveImport(snapshot, from, specifier);
  const webPath = specifier.slice(1);
  assertTreePath(webPath);
  let directory = posix.dirname(from);
  while (true) {
    const candidate = posix.join(directory, 'public', webPath);
    const entry = snapshot.entries.get(candidate);
    if (entry) {
      if (entry.mode !== '100644' && entry.mode !== '100755') throw new Error(`Symlink or submodule dependency: ${candidate}`);
      return candidate;
    }
    if (!directory) break;
    directory = posix.dirname(directory);
  }
  throw new Error(`Unresolved CSS web-root dependency ${specifier} in ${from}`);
}
function exportedComponents(source: ts.SourceFile): { name: string; exportName: string }[] {
  const declarations = new Map<string, ts.Node>();
  const exports = new Map<string, string>();
  function hasJsx(node: ts.Node): boolean {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
    return ts.forEachChild(node, (child) => hasJsx(child) ? true : undefined) ?? false;
  }
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const defaultExport = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      const name = statement.name?.text ?? posix.basename(source.fileName).replace(/\.[^.]+$/, '');
      declarations.set(name, statement);
      if (exported) exports.set(name, defaultExport ? 'default' : name);
    }
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      declarations.set(declaration.name.text, declaration.initializer);
      if (exported) exports.set(declaration.name.text, declaration.name.text);
    }
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) exports.set((element.propertyName ?? element.name).text, element.name.text);
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (ts.isIdentifier(statement.expression)) exports.set(statement.expression.text, 'default');
      else {
        const name = posix.basename(source.fileName).replace(/\.[^.]+$/, '');
        declarations.set(name, statement.expression);
        exports.set(name, 'default');
      }
    }
  }
  return [...exports].filter(([name]) => /^[A-Z]/.test(name) && declarations.has(name) && hasJsx(declarations.get(name)!))
    .map(([name, exportName]) => ({ name, exportName }));
}

function tokenCategory(property: string, token: string): string {
  const category = /(?:^|\.)(color|size|space|spacing|radius|font|typography|border|shadow|motion|opacity)(?:\.|$)/.exec(token)?.[1];
  if (category) return category;
  if (/(color|background|fill|stroke)/i.test(property)) return 'color';
  if (/(width|height|size)/i.test(property)) return 'size';
  if (/(margin|padding|gap)/i.test(property)) return 'spacing';
  if (/radius/i.test(property)) return 'radius';
  if (/border/i.test(property)) return 'border';
  return 'custom';
}
function collectTokens(path: string, text: string): ComponentManifest['tokens'] {
  const tokens: ComponentManifest['tokens'] = [];
  function add(property: string, token: string): void { tokens.push({ property, category: tokenCategory(property, token), token }); }
  if (codePattern.test(path)) {
    const source = parse(path, text);
    const tokenNames = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
      const clause = statement.importClause, bindings = clause?.namedBindings;
      const namedTokens = bindings && ts.isNamedImports(bindings) && bindings.elements.some((element) => (element.propertyName?.text ?? element.name.text) === 'tokens');
      // The actual imported symbol remains a token binding when its module has
      // a neutral filename, and the local name may be an alias such as palette.
      if (!/token|theme/i.test(statement.moduleSpecifier.text) && !namedTokens) continue;
      if (clause?.name) tokenNames.add(clause.name.text);
      if (bindings) {
        if (ts.isNamespaceImport(bindings)) tokenNames.add(bindings.name.text);
        else for (const element of bindings.elements) tokenNames.add(element.name.text);
      }
    }
    function visit(node: ts.Node): void {
      if (ts.isPropertyAssignment(node)) {
        const property = node.name.getText(source).replace(/^['"]|['"]$/g, '');
        const value = node.initializer;
        if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
          let base: ts.Expression = value;
          while (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base)) base = base.expression;
          if (ts.isIdentifier(base) && tokenNames.has(base.text)) add(property, value.getText(source));
        }
        if (ts.isStringLiteralLike(value)) for (const match of value.text.matchAll(/var\(\s*--[A-Za-z0-9_-]+\s*\)/g)) add(property, match[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (/\.css$/.test(path)) {
    for (const { property, value } of parseCssSource(text).declarations) {
      if (hasCssTokenReference(value)) add(property, value);
    }
  }
  return tokens;
}
function collectStates(path: string, text: string): string[] {
  const states = new Set<string>();
  const source = parse(path, text);
  const supported = new Set(['disabled', 'checked', 'indeterminate', 'selected', 'loading', 'pressed', 'expanded', 'invalid', 'required', 'readOnly']);
  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node) && supported.has(node.name.getText(source))) states.add(node.name.getText(source));
    if (ts.isPropertyAssignment(node) && supported.has(node.name.getText(source)) && node.initializer.kind === ts.SyntaxKind.TrueKeyword) states.add(node.name.getText(source));
    if (ts.isVariableStatement(node) && evidencePattern.test(path) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text.charAt(0).toLowerCase() + declaration.name.text.slice(1);
          if (supported.has(name)) states.add(name);
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['test', 'it'].includes(node.expression.text) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && supported.has(node.arguments[0].text)) states.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...states];
}
function unique<T>(items: T[]): T[] {
  return [...new Map(items.map((item) => [JSON.stringify(item), item])).values()];
}
async function makeManifest(snapshot: Snapshot, component: DiscoveredComponent): Promise<ComponentManifest> {
  const dependencies: ComponentManifest['dependencies'] = [];
  const assets: ComponentManifest['assets'] = [];
  const tokens: ComponentManifest['tokens'] = [];
  const states = new Map<string, Set<string>>();
  const visited = new Set<string>();
  async function visit(path: string, stateEvidence: boolean): Promise<void> {
    if (visited.has(path)) return;
    visited.add(path);
    const text = await readSource(snapshot, path);
    tokens.push(...collectTokens(path, text));
    if (stateEvidence && codePattern.test(path)) for (const state of collectStates(path, text)) {
      if (!states.has(state)) states.set(state, new Set());
      states.get(state)!.add(path);
    }
    const specifiers = codePattern.test(path) ? imports(parse(path, text)) : [];
    if (/\.css$/.test(path)) specifiers.push(...cssDependencies(text));
    for (const specifier of specifiers) {
      const resolved = /\.css$/.test(path)
        ? resolveCssDependency(snapshot, path, specifier)
        : resolveImport(snapshot, path, specifier);
      // The root component is already represented by source, including cycle back-edges.
      if (resolved === component.source.path) continue;
      if (resolved) {
        if (!dependencies.some((dependency) => dependency.path === resolved)) dependencies.push({ specifier, path: resolved });
        const type = assetTypes[posix.extname(resolved)];
        if (type) assets.push({ path: resolved, type });
        else if (codePattern.test(resolved) || /\.(css|json)$/.test(resolved)) await visit(resolved, false);
      } else dependencies.push({ specifier });
    }
  }
  await visit(component.source.path, true);
  const base = component.source.path.replace(/\.[^.]+$/, '');
  for (const path of snapshot.entries.keys()) {
    if (path.startsWith(`${base}.`) && evidencePattern.test(path)) {
      dependencies.push({ specifier: `./${posix.basename(path)}`, path });
      await visit(path, true);
    }
  }
  return ComponentManifestSchema.parse({
    schemaVersion: 1, ...component, tokens: unique(tokens),
    states: [...states].sort(([a], [b]) => a.localeCompare(b)).map(([name, paths]) => ({ name, evidence: [...paths].sort() })),
    dependencies: unique(dependencies).sort((a, b) => (a.path ?? a.specifier).localeCompare(b.path ?? b.specifier)),
    assets: unique(assets).sort((a, b) => a.path.localeCompare(b.path)),
  });
}

/** Index a connected repository's immutable Git snapshot using static parsing only. */
export async function discoverComponents(connection: RepositoryConnection): Promise<DiscoveredComponent[]> {
  const source = await getRepositorySource(connection);
  const files = await snapshot(source);
  const components: DiscoveredComponent[] = [];
  for (const path of [...files.entries.keys()].sort()) {
    if (!codePattern.test(path) || evidencePattern.test(path) || path.endsWith('.d.ts') || /(^|\/)(node_modules|dist|build|coverage|vendor)\//.test(path)) continue;
    for (const { name, exportName } of exportedComponents(parse(path, await readSource(files, path)))) {
      const id = createHash('sha256').update(`${connection.id}:${source.commit}:${path}:${name}`).digest('hex').slice(0, 24);
      components.push({ id, repositoryId: connection.id, name, source: { path, commit: source.commit, exportName } });
    }
  }
  // Build atomically: a failed dependency walk must not publish partial results.
  const built: ComponentManifest[] = [];
  for (const component of components) built.push(await makeManifest(files, component));
  await getRepositorySource(connection);
  for (const manifest of built) manifests.set(manifest.id, manifest);
  return components;
}

export async function buildComponentManifest(componentId: string): Promise<ComponentManifest> {
  const manifest = manifests.get(componentId);
  if (!manifest) throw new Error('Unknown component; discover its repository first');
  assertActiveRepository(manifest.repositoryId);
  // Parsing returns a copy, so callers cannot corrupt the stored source evidence.
  return ComponentManifestSchema.parse(manifest);
}

/** Read only committed, regular blobs already captured by the dependency walk. */
export async function readComponentEvidence(
  connection: RepositoryConnection,
  componentId: string,
): Promise<Record<string, string>> {
  const manifest = await buildComponentManifest(componentId);
  const source = await getRepositorySource(connection);
  if (
    manifest.repositoryId !== connection.id ||
    manifest.source.commit !== source.commit
  )
    throw new Error("Source snapshot changed; reconnect before preview");
  const files = await snapshot(source);
  const paths = new Set([
    manifest.source.path,
    ...manifest.dependencies.flatMap((d) => (d.path ? [d.path] : [])),
    ...manifest.states.flatMap((s) => s.evidence),
    ...manifest.assets
      .filter((a) => a.type === "image/svg+xml")
      .map((a) => a.path),
  ]);
  const result: Record<string, string> = {};
  for (const path of paths) result[path] = await readSource(files, path);
  return result;
}
