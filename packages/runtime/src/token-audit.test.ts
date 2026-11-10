import { describe, expect, it } from 'vitest';
import { IssueSchema } from '@byol/core';
import { auditTokens } from './token-audit';
import { manifest, tokenIndex } from './test-fixtures';

describe('strict token audits', () => {
  it('retains exact Mande references, composite expressions, and source fallback literals', () => {
    const baseline = JSON.stringify(manifest);
    expect(auditTokens(manifest, tokenIndex)).toEqual([]);
    expect(JSON.stringify(manifest)).toBe(baseline);
  });

  it.each(['color', 'typography', 'typeface', 'radius', 'spacing', 'size', 'border', 'elevation', 'shadow', 'opacity', 'motion', 'layering', 'layout', 'breakpoint', 'grid', 'container', 'iconography', 'state', 'accessibility'])('blocks missing or literal evidence for relevant %s usage', (category) => {
    const issues = auditTokens(manifest, tokenIndex, { draftId: 'draft', usages: [{ property: 'custom', category, value: 0 }] });
    expect(issues).toHaveLength(1);
    expect(IssueSchema.parse(issues[0])).toMatchObject({ draftId: 'draft', type: 'token-gap', severity: 'blocker', target: { kind: 'token', id: 'custom' } });
  });

  it('rejects unknown, wrong-category, and approximated token references without guessing', () => {
    const input = { ...manifest, tokens: [
      { property: 'color', category: 'color', token: 'tokens.color.missing' },
      { property: 'width', category: 'size', token: 'tokens.color.border' },
      { property: 'border', category: 'border', token: '1px  solid var(--mande-border)' },
    ] };
    expect(auditTokens(input, tokenIndex)).toHaveLength(3);
  });

  it('audits extra usages together with manifest bindings, without requiring unused categories', () => {
    expect(auditTokens(manifest, tokenIndex, { usages: [{ property: 'background', category: 'color', token: 'tokens.color.accent' }] })).toEqual([]);
    expect(auditTokens({ ...manifest, tokens: [] }, [])).toEqual([]);
    const issues = auditTokens(manifest, tokenIndex, { usages: [{ property: 'motion', category: 'motion' }] });
    expect(issues).toHaveLength(1);
    expect(issues[0].target.id).toBe('motion');
  });
});
