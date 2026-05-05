import type { Project } from '@belvedere/shared';

const NOW = '2026-05-01T03:00:00+09:00';

/**
 * デフォルト Workspace 配下の Project 一覧。
 * 既存 fixture (EP-/US-/WC-) はすべて Belvedere Core 配下と解釈される。
 *
 * Project ごとに idPrefix を持ち、Epic/UserStory/Ticket の ID は
 * 本来 `${idPrefix}-${number}` で採番される (例: BV-101)。
 * ただし既存 seed の ID 値 (EP-/US-/WC-) は Pitch / UI / mockup 全部から
 * 参照されているため互換維持の目的で変更しない。
 *
 * 新規 Project 作成時は別 idPrefix (例: MA, API) を選び、新規 ID を
 * `${idPrefix}-${number}` で採番する想定。
 */
export const seedProjects: Project[] = [
  {
    id: 'PRJ-belvedere-core',
    workspaceId: 'ws-belvedere',
    name: 'Belvedere Core',
    idPrefix: 'BV',
    description:
      'デフォルト Project。既存 fixture (EP-1..4 / US-101..US-402 / WC-101..112) はこの配下に所属する。',
    ownerId: 'okubo',
    createdAt: NOW,
  },
];

export const DEFAULT_PROJECT_ID = 'PRJ-belvedere-core';
