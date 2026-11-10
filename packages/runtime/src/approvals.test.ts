import { describe, expect, it } from 'vitest';
import { ApprovalService } from './approvals';

const finding = {
  id: 'finding-1', category: 'visual-value' as const, severity: 'blocker' as const,
  repositoryId: 'repo', sourceCommit: 'a'.repeat(40), draftId: 'draft', draftRevision: 1,
  componentId: 'button', ruleId: 'hardcodedVisualValues', property: 'borderRadius', currentValue: 12,
  location: { path: 'src/Button.tsx', line: 1, column: 20 }, evidence: 'borderRadius:12',
  applicableRule: 'Use a design-system token.', alternatives: ['--radius-control'],
  integrationImpact: 'Requires resolution or explicit approval.', actions: ['replace-with-token', 'approve'],
};

describe('draft-scoped design approvals', () => {
  it('resolves only the exact binding tuple and retains approval metadata', () => {
    const approvals = new ApprovalService();
    const approved = approvals.approve({ finding, approver: 'owner', rationale: 'Temporary source parity' });
    expect(approved.rationale).toBe('Temporary source parity');
    expect(approvals.resolves(finding)).toBe(true);
    expect(approvals.list()).toHaveLength(1);
  });

  it.each([
    ['repositoryId', 'other'], ['sourceCommit', 'b'.repeat(40)], ['draftId', 'other'], ['draftRevision', 2],
    ['componentId', 'input'], ['ruleId', 'otherRule'], ['property', 'color'], ['currentValue', 13],
  ] as const)('invalidates when %s changes', (field, value) => {
    const approvals = new ApprovalService(); approvals.approve({ finding, approver: 'owner', rationale: 'Reviewed' });
    expect(approvals.resolves({ ...finding, [field]: value })).toBe(false);
  });

  it('does not mutate the finding or create a reusable manifest exception', () => {
    const approvals = new ApprovalService();
    const before = structuredClone(finding);
    approvals.approve({ finding, approver: 'owner', rationale: 'One draft only' });
    expect(finding).toEqual(before);
    expect(approvals.resolves({ ...finding, draftId: 'another-draft' })).toBe(false);
  });
});
