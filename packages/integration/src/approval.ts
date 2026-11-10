import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, readdir, writeFile, rm, rename } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';
import ts from 'typescript';
import { IntegrationApprovalSchema, RepositoryConnectionSchema, type IntegrationApproval, type RepositoryConnection } from '@byol/core';
import type { DraftService } from '@byol/runtime';
import { assertActiveRepository, getRepositorySource } from '../../repository/src/connect';
import { parseCssSource } from '@byol/repository';
import { git, tree, blob, assertTreePath } from './worktree';
import { detectVerificationCommands, type VerificationCommand } from './verify';

export interface SourceChange { path: string; before: string; after: string }
export interface IntegrationProposal {
  id: string; draftId: string; draftRevision: number; sourceCommit: string; sourceRef: string;
  destinationRepositoryId: string; destinationName: string; baseRef: string; baseCommit: string;
  branchName: string; changes: SourceChange[]; verification: { commands: VerificationCommand[]; notices: string[] };
}
export interface ApprovedIntegration { approval: IntegrationApproval; proposal: IntegrationProposal }
export interface IntegrationServiceOptions { projectRoot: string; drafts: DraftService; connection: RepositoryConnection }
interface Span { path: string; property: string; token: string; start: number; end: number }
function propertyName(node: ts.PropertyName, file: ts.SourceFile): string { return node.getText(file).replace(/^['"]|['"]$/g, ''); }
function spans(path: string, text: string): Span[] {
  const found: Span[] = [];
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => { if (ts.isPropertyAssignment(node)) found.push({ path, property: propertyName(node.name, file), token: node.initializer.getText(file), start: node.initializer.getStart(file), end: node.initializer.getEnd() }); ts.forEachChild(node, visit); }; visit(file);
  } else if (path.endsWith('.css')) {
    // CSS declaration boundaries outside comments, quoted strings and function arguments.
    parseCssSource(text); let start = 0, depth = 0, quote = '', comment = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (comment) { if (char === '*' && text[i + 1] === '/') { comment = false; i++; } continue; }
      if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; continue; }
      if (char === '/' && text[i + 1] === '*') { comment = true; i++; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(') depth++; else if (char === ')') depth--;
      else if (depth === 0 && [';', '{', '}'].includes(char)) {
        if (char !== '{') {
          const segment = text.slice(start, i), match = /^\s*([\w-]+)\s*:\s*/.exec(segment);
          if (match) { const valueStart = start + match[0].length, token = text.slice(valueStart, i).trimEnd(); found.push({ path, property: match[1], token, start: valueStart, end: valueStart + token.length }); }
        }
        start = i + 1;
      }
    }
  }
  return found;
}
function validateReplacement(span: Span, replacement: string, text: string): void {
  if (span.path.endsWith('.css')) {
    const old = parseCssSource(`a{${span.property}:${span.token};}`).declarations;
    const next = parseCssSource(`a{${span.property}:${replacement};}`).declarations;
    if (old.length !== 1 || next.length !== 1 || next[0].property !== span.property || next[0].value !== replacement || !replacement.includes('var(')) throw new Error('Unsupported exact CSS token replacement');
  } else {
    const expression = ts.createSourceFile('token.ts', `const value = ${replacement};`, ts.ScriptTarget.Latest, true);
    const statement = expression.statements[0];
    if (!statement || !ts.isVariableStatement(statement) || expression.statements.length !== 1) throw new Error('Unsupported token expression');
    const initializer = statement.declarationList.declarations[0].initializer;
    let base = initializer;
    while (base && (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base))) base = base.expression;
    if (!initializer || initializer.getText(expression) !== replacement || !base || !ts.isIdentifier(base) || !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(replacement)) throw new Error('Unsupported exact token expression');
    const file = ts.createSourceFile(span.path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imported = file.statements.some((node) => ts.isImportDeclaration(node) && node.importClause && (node.importClause.name?.text === base!.getText(expression) || (node.importClause.namedBindings && (ts.isNamespaceImport(node.importClause.namedBindings) ? node.importClause.namedBindings.name.text === base!.getText(expression) : node.importClause.namedBindings.elements.some((element) => element.name.text === base!.getText(expression))))));
    if (!imported) throw new Error('Replacement token requires an existing source import');
  }
}
/** Local approval state is auditable data; repository content is always rederived before writes. */
export class IntegrationService {
  private constructor(readonly projectRoot: string, readonly drafts: DraftService, private readonly sourceConnection: RepositoryConnection, private readonly canonicalSourceRoot: string) {}
  get connection(): RepositoryConnection { return structuredClone(this.sourceConnection); }
  static async open(options: IntegrationServiceOptions): Promise<IntegrationService> {
    const connection = RepositoryConnectionSchema.parse(options.connection), source = await getRepositorySource(connection);
    const service = new IntegrationService(await realpath(options.projectRoot), options.drafts, connection, source.root);
    await service.directory(join(service.projectRoot, '.byol/integration')); return service;
  }
  private async directory(path: string): Promise<void> {
    const subpath = relative(this.projectRoot, path); if (isAbsolute(subpath) || subpath === '..' || subpath.startsWith(`..${sep}`)) throw new Error('Integration storage containment failure');
    let current = this.projectRoot;
    for (const part of subpath.split(sep).filter(Boolean)) { current = join(current, part); try { await mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } const stat = await lstat(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Integration storage directory must not be a symlink'); }
  }
  private async checkFile(path: string): Promise<void> { await this.directory(dirname(path)); try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Integration storage file must not be a symlink'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  private file(kind: string, id: string): string { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid integration approval ID'); return join(this.projectRoot, '.byol/integration', kind, `${id}.json`); }
  /** Persisted audit-record location, also suitable for display by host adapters. */
  approvalPath(id: string): string { return this.file('approvals', id); }
  private async save(path: string, record: unknown): Promise<void> {
    await this.checkFile(path); const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try { await writeFile(temporary, JSON.stringify(record), { flag: 'wx', mode: 0o600 }); await rename(temporary, path); } finally { await rm(temporary, { force: true }); }
  }
  private async read<T>(path: string): Promise<T> { await this.checkFile(path); return JSON.parse(await readFile(path, 'utf8')) as T; }
  async listApprovals(): Promise<IntegrationApproval[]> {
    const directory = join(this.projectRoot, '.byol/integration/approvals'); await this.directory(directory);
    const records = await Promise.all((await readdir(directory)).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name)).sort().map((name) => this.read<ApprovedIntegration>(join(directory, name)))); return records.map((record) => IntegrationApprovalSchema.parse(record.approval));
  }
  async sourceRoot(): Promise<string> { return (await getRepositorySource(this.sourceConnection)).root; }
  /** Synchronous: callers invoke this after all awaited derivation and immediately before mutation. */
  assertLiveCurrent(proposal: IntegrationProposal): void {
    assertActiveRepository(proposal.destinationRepositoryId, this.canonicalSourceRoot);
    const draft = this.drafts.getDraft(proposal.draftId);
    if (draft.revision !== proposal.draftRevision || draft.sourceCommit !== proposal.sourceCommit
      || proposal.destinationRepositoryId !== this.sourceConnection.id) throw new Error('Stale draft revision or destination at publication');
    if (this.drafts.issues.count() !== 0 || !this.drafts.isIntegrationReady(proposal.draftId)
      || this.drafts.getOverrides(proposal.draftId).length !== 0) throw new Error('Draft issues/readiness changed before publication');
  }
  private async derive(draftId: string, id: string, branchName: string): Promise<IntegrationProposal> {
    if (this.drafts.issues.count() !== 0) throw new Error('All active issues must be resolved before integration');
    if (!this.drafts.isIntegrationReady(draftId) || this.drafts.getOverrides(draftId).length) throw new Error('Draft is not integration ready; resolve overrides and tokens');
    const draft = this.drafts.getDraft(draftId), manifest = this.drafts.getSourceManifest(draftId), canonical = this.drafts.getCanonicalManifest(draftId), root = await this.sourceRoot();
    if (manifest.repositoryId !== this.sourceConnection.id || draft.sourceCommit !== manifest.source.commit) throw new Error('Destination must be the source repository');
    const sourceCommit = (await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    if (sourceCommit !== draft.sourceCommit) throw new Error('Source commit drift invalidates approval');
    let sourceRef: string; try { sourceRef = (await git(root, ['symbolic-ref', 'HEAD'])).trim(); } catch { sourceRef = 'HEAD'; }
    if (!/^(?:refs\/heads\/[A-Za-z0-9_./-]+|HEAD)$/.test(sourceRef)) throw new Error('Unsupported source branch');
    const defaultBranch = this.sourceConnection.defaultBranch;
    let baseRef = defaultBranch === 'HEAD' ? 'HEAD' : `refs/heads/${defaultBranch}`;
    let baseCommit: string;
    try { baseCommit = (await git(root, ['rev-parse', '--verify', `${baseRef}^{commit}`])).trim(); }
    catch { baseRef = `refs/remotes/origin/${defaultBranch}`; baseCommit = (await git(root, ['rev-parse', '--verify', `${baseRef}^{commit}`])).trim(); }
    if (!branchName || !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(branchName) || branchName.startsWith('refs/') || branchName.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Unsafe branch name');
    await git(root, ['check-ref-format', `refs/heads/${branchName}`]);
    if ((await git(root, ['for-each-ref', '--format=%(refname)', `refs/heads/${branchName}`])).trim().split('\n').includes(`refs/heads/${branchName}`)) throw new Error('Branch already exists (collision)');
    // Repositories containing links/submodules fail closed before checkout or command execution.
    const sourceTree = await tree(root, sourceCommit), baseTree = await tree(root, baseCommit);
    if (JSON.stringify([...sourceTree]) !== JSON.stringify([...baseTree])) throw new Error('Base/source tree conflict: refresh from the default branch before integration');
    const relevant = [...new Set([manifest.source.path, ...manifest.dependencies.flatMap((dependency) => dependency.path ? [dependency.path] : [])])];
    const texts = new Map<string, string>(); const locations: Span[] = [];
    for (const path of relevant) { assertTreePath(path); if (baseTree.get(path)?.hash !== sourceTree.get(path)?.hash) throw new Error('Base/source file conflict requires refresh'); const text = await blob(root, sourceTree, path); texts.set(path, text); locations.push(...spans(path, text)); }
    const { tokens: oldTokens, ...oldMetadata } = manifest, { tokens: nextTokens, ...nextMetadata } = canonical;
    if (JSON.stringify(oldMetadata) !== JSON.stringify(nextMetadata) || oldTokens.length !== nextTokens.length) throw new Error('Unsupported structural draft change');
    const edits = new Map<string, { start: number; end: number; token: string }[]>();
    for (let i = 0; i < oldTokens.length; i++) {
      const before = oldTokens[i], after = nextTokens[i];
      if (before.property !== after.property || before.category !== after.category) throw new Error('Unsupported token metadata change');
      if (before.token === after.token) continue;
      const candidates = locations.filter((span) => span.property === before.property && span.token === before.token);
      if (candidates.length !== 1 || oldTokens.filter((token) => token.property === before.property && token.token === before.token).length !== 1) throw new Error('Ambiguous or missing source token binding; integration blocked');
      const span = candidates[0]; validateReplacement(span, after.token, texts.get(span.path)!);
      const list = edits.get(span.path) ?? []; list.push({ start: span.start, end: span.end, token: after.token }); edits.set(span.path, list);
    }
    const changes: SourceChange[] = [];
    for (const [path, list] of [...edits].sort(([a], [b]) => a.localeCompare(b))) { const before = texts.get(path)!; let after = before; for (const edit of list.sort((a, b) => b.start - a.start)) after = after.slice(0, edit.start) + edit.token + after.slice(edit.end); changes.push({ path, before, after }); }
    const verification = detectVerificationCommands(baseTree.has('package.json') ? await blob(root, baseTree, 'package.json') : undefined);
    const proposal = { id, draftId, draftRevision: draft.revision, sourceCommit, sourceRef, destinationRepositoryId: this.sourceConnection.id, destinationName: this.sourceConnection.name, baseRef, baseCommit, branchName, changes, verification };
    this.assertLiveCurrent(proposal);
    return proposal;
  }
  async prepareIntegration(draftId: string, options: { branchName?: string } = {}): Promise<IntegrationProposal> {
    const id = randomUUID(), branchName = options.branchName ?? `codex/byol-draft-${draftId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36)}-r${this.drafts.getDraft(draftId).revision}-${id.slice(0, 8)}`;
    const proposal = await this.derive(draftId, id, branchName); this.assertLiveCurrent(proposal); await this.save(this.file('proposals', id), proposal); return structuredClone(proposal);
  }
  async approve(id: string, action: 'Approve integration'): Promise<IntegrationApproval> {
    if (action !== 'Approve integration') throw new Error('Explicit Approve integration action is required');
    const proposal = await this.read<IntegrationProposal>(this.file('proposals', id));
    const current = await this.derive(proposal.draftId, id, proposal.branchName);
    if (JSON.stringify(current) !== JSON.stringify(proposal)) throw new Error('Stale proposal; review the current revision and changes');
    const approval = IntegrationApprovalSchema.parse({ id: randomUUID(), draftId: proposal.draftId, draftRevision: proposal.draftRevision, sourceCommit: proposal.sourceCommit, destinationRepositoryId: proposal.destinationRepositoryId, approvedAt: new Date().toISOString() });
    await this.save(this.approvalPath(approval.id), { approval, proposal }); return approval;
  }
  async assertCurrent(id: string): Promise<ApprovedIntegration> {
    const record = await this.read<ApprovedIntegration>(this.approvalPath(id)); const approval = IntegrationApprovalSchema.parse(record.approval), proposal = record.proposal;
    if (approval.id !== id || approval.draftId !== proposal.draftId || approval.draftRevision !== proposal.draftRevision || approval.sourceCommit !== proposal.sourceCommit || approval.destinationRepositoryId !== proposal.destinationRepositoryId) throw new Error('Approval integrity mismatch');
    const savedProposal = await this.read<IntegrationProposal>(this.file('proposals', proposal.id));
    const current = await this.derive(approval.draftId, proposal.id, proposal.branchName);
    if (JSON.stringify(current) !== JSON.stringify(proposal) || JSON.stringify(savedProposal) !== JSON.stringify(proposal)) throw new Error('Stale approval: source/base commit, draft revision, destination or proposal changes');
    this.assertLiveCurrent(proposal);
    return { approval, proposal };
  }
}
export const approveIntegration = (service: IntegrationService, proposalId: string, action: 'Approve integration'): Promise<IntegrationApproval> => service.approve(proposalId, action);
