import type { Epic } from '@belvedere/shared';
import { DEFAULT_PROJECT_ID } from './projects';

const NOW = '2026-04-29T03:00:00+09:00';

/**
 * Epic = 複数の User Story を束ねる戦略単位。
 * スプリント横断で長期的に追いかける。
 *
 * 全 Epic は デフォルト Project (Belvedere Core) 配下。
 *
 * 2026-05-05 追加: rationale (戦略意図 / Why) と successMetric (達成判定の数値指標)。
 * Refinement Agent の第6観点「戦略整合性」がこれらの欠落を検出する。
 */
export const seedEpics: Epic[] = [
  {
    id: 'EP-1',
    workspaceId: 'ws-belvedere',
    projectId: DEFAULT_PROJECT_ID,
    name: 'スクラム儀式の運営をAIに委ねる',
    description:
      'プランニング/デイリー/リファインメント/レビュー/ふりかえりの議事・要約・転記など定型業務を AI Agent が引き受け、人は判断と対話に集中する。',
    rationale:
      'スクラムマスターが議事・要約・転記で週8時間消費している現状を放置すると、儀式そのものが「準備の負担」と認識されて形骸化が加速する。AI が運営を引き受けることで、人は判断と対話 (儀式本来の価値) に集中できる。',
    successMetric:
      'SM の儀式準備時間: 週8h → 週2h / 全 5 儀式の CeremonyHealthScore 平均 >= 70 を 4 連続スプリント維持',
    strategicTheme: 'Operational Leverage',
    ownerId: 'okubo',
    status: 'active',
    valueImpact: 'high',
    createdAt: NOW,
  },
  {
    id: 'EP-2',
    workspaceId: 'ws-belvedere',
    projectId: DEFAULT_PROJECT_ID,
    name: 'チケット品質の底上げ',
    description:
      '人が起票したチケットに対して AI が DoD・User Story 紐付け・Story Point の不足を検出し、提案する。',
    rationale:
      'チケット品質の不足が儀式 (特に Planning / Review) のレビュー時間を消費し、開発の停滞を引き起こす。起票時に AI が補強することで、儀式での議論をより本質的な判断 (受入条件の妥当性 / ゴール整合) に集中できる。',
    successMetric:
      'DoD 充足率: 60% → 90% / User Story 紐付け率: 50% → 95% / SP 未定チケット数: スプリント開始時 ゼロ',
    strategicTheme: 'Quality at Source',
    ownerId: 'kagayayuuki',
    status: 'active',
    valueImpact: 'high',
    createdAt: NOW,
  },
  {
    id: 'EP-3',
    workspaceId: 'ws-belvedere',
    projectId: DEFAULT_PROJECT_ID,
    name: 'デリバリーパイプラインの信頼化',
    description:
      'Cloud Run デモ環境の自動化、リリースゲートの自動チェック (OWASP Top 10 等)、CI/CD の責務分離。',
    // ※ rationale を意図的に空のまま残す (Refinement Agent の第6観点デモ用シグナル)
    successMetric: 'デモ環境セットアップ: 3h → 10min / リリース後の重大セキュリティ問題: ゼロ',
    strategicTheme: 'Delivery Reliability',
    ownerId: 'hirai',
    status: 'active',
    valueImpact: 'medium',
    createdAt: NOW,
  },
  {
    id: 'EP-4',
    workspaceId: 'ws-belvedere',
    projectId: DEFAULT_PROJECT_ID,
    name: '儀式の健全性可視化',
    description:
      '儀式ごとの健全性スコア (出席率/開始時刻通り/アクション数/品質充足率) を計測し、形骸化兆候を早期検出する。',
    rationale:
      'スクラムが「形だけ回ってる」状態は数字で示せないと、ふりかえりが体感ベースの議論に閉じてしまう。健全性スコアを 4 軸 (attendance / onTime / actionableOutputs / qualityRate) で計測することで、SM が改善判断を数字で説明でき、形骸化を早期に止められる。',
    successMetric:
      '5 儀式平均健全性: 70 以上を 4 連続スプリント維持 / SM が「次スプリントの優先改善儀式」を健全性スコアから 1 つ選定できる状態',
    strategicTheme: 'Observability of Process',
    ownerId: 'okubo',
    status: 'active',
    valueImpact: 'medium',
    createdAt: NOW,
  },
];
