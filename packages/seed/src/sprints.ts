import type { Sprint } from '@belvedere/shared';

// workspaceId は 'ws-belvedere' (projects.ts / members.ts と一致)
// Phase 1-B IDOR fix で全 entity が workspaceId を持つ必要があるため追加 (2026-06-10)
export const seedSprints: Sprint[] = [
  {
    id: 'sprint-12',
    workspaceId: 'ws-belvedere',
    number: 12,
    startsAt: '2026-04-08T00:00:00+09:00',
    endsAt: '2026-04-21T23:59:59+09:00',
    goal: 'PRレビューLLMの誤検出率10%以下にする',
    capacity: 30,
    velocity: 27,
    status: 'completed',
  },
  {
    id: 'sprint-13',
    workspaceId: 'ws-belvedere',
    number: 13,
    startsAt: '2026-04-22T00:00:00+09:00',
    endsAt: '2026-05-05T23:59:59+09:00',
    goal: '儀式健全性ダッシュボードのMVPを公開、チケット品質スコアの常設化',
    capacity: 32,
    status: 'active',
  },
  {
    id: 'sprint-14',
    workspaceId: 'ws-belvedere',
    number: 14,
    startsAt: '2026-05-06T00:00:00+09:00',
    endsAt: '2026-05-19T23:59:59+09:00',
    goal: 'リリースゲートとパイプライン分離。ドメインに乗せる',
    capacity: 32,
    status: 'planned',
  },
];
