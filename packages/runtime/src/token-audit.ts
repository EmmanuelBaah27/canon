import { createHash } from 'node:crypto';
import { ComponentManifestSchema, type ComponentManifest, type Issue } from '@byol/core';

/** Exact approved source expressions, including composite CSS declarations. */
export interface SystemToken {
  category: string;
  token: string;
}

/** A relevant token/primitive usage; missing evidence and literals fail closed. */
export interface TokenUsage {
  property: string;
  category: string;
  token?: string;
  value?: unknown;
}

export interface TokenAuditOptions {
  draftId?: string;
  usages?: readonly TokenUsage[];
}

export function auditTokens(manifest: ComponentManifest, tokenIndex: readonly SystemToken[], options: TokenAuditOptions = {}): Issue[] {
  ComponentManifestSchema.parse(manifest);
  const issues = new Map<string, Issue>();
  for (const usage of [...manifest.tokens, ...options.usages ?? []]) {
    if (!Object.hasOwn(usage, 'value') && usage.token !== undefined
      && tokenIndex.some((approved) => approved.category === usage.category && approved.token === usage.token)) continue;
    const key = createHash('sha256').update(JSON.stringify([options.draftId ?? manifest.id, usage.property, usage.category, usage.token ?? null])).digest('hex');
    issues.set(key, {
      id: `token-gap:${key}`,
      ...(options.draftId === undefined ? {} : { draftId: options.draftId }),
      type: 'token-gap', severity: 'blocker',
      target: { kind: 'token', id: usage.property },
      message: `No exact approved ${usage.category} token or primitive for ${usage.property}.`,
      resolutionActions: ['replace-with-existing-token', 'propose-token'],
      createdAt: new Date().toISOString(),
    });
  }
  return [...issues.values()];
}
