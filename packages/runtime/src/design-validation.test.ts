import { describe, expect, it } from 'vitest';
import { findingToIssue, validateDesignContract } from './design-validation';

const base = {
  repositoryId: 'repo', sourceCommit: 'a'.repeat(40), draftId: 'draft', draftRevision: 2,
  componentId: 'button', componentPath: 'src/Button.tsx',
  manifest: {
    $schema: 'https://byol.dev/schemas/design-system.v1.json' as const, version: 1 as const,
    tokens: ['src/tokens.css'], components: ['src/ui/Button.tsx'], rules: ['DESIGN_SYSTEM.md'], themes: [],
    validation: { hardcodedVisualValues: 'approval' as const, sharedComponentBypass: 'approval' as const, unknownBehavioralValues: 'notice' as const },
  },
  tokenNames: ['--color-text', '--radius-control', '--space-2', '--motion-fast'],
  behavioralRules: {} as Record<string, readonly unknown[]>,
};

describe('semantic design-contract validation', () => {
  it('finds CSS values, shorthands, JSX styles, arbitrary Tailwind values, and visual motion while accepting tokens', () => {
    const findings = validateDesignContract({ ...base, sources: {
      'src/Button.tsx': `export const X=()=> <button className="rounded-[13px]" style={{color:'#123456',borderRadius:12}}/>`,
      'src/Button.css': `.x{color:var(--color-text);margin:4px 8px;transition-duration:240ms}`,
    } });
    expect(findings.filter((finding) => finding.category === 'visual-value').map((finding) => finding.property)).toEqual(expect.arrayContaining([
      'border-radius', 'color', 'borderRadius', 'margin', 'transition-duration',
    ]));
    expect(findings.some((finding) => finding.currentValue === 'var(--color-text)')).toBe(false);
  });

  it('keeps same-name token namespaces distinct and reports computed ambiguity', () => {
    const findings = validateDesignContract({ ...base, sources: {
      'src/Button.tsx': `const x={style:{color:brand.color.text,gap:computeGap()}}`,
    }, tokenNames: ['theme.color.text'] });
    expect(findings).toContainEqual(expect.objectContaining({ category: 'ambiguity', property: 'color' }));
    expect(findings).toContainEqual(expect.objectContaining({ category: 'ambiguity', property: 'gap' }));
  });

  it('requires approval for bypassing an existing shared component but permits structural values', () => {
    const findings = validateDesignContract({ ...base, sources: {
      'src/Button.tsx': `export const X=()=> <button aria-hidden tabIndex={-1} style={{zIndex:2,opacity:0}}/>`,
    } });
    expect(findings).toContainEqual(expect.objectContaining({ category: 'component-bypass', severity: 'blocker' }));
    expect(findings.some((finding) => ['zIndex', 'opacity'].includes(finding.property))).toBe(false);
  });

  it('makes unknown behavior a notice and an existing behavioral rule violation approval-required', () => {
    const source = `const debounce=320; const dragThreshold=12;`;
    const unknown = validateDesignContract({ ...base, sources: { 'src/Button.tsx': source } });
    expect(unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'behavioral-addition', severity: 'information', property: 'debounce' }),
      expect.objectContaining({ category: 'behavioral-addition', severity: 'information', property: 'dragThreshold' }),
    ]));
    const governed = validateDesignContract({ ...base, sources: { 'src/Button.tsx': source }, behavioralRules: { debounce: [200] } });
    expect(governed).toContainEqual(expect.objectContaining({ category: 'behavior-rule', severity: 'blocker', property: 'debounce' }));
    expect(governed.some((finding) => finding.category === 'behavioral-addition' && finding.property === 'debounce')).toBe(false);
    expect(findingToIssue(unknown[0], '2026-11-10T00:00:00.000Z')).toMatchObject({
      type: 'behavioral-addition', severity: 'information', draftRevision: 2,
    });
  });
});
