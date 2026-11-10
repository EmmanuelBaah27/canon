import { describe, expect, it } from 'vitest';
import type { Issue } from '@byol/core';
import { IssueService, type IssueEvent } from './issues';

const issue = (id: string, type: Issue['type'], severity: Issue['severity']): Issue => ({
  id, type, severity, draftId: 'draft', target: { kind: 'component', id: 'Checkbox' },
  message: 'Needs review', resolutionActions: ['resolve'], createdAt: '2026-11-10T00:00:00.000Z',
});

describe('unified issue service', () => {
  it('counts all severities and categories, filters active types, and immediately removes resolutions', () => {
    const service = new IssueService();
    service.add(issue('1', 'override', 'warning'));
    service.add(issue('2', 'information', 'information'));
    service.add(issue('3', 'validation', 'blocker'));
    expect(service.count()).toBe(3);
    expect(service.filters()).toEqual(['override', 'information', 'validation']);
    expect(service.list({ type: 'override', draftId: 'draft' }).map((entry) => entry.id)).toEqual(['1']);
    expect(service.list({ severity: 'blocker' }).map((entry) => entry.id)).toEqual(['3']);
    service.resolve('1');
    expect(service.count()).toBe(2);
    expect(service.filters()).toEqual(['information', 'validation']);
    expect(service.list().some((entry) => entry.id === '1')).toBe(false);
  });

  it('emits auto-expand only for newly added blockers without replay or duplicate loops', () => {
    const service = new IssueService();
    const events: IssueEvent[] = [];
    const unsubscribe = service.subscribe((event) => events.push(event));
    service.add(issue('warning', 'override', 'warning'));
    service.add(issue('info', 'information', 'information'));
    service.add(issue('blocker', 'token-gap', 'blocker'));
    service.add(issue('blocker', 'token-gap', 'blocker'));
    service.add(issue('warning', 'override', 'blocker'));
    service.resolve('blocker');
    expect(events.filter((event) => event.autoExpand).map((event) => event.issue.id)).toEqual(['blocker']);
    expect(events.at(-1)).toMatchObject({ kind: 'resolved', count: 2, autoExpand: false });
    unsubscribe();
    service.add(issue('new', 'validation', 'blocker'));
    expect(events).toHaveLength(6);
  });

  it('validates and detaches input, list results, and event payloads', () => {
    const service = new IssueService();
    service.subscribe((event) => { event.issue.target.id = 'changed by subscriber'; });
    const input = issue('1', 'dependency', 'warning');
    service.add(input);
    input.target.id = 'caller mutation';
    service.list()[0].target.id = 'list mutation';
    expect(service.list()[0].target.id).toBe('Checkbox');
    expect(() => service.add({ ...input, severity: 'invalid' } as never)).toThrow();
    expect(service.count()).toBe(1);
  });
});
