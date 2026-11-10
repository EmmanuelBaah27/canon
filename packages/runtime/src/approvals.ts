import { createHash } from 'node:crypto';
import { DraftApprovalSchema, DesignFindingSchema, type DesignFinding, type DraftApproval } from '@byol/core';

function exactValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && Number.isNaN(value)) return 'number:NaN';
  const serialized = JSON.stringify(value, Object.keys(value && typeof value === 'object' && !Array.isArray(value) ? value as object : {}).sort());
  return `${typeof value}:${serialized}`;
}

function binding(finding: DesignFinding): Omit<DraftApproval, 'id' | 'approver' | 'rationale' | 'approvedAt'> {
  return {
    repositoryId: finding.repositoryId,
    sourceCommit: finding.sourceCommit,
    draftId: finding.draftId,
    draftRevision: finding.draftRevision,
    componentId: finding.componentId,
    ruleId: finding.ruleId,
    property: finding.property,
    exactValue: exactValue(finding.currentValue),
  };
}

export function approvalResolves(approvalInput: DraftApproval, findingInput: DesignFinding): boolean {
  const approval = DraftApprovalSchema.parse(structuredClone(approvalInput));
  const finding = DesignFindingSchema.parse(structuredClone(findingInput));
  return JSON.stringify(binding(finding)) === JSON.stringify({
    repositoryId: approval.repositoryId, sourceCommit: approval.sourceCommit, draftId: approval.draftId,
    draftRevision: approval.draftRevision, componentId: approval.componentId, ruleId: approval.ruleId,
    property: approval.property, exactValue: approval.exactValue,
  });
}

export class ApprovalService {
  private readonly approvals = new Map<string, DraftApproval>();

  approve(input: { finding: DesignFinding; approver: string; rationale: string; approvedAt?: string }): DraftApproval {
    const finding = DesignFindingSchema.parse(structuredClone(input.finding));
    const tuple = binding(finding);
    const id = createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
    const approval = DraftApprovalSchema.parse({
      id, ...tuple, approver: input.approver, rationale: input.rationale,
      approvedAt: input.approvedAt ?? new Date().toISOString(),
    });
    this.approvals.set(id, approval);
    return structuredClone(approval);
  }

  resolves(input: DesignFinding): boolean {
    const finding = DesignFindingSchema.parse(structuredClone(input));
    const tuple = binding(finding);
    const id = createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
    return this.approvals.has(id);
  }

  list(): DraftApproval[] { return structuredClone([...this.approvals.values()]); }
  clearDraft(draftId: string): void {
    for (const [id, approval] of this.approvals) if (approval.draftId === draftId) this.approvals.delete(id);
  }
}
