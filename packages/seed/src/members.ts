import type { Member } from '@kazaguruma/shared';

export const seedMembers: Member[] = [
  { userId: 'kagayayuuki', workspaceId: 'kazaguruma', displayName: '加賀谷', email: 'kagayayuuki@example.com', role: 'owner', slackUserId: 'U001', githubUsername: 'kagayayuuki' },
  { userId: 'okubo', workspaceId: 'kazaguruma', displayName: '大久保', email: 'okubo@example.com', role: 'sm', slackUserId: 'U002' },
  { userId: 'hirai', workspaceId: 'kazaguruma', displayName: '平井', email: 'hirai@example.com', role: 'dev', slackUserId: 'U003' },
  { userId: 'uehara', workspaceId: 'kazaguruma', displayName: '上原', email: 'uehara@example.com', role: 'po', slackUserId: 'U004' },
  { userId: 'hayashi', workspaceId: 'kazaguruma', displayName: '林', email: 'hayashi@example.com', role: 'dev', slackUserId: 'U005' },
];
