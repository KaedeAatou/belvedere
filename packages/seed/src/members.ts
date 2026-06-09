import type { Member } from '@belvedere/shared';

// workspaceId は packages/seed/src/projects.ts の 'ws-belvedere' と一致させること
// (Phase 1-B IDOR fix で member ベース workspace 解決を行うため不一致は許容できない)
export const seedMembers: Member[] = [
  { userId: 'kaede', workspaceId: 'ws-belvedere', displayName: 'Kaede', email: 'kaede@example.com', role: 'owner', slackUserId: 'U001', githubUsername: 'kaede' },
  { userId: 'okubo', workspaceId: 'ws-belvedere', displayName: '大久保', email: 'okubo@example.com', role: 'sm', slackUserId: 'U002' },
  { userId: 'hirai', workspaceId: 'ws-belvedere', displayName: '平井', email: 'hirai@example.com', role: 'dev', slackUserId: 'U003' },
  { userId: 'uehara', workspaceId: 'ws-belvedere', displayName: '上原', email: 'uehara@example.com', role: 'po', slackUserId: 'U004' },
  { userId: 'hayashi', workspaceId: 'ws-belvedere', displayName: '林', email: 'hayashi@example.com', role: 'dev', slackUserId: 'U005' },
];
