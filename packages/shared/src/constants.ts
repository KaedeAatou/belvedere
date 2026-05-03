// 風車 / Kazaguruma — 共通定数

export const RITUAL_LABELS = {
  planning: 'プランニング',
  daily: 'デイリースクラム',
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

// 風車の翼配置: プランニング=北 / デイリー=東 / レビュー=南 / ふりかえり=西
export const RITUAL_TO_WING = {
  planning: 'N',
  daily: 'E',
  review: 'S',
  retrospective: 'W',
} as const;

export const WIND_SOURCE_TO_DIRECTION = {
  voc: 'N',
  nps: 'N',
  support: 'N',
  'github-pr': 'E',
  'github-issue': 'E',
  slack: 'E',
  sentry: 'S',
  manual: 'W',
} as const;
