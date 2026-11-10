import { createHash } from 'node:crypto';
import { DesignFindingSchema, IssueSchema, type DesignFinding, type DesignSystemManifest, type Issue } from '@byol/core';

export interface ValidateDesignContractInput {
  repositoryId: string;
  sourceCommit: string;
  draftId: string;
  draftRevision: number;
  componentId: string;
  componentPath: string;
  sources: Record<string, string>;
  manifest: DesignSystemManifest;
  tokenNames: readonly string[];
  behavioralRules: Record<string, readonly unknown[]>;
}

const visualProperties = new Set([
  'color', 'background', 'background-color', 'border', 'border-color', 'border-radius', 'borderRadius',
  'margin', 'padding', 'gap', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'font', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'box-shadow', 'transition-duration', 'animation-duration',
  'backgroundColor', 'borderColor', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'boxShadow', 'transitionDuration', 'animationDuration',
]);
const structuralProperties = new Set(['opacity', 'zIndex', 'z-index', 'order', 'flex', 'flex-grow', 'flex-shrink', 'flexGrow', 'flexShrink']);
const behaviorNames = /^(debounce|delay|dragThreshold|keyboardDelay|longPress|stateTimeout|threshold)$/i;

function location(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index).split('\n');
  return { line: before.length, column: before.at(-1)!.length + 1 };
}

