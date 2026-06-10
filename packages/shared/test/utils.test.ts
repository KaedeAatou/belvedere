// utils.ts の単体テスト (2026-06-10 / R2 で api/repo から移設・集約)。

import { describe, it, expect } from 'vitest';
import { stripUndefined, stripUndefinedPartial, generateId, applyStatusTransition } from '../src/utils';
import type { Ticket } from '../src/types';

const baseTicket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'WC-T',
  workspaceId: 'ws-belvedere',
  title: 't',
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdBy: 'human',
  ...over,
});

describe('stripUndefined (型は T のまま / repo backend 用)', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefined({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });
  it('undefined を含まない object はそのまま', () => {
    expect(stripUndefined({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });
});

describe('stripUndefinedPartial (undefined union も型から除外 / api handler 用)', () => {
  it('undefined キーを除去する', () => {
    const result = stripUndefinedPartial({ a: 'x', b: undefined, c: 1 });
    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
    expect('c' in result).toBe(true);
  });
  it('全部 undefined なら空 object', () => {
    expect(stripUndefinedPartial({ a: undefined, b: undefined })).toEqual({});
  });
});

describe('generateId', () => {
  it('prefix-base36 形式で返す', () => {
    const id = generateId('WC');
    expect(id).toMatch(/^WC-[0-9A-Z]+$/);
  });
  it('prefix が変われば接頭辞も変わる', () => {
    expect(generateId('EP').startsWith('EP-')).toBe(true);
    expect(generateId('EST').startsWith('EST-')).toBe(true);
  });
});

describe('applyStatusTransition', () => {
  const NOW = '2026-06-11T09:00:00Z';

  it('初回 in-progress で startedAt を刻む', () => {
    const r = applyStatusTransition(baseTicket(), 'in-progress', NOW);
    expect(r.status).toBe('in-progress');
    expect(r.startedAt).toBe(NOW);
    expect(r.updatedAt).toBe(NOW);
  });
  it('初回 done で completedAt を刻む', () => {
    const r = applyStatusTransition(baseTicket(), 'done', NOW);
    expect(r.completedAt).toBe(NOW);
  });
  it('既に startedAt があれば in-progress 再遷移で上書きしない', () => {
    const r = applyStatusTransition(
      baseTicket({ startedAt: '2026-06-01T00:00:00Z', status: 'review' }),
      'in-progress',
      NOW,
    );
    expect(r.startedAt).toBe('2026-06-01T00:00:00Z');
  });
  it('既に completedAt があれば done 再遷移で上書きしない', () => {
    const r = applyStatusTransition(
      baseTicket({ completedAt: '2026-06-02T00:00:00Z', status: 'review' }),
      'done',
      NOW,
    );
    expect(r.completedAt).toBe('2026-06-02T00:00:00Z');
  });
  it('todo 等への遷移では startedAt/completedAt を刻まない', () => {
    const r = applyStatusTransition(baseTicket({ status: 'backlog' }), 'todo', NOW);
    expect(r.startedAt).toBeUndefined();
    expect(r.completedAt).toBeUndefined();
  });
});
