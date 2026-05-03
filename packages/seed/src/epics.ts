import type { Epic } from '@kazaguruma/shared';
import { DEFAULT_PROJECT_ID } from './projects';

const NOW = '2026-04-29T03:00:00+09:00';

/**
 * Epic = 複数の User Story を束ねる戦略単位。
 * スプリント横断で長期的に追いかける。
 *
 * 全 Epic は デフォルト Project (Belvedere Core) 配下。
 */
export const seedEpics: Epic[] = [
  {
    id: 'EP-1',
    projectId: DEFAULT_PROJECT_ID,
    name: 'スクラム儀式の運営をAIに委ねる',
    description:
      'プランニング/デイリー/リファインメント/レビュー/ふりかえりの議事・要約・転記など定型業務を AI Agent が引き受け、人は判断と対話に集中する。',
    ownerId: 'okubo',
    status: 'active',
    valueImpact: 'high',
    createdAt: NOW,
  },
  {
    id: 'EP-2',
    projectId: DEFAULT_PROJECT_ID,
    name: 'チケット品質の底上げ',
    description:
      '人が起票したチケットに対して AI が DoD・User Story 紐付け・Story Point の不足を検出し、提案する。',
    ownerId: 'kagayayuuki',
    status: 'active',
    valueImpact: 'high',
    createdAt: NOW,
  },
  {
    id: 'EP-3',
    projectId: DEFAULT_PROJECT_ID,
    name: 'デリバリーパイプラインの信頼化',
    description:
      'Cloud Run デモ環境の自動化、リリースゲートの自動チェック (OWASP Top 10 等)、CI/CD の責務分離。',
    ownerId: 'hirai',
    status: 'active',
    valueImpact: 'medium',
    createdAt: NOW,
  },
  {
    id: 'EP-4',
    projectId: DEFAULT_PROJECT_ID,
    name: '儀式の健全性可視化',
    description:
      '儀式ごとの健全性スコア (出席率/開始時刻通り/アクション数/品質充足率) を計測し、形骸化兆候を早期検出する。',
    ownerId: 'okubo',
    status: 'active',
    valueImpact: 'medium',
    createdAt: NOW,
  },
];