function exactToken(value: string, tokens: readonly string[]): boolean {
  const variable = /var\((--[A-Za-z0-9_-]+)(?:,|\))/.exec(value)?.[1];
  if (variable) return tokens.includes(variable);
  const identifier = value.trim().replace(/[;'"`]/g, '');
  return tokens.includes(identifier);
}

function literal(value: string): boolean {
  const normalized = value.trim();
  const dimension = '-?(?:\\d*\\.)?\\d+(?:px|rem|em|%|ms|s|vh|vw|ch)?';
  return new RegExp(`^${dimension}(?:\\s+${dimension}){0,3}$`, 'i').test(normalized)
    || /^#[0-9a-f]{3,8}$/i.test(normalized)
    || /^(?:rgb|hsl|oklch|color-mix)\(/i.test(normalized)
    || /^['"`][\s\S]*['"`]$/.test(normalized);
}

function makeFinding(
  input: ValidateDesignContractInput,
  data: Omit<DesignFinding, 'id' | 'repositoryId' | 'sourceCommit' | 'draftId' | 'draftRevision' | 'componentId'>,
): DesignFinding {
  const identity = `${input.repositoryId}:${input.sourceCommit}:${input.draftId}:${input.draftRevision}:${input.componentId}:${data.ruleId}:${data.property}:${JSON.stringify(data.currentValue)}:${data.location.path}:${data.location.line}:${data.location.column}`;
  return DesignFindingSchema.parse({
    id: createHash('sha256').update(identity).digest('hex').slice(0, 24),
    repositoryId: input.repositoryId, sourceCommit: input.sourceCommit, draftId: input.draftId,
    draftRevision: input.draftRevision, componentId: input.componentId, ...data,
  });
}

function visualFinding(input: ValidateDesignContractInput, path: string, source: string, index: number, property: string, value: string, evidence: string): DesignFinding | undefined {
  if (structuralProperties.has(property) || exactToken(value, input.tokenNames)) return undefined;
  const place = { path, ...location(source, index) };
  const alternatives = input.tokenNames.filter((token) => {
    if (/color|background|border(?!-radius)/i.test(property)) return /color/i.test(token);
    if (/radius/i.test(property)) return /radius/i.test(token);
    if (/duration|animation|transition/i.test(property)) return /motion|duration/i.test(token);
    return /space|size/i.test(token);
  });
  if (!literal(value)) return makeFinding(input, {
    category: 'ambiguity', severity: 'blocker', ruleId: 'ambiguousVisualClassification', property, currentValue: value,
    location: place, evidence, applicableRule: 'Visual values must resolve to an imported token or a reviewed structural value.',
    alternatives, integrationImpact: 'Classification is uncertain and blocks integration until reviewed.', actions: ['classify', 'replace-with-token'],
  });
  return makeFinding(input, {
    category: 'visual-value', severity: 'blocker', ruleId: 'hardcodedVisualValues', property, currentValue: value,
    location: place, evidence, applicableRule: 'Use the connected design system token for visual values.', alternatives,
    integrationImpact: 'Requires token replacement or exact draft approval before integration.', actions: ['replace-with-token', 'approve'],
  });
}

export function validateDesignContract(input: ValidateDesignContractInput): DesignFinding[] {
  const findings: DesignFinding[] = [];
  for (const [path, source] of Object.entries(input.sources)) {
    if (/\.css$/i.test(path)) {
      const declaration = /([A-Za-z-]+)\s*:\s*([^;{}]+)/g;
      for (const match of source.matchAll(declaration)) {
        const property = match[1];
        if (!visualProperties.has(property)) continue;
        const finding = visualFinding(input, path, source, match.index!, property, match[2].trim(), match[0]);
        if (finding) findings.push(finding);
      }
    } else {
      const styleValue = /\b(color|background|backgroundColor|border|borderColor|borderRadius|margin|padding|gap|width|height|minWidth|maxWidth|minHeight|maxHeight|font|fontFamily|fontSize|fontWeight|lineHeight|letterSpacing|boxShadow|transitionDuration|animationDuration|opacity|zIndex|order|flex|flexGrow|flexShrink)\s*:\s*([^,}\n]+)/g;
      for (const match of source.matchAll(styleValue)) {
        const property = match[1];
        if (!visualProperties.has(property) && !structuralProperties.has(property)) continue;
        const finding = visualFinding(input, path, source, match.index!, property, match[2].trim(), match[0]);
        if (finding) findings.push(finding);
      }
      const arbitrary = /\b(rounded|bg|text|p[trblxy]?|m[trblxy]?|gap)-\[([^\]]+)\]/g;
      for (const match of source.matchAll(arbitrary)) {
        const property = match[1] === 'rounded' ? 'border-radius' : match[1] === 'bg' ? 'background-color' : match[1] === 'text' ? 'color' : match[1].startsWith('p') ? 'padding' : match[1].startsWith('m') ? 'margin' : 'gap';
        const finding = visualFinding(input, path, source, match.index!, property, match[2], match[0]);
        if (finding) findings.push(finding);
      }
      for (const match of source.matchAll(/<\s*(button|input|select|textarea)\b/gi)) {
        const tag = match[1].toLowerCase();
        if (input.manifest.components.some((root) => path === root || path.startsWith(`${root}/`))) continue;
        if (!input.manifest.components.some((candidate) => candidate.toLowerCase().includes(`/${tag}.`) || candidate.toLowerCase().endsWith(`/${tag}`))) continue;
        findings.push(makeFinding(input, {
          category: 'component-bypass', severity: 'blocker', ruleId: 'sharedComponentBypass', property: tag, currentValue: `<${tag}>`,
          location: { path, ...location(source, match.index!) }, evidence: match[0], applicableRule: `Use the connected shared ${tag} component.`, alternatives: input.manifest.components.filter((candidate) => candidate.toLowerCase().includes(tag)),
          integrationImpact: 'Bypassing an existing shared component requires replacement or exact approval.', actions: ['use-shared-component', 'approve'],
        }));
      }
    }

    for (const match of source.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*=\s*(-?(?:\d*\.)?\d+)\b/g)) {
      const property = match[1];
      if (!behaviorNames.test(property)) continue;
      const currentValue = Number(match[2]);
      const governed = Object.hasOwn(input.behavioralRules, property);
      if (governed && input.behavioralRules[property].includes(currentValue)) continue;
      findings.push(makeFinding(input, {
        category: governed ? 'behavior-rule' : 'behavioral-addition', severity: governed ? 'blocker' : 'information',
        ruleId: governed ? `behavior:${property}` : 'unknownBehavioralValues', property, currentValue,
        location: { path, ...location(source, match.index!) }, evidence: match[0],
        applicableRule: governed ? `Use an approved ${property} value.` : 'New behavioral values are recorded as notices until the system defines a rule.',
        alternatives: (input.behavioralRules[property] ?? []).map(String),
        integrationImpact: governed ? 'Requires a compliant value or exact approval.' : 'Non-blocking notice; preserve it in behavioral configuration.',
        actions: governed ? ['replace-with-approved-value', 'approve'] : ['acknowledge', 'propose-rule'],
      }));
    }
  }
  return findings;
}

export function findingToIssue(findingInput: DesignFinding, createdAt = new Date().toISOString()): Issue {
  const finding = DesignFindingSchema.parse(findingInput);
  const type: Issue['type'] = finding.category === 'ambiguity'
    ? 'ambiguity'
    : finding.category === 'behavioral-addition' ? 'behavioral-addition' : 'violation';
  return IssueSchema.parse({
    id: `design:${finding.id}`, draftId: finding.draftId, draftRevision: finding.draftRevision,
    type, severity: finding.severity, target: { kind: finding.category, id: finding.property },
    message: `${finding.applicableRule} ${finding.integrationImpact}`,
    resolutionActions: finding.actions, createdAt,
  });
}
