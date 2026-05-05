import type { Member } from '@belvedere/shared';

export const seedMembers: Member[] = [
  { userId: 'kaede', workspaceId: 'belvedere', displayName: 'Kaede', email: 'kaede@example.com', role: 'owner', slackUserId: 'U001', githubUsername: 'kaede' },
  { userId: 'okubo', workspaceId: 'belvedere', displayName: '大久保', email: 'okubo@example.com', role: 'sm', slackUserId: 'U002' },
  { userId: 'hirai', workspaceId: 'belvedere', displayName: '平井', email: 'hirai@example.com', role: 'dev', slackUserId: 'U003' },
  { userId: 'uehara', workspaceId: 'belvedere', displayName: '上原', email: 'uehara@example.com', role: 'po', slackUserId: 'U004' },
  { userId: 'hayashi', workspaceId: 'belvedere', displayName: '林', email: 'hayashi@example.com', role: 'dev', slackUserId: 'U005' },
];
