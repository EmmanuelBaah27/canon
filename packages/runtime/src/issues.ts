import { IssueSchema, type Issue } from '@byol/core';

export interface IssueFilter {
  type?: Issue['type'];
  severity?: Issue['severity'];
  draftId?: string;
}

export interface IssueEvent {
  kind: 'added' | 'updated' | 'resolved';
  issue: Issue;
  count: number;
  autoExpand: boolean;
}

export class IssueService {
  private mutationLeases = 0;
  private readonly issues = new Map<string, Issue>();
  private readonly listeners = new Set<(event: IssueEvent) => void>();

  /** A short publication reservation; no issue can invalidate readiness while it is held. */
  acquireMutationLease(): () => void {
    this.assertMutable(); this.mutationLeases++;
    let released = false;
    return () => { if (!released) { released = true; this.mutationLeases--; } };
  }

  assertMutable(): void {
    if (this.mutationLeases) throw new Error('Issue state is reserved for integration publication; retry after completion');
  }

  add(input: Issue): void {
    this.assertMutable();
    const issue = IssueSchema.parse(structuredClone(input));
    const existing = this.issues.has(issue.id);
    this.issues.set(issue.id, issue);
    this.emit({ kind: existing ? 'updated' : 'added', issue, count: this.count(), autoExpand: !existing && issue.severity === 'blocker' });
  }

  resolve(id: string): void {
    this.assertMutable();
    const issue = this.issues.get(id);
    if (!issue) return;
    this.issues.delete(id);
    this.emit({ kind: 'resolved', issue, count: this.count(), autoExpand: false });
  }

  list(filter: IssueFilter = {}): Issue[] {
    return structuredClone([...this.issues.values()].filter((issue) =>
      (filter.type === undefined || issue.type === filter.type)
      && (filter.severity === undefined || issue.severity === filter.severity)
      && (filter.draftId === undefined || issue.draftId === filter.draftId)));
  }

  count(): number { return this.issues.size; }
  filters(): Issue['type'][] { return [...new Set([...this.issues.values()].map((issue) => issue.type))]; }

  subscribe(listener: (event: IssueEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: IssueEvent): void {
    for (const listener of this.listeners) listener(structuredClone(event));
  }
}
