// notesInColumn の直接 unit テスト (F-16 / 2026-07-08)。
//
// バグ: RetroScreen の notesIn() が column でしか絞らず、KPT ノートがスプリントを
// 跨いで累積表示され「今回の振り返り」が区別できなかった。
// 列 + 由来スプリントで絞る純粋関数に切り出し、退化入力 (sprintNumber 未設定ノート /
// active スプリント無し) を含めて最安レイヤで固定する (.claude/rules/testing.md §1)。

import { describe, it, expect } from 'vitest';
import type { RetroNote } from '@belvedere/shared';
import { notesInColumn } from '~/composables/useRetroNotes';

const note = (over: Partial<RetroNote> & { id: string }): RetroNote => ({
  workspaceId: 'ws',
  sprintNumber: 13,
  column: 'keep',
  text: over.id,
  authorId: 'u-1',
  votes: [],
  createdAt: '2026-05-18T10:00:00+09:00',
  createdBy: 'u-1',
  ...over,
});

describe('notesInColumn (F-16 — 現スプリントのノートだけ表示)', () => {
  it('column と sprintNumber の両方で絞る', () => {
    const notes = [
      note({ id: 'n-keep-13', column: 'keep', sprintNumber: 13 }),
      note({ id: 'n-keep-12', column: 'keep', sprintNumber: 12 }), // 前スプリント → 出さない
      note({ id: 'n-try-13', column: 'try', sprintNumber: 13 }),   // 別列 → 出さない
    ];
    expect(notesInColumn(notes, 'keep', 13).map((n) => n.id)).toEqual(['n-keep-13']);
  });

  it('votes 降順で返す', () => {
    const notes = [
      note({ id: 'n-1', votes: ['a'] }),
      note({ id: 'n-2', votes: ['a', 'b', 'c'] }),
      note({ id: 'n-3', votes: ['a', 'b'] }),
    ];
    expect(notesInColumn(notes, 'keep', 13).map((n) => n.id)).toEqual(['n-2', 'n-3', 'n-1']);
  });

  it('退化入力: activeSprintNumber=null (active 無し) は sprint で絞らない (ノートを隠さない)', () => {
    const notes = [
      note({ id: 'n-12', sprintNumber: 12 }),
      note({ id: 'n-13', sprintNumber: 13 }),
    ];
    expect(notesInColumn(notes, 'keep', null).map((n) => n.id).sort()).toEqual(['n-12', 'n-13']);
  });

  it('退化入力: sprintNumber 未設定 (legacy) のノートは絞り込み時に含めない', () => {
    // 型上は必須だが古い実データには欠落がありうる。どのスプリント由来か判定できない。
    const legacy = { ...note({ id: 'n-legacy' }) } as { sprintNumber?: number };
    delete legacy.sprintNumber;
    const notes = [legacy as RetroNote, note({ id: 'n-13', sprintNumber: 13 })];
    expect(notesInColumn(notes, 'keep', 13).map((n) => n.id)).toEqual(['n-13']);
  });

  it('退化入力: 空配列は空配列', () => {
    expect(notesInColumn([], 'try', 13)).toEqual([]);
  });
});
