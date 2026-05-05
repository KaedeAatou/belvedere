// Belvedere — 共通定数

export const RITUAL_LABELS = {
  planning: 'プランニング',
  daily: 'デイリースクラム',
  refinement: 'バックログリファインメント',
  review: 'スプリントレビュー',
  retrospective: 'ふりかえり',
} as const;

export const STATUS_LABELS = {
  backlog: 'バックログ',
  todo: '未着手',
  'in-progress': '進行中',
  review: 'レビュー',
  done: '完了',
} as const;

export const PRIORITY_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
} as const;
